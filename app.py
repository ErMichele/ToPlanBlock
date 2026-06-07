import io
import os
import uuid
import cloudinary
import cloudinary.uploader
from markupsafe import Markup
import requests
import markdown
import bleach
import secrets
import json
import csv
from datetime import datetime, timedelta
from urllib.parse import urlparse
from dotenv import load_dotenv
from flask import Flask, render_template, redirect, send_file, url_for, request, flash, session, current_app, g
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
from flask_compress import Compress
from sqlalchemy.orm import joinedload, selectinload # Added selectinload
from sqlalchemy.exc import IntegrityError

load_dotenv()
app = Flask(__name__, static_folder='static', template_folder='templates')

# --- CONFIGURATION ---
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "secure-fallback-key-for-local-dev")
IS_PROD = os.getenv("BRANCH") == "production"
CLOUDINARY_FOLDER = f"ToPlanBlock/{os.getenv('BRANCH', 'dev')}"

database_url = os.getenv('DEV_DATABASE_URL', 'sqlite:///todo.db')
if IS_PROD:
    database_url = os.getenv('PRODUCTION_DATABASE_URL')

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "secure-fallback-key-for-local-dev")
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = IS_PROD
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

cloudinary.config(
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key = os.getenv('CLOUDINARY_API_KEY'),
    api_secret = os.getenv('CLOUDINARY_API_SECRET'),
    secure = True
)

app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': 15,
    'max_overflow': 25,
    'pool_recycle': 1800,
    'pool_pre_ping': True,
    'pool_timeout': 30
}

cache = Cache(app, config={'CACHE_TYPE': 'SimpleCache', 'CACHE_DEFAULT_TIMEOUT': 3600})

# --- EXTENSIONS ---
db = SQLAlchemy(app)
migrate = Migrate(app, db, render_as_batch=True)
Compress(app)
bcrypt = Bcrypt(app)
csrf = CSRFProtect(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message_category = 'warning'

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["500 per day", "100 per hour", "60 per minute"],
    storage_uri="memory://"
)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

# ---------------- Models ----------------
class User(db.Model, UserMixin):
    __tablename__ = 'user'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    profile_pic_id = db.Column(db.String(100), nullable=True) 
    created_at = db.Column(db.DateTime, default=datetime.now)
    todos = db.relationship('Todo', backref='owner', lazy=True, cascade='all, delete-orphan')
    categories = db.relationship('Category', backref='owner', lazy=True, cascade='all, delete-orphan')

    @property
    def profile_pic_url(self):
        if not self.profile_pic_id:
            return None
        folder = f"ToPlanBlock/{os.getenv('BRANCH', 'dev')}/profile_pics"
        return f"https://res.cloudinary.com/{os.getenv('CLOUDINARY_CLOUD_NAME')}/image/upload/{folder}/{self.profile_pic_id}"
    
class Category(db.Model):
    __tablename__ = 'category'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(7), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)
    is_locked = db.Column(db.Boolean, default=False, nullable=False)
    todos = db.relationship('Todo', secondary='todo_category', back_populates='categories')
    
    __table_args__ = (db.UniqueConstraint('name', 'user_id', name='_category_user_uc'),)

todo_category = db.Table(
    'todo_category',
    db.Column('todo_id', db.Integer, db.ForeignKey('todo.id'), primary_key=True), # Removed redundant standalone index
    db.Column('category_id', db.Integer, db.ForeignKey('category.id'), primary_key=True, index=True)
)

class Todo(db.Model):
    __tablename__ = 'todo'

    id = db.Column(db.Integer, primary_key=True)
    task = db.Column(db.String(200), nullable=False)
    notes = db.Column(db.Text, nullable=True)
    completed = db.Column(db.Boolean, default=False) # Removed standalone index to prioritize compound index
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False) # Removed standalone index to prioritize compound index
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False) # Removed standalone index to prioritize compound index
    categories = db.relationship('Category', secondary=todo_category, back_populates='todos')

    __table_args__ = (
        db.Index('ix_todo_user_completed_created', 'user_id', 'completed', 'created_at'),
    )

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

# --------------- Helpers ----------------
def allowed_file(filename):
    """Check if the file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def parse_categories_string(csv_string):
    """Parses a comma-separated string of categories into a clean, sanitized list of uppercase names."""
    if not csv_string:
        return []
    return [c.strip().upper() for c in csv_string.split(',') if c.strip()]

def toggle_category_string(current_str, toggle_name):
    """Helper to add/remove a category name from a comma-separated string."""
    if not current_str:
        return toggle_name
    
    parts = parse_categories_string(current_str)
    toggle_name = toggle_name.strip().upper()
    
    if toggle_name in parts:
        parts.remove(toggle_name)
    else:
        parts.append(toggle_name)
    
    return ",".join(parts)

def cleanup_unlocked_categories(user_id):
    """Deletes categories with 0 tasks that are not locked in a single query."""
    db.session.query(Category).filter(
        Category.user_id == user_id,
        Category.is_locked == False,
        ~Category.todos.any()
    ).delete(synchronize_session=False)
    db.session.commit()

@cache.cached(timeout=3600) # This function is cached for 1 hour
def github_api_request():
    """Helper to make GitHub API requests with error handling."""
    url = "https://api.github.com/repos/ermichele/toplanblock/releases"
    try:
        response = requests.get(url, headers={"User-Agent": "ToPlanBlock-App"}, timeout=1.5)
        if response.status_code == 200:
            return response.json()[:5]  # Return only the latest 5 releases
    except Exception as e:
        app.logger.error(f"GitHub API Error: {e}")
    return []

#---------------- Security Headers ----------------
@app.before_request
def set_nonce():
    g.nonce = secrets.token_urlsafe(16)

@app.after_request
def add_security_headers(response):
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    nonce = getattr(g, 'nonce', '')
    response.headers['Content-Security-Policy'] = (
        f"default-src 'self'; "
        f"script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'nonce-{nonce}'; "
        f"style-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline'; "
        f"font-src 'self' https://cdn.jsdelivr.net; " 
        f"img-src 'self' data: blob: https://res.cloudinary.com; "
        f"connect-src 'self' https://api.github.com https://cdn.jsdelivr.net; "
    )
    
    if IS_PROD:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        
    return response

#---------------- Template Filters ----------------
@app.template_filter('markdown')
def render_markdown(text):
    if not text:
        return ""
    html_content = markdown.markdown(text, extensions=[
        'fenced_code', 'tables', 'extra', 'sane_lists', 'markdown_checklist.extension'
    ])
    allowed_tags = [
        'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
        'strong', 'em', 'u', 'ul', 'ol', 'li', 'code', 'pre',
        'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'
    ]
    allowed_attrs = {
        '*': ['class'],
        'a': ['href', 'title', 'target'],
        'input': ['type', 'disabled', 'checked']
    }
    clean_html = bleach.clean(html_content, tags=allowed_tags, attributes=allowed_attrs)
    return Markup(clean_html)
    
    
# ---------------- Post Routes ----------------
@app.post('/todo/<int:todo_id>/toggle')
@login_required
def toggle(todo_id):
    t = Todo.query.filter_by(id=todo_id, user_id=current_user.id).first_or_404()
    t.completed = not t.completed
    msg = 'Task updated.'
    if session.get('auto_delete') and t.completed:
        db.session.delete(t)
        db.session.commit()
        cleanup_unlocked_categories(current_user.id)
        msg = 'Task completed and auto-deleted.'
    else:
        db.session.commit()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success", "message": msg}, 200
        
    flash(msg, 'info')
    return redirect(url_for('todo', 
                            category=request.args.get('category', ''), 
                            page=request.args.get('page', 1),
                            search=request.args.get('search', ''),
                            status=request.args.get('status', 'all'),
                            cat_page=request.args.get('cat_page', 1)))

@app.post('/todo/<int:todo_id>/delete')
@login_required
def delete(todo_id):
    t = Todo.query.filter_by(id=todo_id, user_id=current_user.id).first_or_404()
    db.session.delete(t)
    db.session.commit()
    cleanup_unlocked_categories(current_user.id)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success", "message": "Task deleted."}, 200

    return redirect(url_for('todo', 
                            category=request.args.get('category', ''), 
                            page=request.args.get('page', 1),
                            search=request.args.get('search', ''),
                            status=request.args.get('status', 'all'),
                            cat_page=request.args.get('cat_page', 1)))
    
@app.post('/todo/<int:todo_id>/edit')
@login_required
def edit(todo_id):
    t = Todo.query.filter_by(id=todo_id, user_id=current_user.id).first_or_404()
    task_text = request.form.get('task', '').strip()
    notes_text = request.form.get('notes', '').strip()
    cat_list = parse_categories_string(request.form.get('categories_csv', ''))
    
    if task_text:
        t.task = task_text
        t.notes = notes_text if notes_text else None
        existing_cats = {c.name: c for c in Category.query.filter(
            Category.name.in_(cat_list), 
            Category.user_id == current_user.id
        ).all()}
        new_categories = []
        for clean_name in cat_list:
            cat = existing_cats.get(clean_name)
            if not cat:
                cat = Category(name=clean_name, user_id=current_user.id, color=None)
                db.session.add(cat)
            new_categories.append(cat)
        t.categories = new_categories
        db.session.commit()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success", "message": "Task updated."}, 200
        
    flash('Task updated successfully!', 'success')
    return redirect(url_for('todo', 
                            category=request.args.get('category', ''), 
                            page=request.args.get('page', 1),
                            search=request.args.get('search', ''),
                            status=request.args.get('status', 'all'),
                            cat_page=request.args.get('cat_page', 1)))
    
@app.post('/todo/bulk')
@login_required
def bulk_action():
    todo_ids = [int(tid) for tid in request.form.getlist('todo_ids') if tid.isdigit()]
    action = request.form.get('action')
    
    if not todo_ids:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return {"status": "error", "message": "No tasks selected."}, 400
        flash('No tasks were selected.', 'warning')
        return redirect(url_for('todo', category=request.args.get('category', ''), page=request.args.get('page', 1), cat_page=request.args.get('cat_page', 1)))

    todos = Todo.query.filter(Todo.id.in_(todo_ids), Todo.user_id == current_user.id).all()
    
    if action == 'toggle':
        auto_delete = session.get('auto_delete')
        for t in todos:
            t.completed = not t.completed 
            if auto_delete and t.completed:
                db.session.delete(t)
        db.session.commit()
        cleanup_unlocked_categories(current_user.id)
    elif action == 'delete':
        for t in todos:
            db.session.delete(t)
        db.session.commit()
        cleanup_unlocked_categories(current_user.id)

    msg = "Bulk update completed."
    if action == 'delete':
        msg = f"Deleted {len(todos)} tasks."
    elif action == 'toggle':
        msg = f"Updated {len(todos)} tasks"
        if session.get('auto_delete'):
            msg += " and completed tasks were auto-deleted"
        msg += "."

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success", "message": msg}, 200
        
    flash(msg, 'info')
    return redirect(url_for('todo', 
                            category=request.args.get('category', ''), 
                            page=request.args.get('page', 1),
                            search=request.args.get('search', ''),
                            status=request.args.get('status', 'all'),
                            cat_page=request.args.get('cat_page', 1)))

@app.post('/category/add')
@login_required
def add_category():
    name = request.form.get('name', '').strip().upper()
    color = request.form.get('color')
    if color != None:
        color = request.form.get('color').strip()
    task_ids = request.form.getlist('task_ids')

    if not name:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return {"status": "error", "message": "Category name is required."}, 400
        flash('Category name is required.', 'danger')
        return redirect(url_for('todo'))

    existing = Category.query.filter_by(name=name, user_id=current_user.id).first()
    if existing:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return {"status": "error", "message": "Category already exists."}, 400
        flash('Category already exists.', 'warning')
        return redirect(url_for('todo'))

    cat = Category(name=name, color=color, user_id=current_user.id)
    db.session.add(cat)
    
    for tid in task_ids:
        if tid.isdigit():
            t = Todo.query.filter_by(id=int(tid), user_id=current_user.id).first()
            if t:
                cat.todos.append(t)
                
    db.session.commit()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success", "message": "Category created successfully!"}, 200

    flash('Category created successfully!', 'success')
    shown_category = f"{name}"
    if request.args.get('category'):
        shown_category += f",{request.args.get('category')}"
    
    return redirect(url_for('todo', category=shown_category, page=request.args.get('page', 1), search=request.args.get('search', ''), status=request.args.get('status', 'all'), cat_page=request.args.get('cat_page', 1)))

@app.post('/category/<int:cat_id>/edit')
@login_required
def edit_category(cat_id):
    cat = Category.query.filter_by(id=cat_id, user_id=current_user.id).first_or_404()
    name = request.form.get('name', '').strip().upper()
    color = request.form.get('color').strip() or None
    task_ids = request.form.getlist('task_ids')

    if not name:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return {"status": "error", "message": "Name cannot be empty."}, 400
        flash('Category name cannot be empty.', 'danger')
        return redirect(url_for('todo'))

    existing = Category.query.filter_by(name=name, user_id=current_user.id).first()
    if existing and existing.id != cat.id:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return {"status": "error", "message": "Another category has this name."}, 400
        flash('Another category already has this name.', 'warning')
        return redirect(url_for('todo'))

    cat.name = name
    cat.color = color
    cat.todos = []
    
    for tid in task_ids:
        if tid.isdigit():
            t = Todo.query.filter_by(id=int(tid), user_id=current_user.id).first()
            if t:
                cat.todos.append(t)

    db.session.commit()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success", "message": "Category updated successfully!"}, 200

    flash('Category updated successfully!', 'success')
    shown_category = f"{cat.name}"
    if request.args.get('category'):
        shown_category += f",{request.args.get('category')}"
    return redirect(url_for('todo', category=shown_category, page=request.args.get('page', 1), search=request.args.get('search', ''), status=request.args.get('status', 'all'), cat_page=request.args.get('cat_page', 1)))

@app.post('/category/<int:cat_id>/delete')
@login_required
def delete_category(cat_id):
    cat = Category.query.filter_by(id=cat_id, user_id=current_user.id).first_or_404()
    
    if cat.is_locked:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return {"status": "error", "message": "Cannot delete a locked category! Unlock it first."}, 400
        flash('Cannot delete a locked category.', 'danger')
        return redirect(url_for('todo', category=request.args.get('category'), page=request.args.get('page', 1), search=request.args.get('search', ''), status=request.args.get('status', 'all'), cat_page=request.args.get('cat_page', 1)))
    
    db.session.delete(cat)
    db.session.commit()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success", "message": "Category deleted."}, 200

    flash('Category deleted.', 'info')
    updated_category_param = toggle_category_string(request.args.get('category', ''), cat.name)
    return redirect(url_for('todo', category=updated_category_param, page=request.args.get('page', 1), search=request.args.get('search', ''), status=request.args.get('status', 'all'), cat_page=request.args.get('cat_page', 1)))

@app.post('/category/<int:cat_id>/toggle_lock')
@login_required
def toggle_category_lock(cat_id):
    cat = Category.query.filter_by(id=cat_id, user_id=current_user.id).first_or_404()
    cat.is_locked = not cat.is_locked
    db.session.commit()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        status_msg = f"Category '{cat.name}' locked." if cat.is_locked else f"Category '{cat.name}' unlocked."
        return {"status": "success", "message": status_msg}, 200

    flash(f"Category status updated.", 'info')
    return redirect(url_for('todo', 
                            category=request.args.get('category', ''), 
                            page=request.args.get('page', 1), 
                            search=request.args.get('search', ''), 
                            status=request.args.get('status', 'all'),
                            cat_page=request.args.get('cat_page', 1)))

@app.post('/update_preferences')
@login_required
def update_preferences():
    session['auto_delete'] = 'auto_delete' in request.form
    session['confirm_delete'] = 'confirm_delete' in request.form
    session['sort_by'] = request.form.get('sort_by', 'newest')
    session['cat_sort_by'] = request.form.get('cat_sort_by', 'amount')
    session['theme'] = request.form.get('theme', 'system')
    session['ui_tone'] = request.form.get('ui_tone', 'blue')
    session['corners'] = request.form.get('corners', 'normal')
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success"}, 200
        
    flash('Preferences updated.', 'success')
    return redirect(url_for('account'))

@app.post('/account/delete')
@login_required
def delete_account():
    if current_user.profile_pic_url:
        folder = f"ToPlanBlock/{os.getenv('BRANCH', 'dev')}/profile_pics"
        public_id = f"{folder}/{current_user.profile_pic_id}"
        cloudinary.uploader.destroy(public_id, invalidate=True)

    db.session.delete(current_user)
    db.session.commit()

    logout_user()
    session.clear()
    
    flash('Account and all associated data have been permanently deleted.', 'info')
    return redirect(url_for('landing'))

@app.post('/logout')
@login_required
def logout():
    logout_user()
    session.clear()
    flash('Logged out.', 'info')
    return redirect(url_for('landing'))

# ---------------- Error Handlers ----------------
@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('500.html'), 500

@app.errorhandler(401)
def unauthorized_error(error):
    flash("Please log in to access this page.", "warning")
    return redirect(url_for('login'))

@app.errorhandler(403)
def forbidden_error(error):
    return render_template('403.html'), 403

@app.errorhandler(404)
def not_found_error(error):
    return render_template('404.html'), 404

@app.errorhandler(413)
def request_entity_too_large(error):
    flash("The file is too large! Maximum allowed size is 5MB.", "danger")
    return redirect(url_for('account'))

@app.errorhandler(429)
def ratelimit_handler(error):
    retry_after = error.description if hasattr(error, 'description') else "a few minutes"
    return render_template('429.html', limit_info=retry_after), 429

# ---------------- Routes ----------------
@app.route('/')
def landing():
    return render_template('landing.html')

@app.route('/privacy')
def privacy():
    return render_template('privacy.html')

@app.route('/terms')
def terms():
    return render_template('terms.html')

@app.route('/register', methods=['GET','POST'])
@limiter.limit("10 per hour")
def register():
    if current_user.is_authenticated:
        return redirect(url_for('todo'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        raw_pw = request.form.get('password', '')

        if not username or not email or not raw_pw:
            flash('All fields are required.', 'danger')
            return redirect(url_for('register'))

        if len(raw_pw) < 8:
            flash('Password is too short (min 8 chars).', 'danger')
            return redirect(url_for('register'))

        hashed_pw = bcrypt.generate_password_hash(raw_pw).decode('utf-8')
        user = User(username=username, email=email, password=hashed_pw)
        db.session.add(user)
        try:
            db.session.commit()
            login_user(user)
            flash('Account created! Welcome!', 'success')
            return redirect(url_for('todo'))
        except IntegrityError:
            db.session.rollback()
            flash('Username or email already exists.', 'danger')
    return render_template('register.html')

@app.route('/login', methods=['GET','POST'])
@limiter.limit("5 per minute")
def login():
    if current_user.is_authenticated:
        return redirect(url_for('todo'))
    
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        pw = request.form.get('password', '')
        user = User.query.filter_by(email=email).first()
        if user and bcrypt.check_password_hash(user.password, pw):
            session.clear()
            login_user(user)
            next_page = request.args.get('next')
            if not next_page or urlparse(next_page).netloc != '':
                next_page = url_for('todo')
                
            flash('Logged in successfully.', 'success')
            return redirect(next_page)
        
        flash('Invalid credentials.', 'danger')
    return render_template('login.html')

@app.route('/account', methods=['GET','POST'])
@login_required
@limiter.limit("10 per minute")
def account():
    if request.method == 'POST':
        # Security check
        current_pw = request.form.get('current_password')
        if not current_pw or not bcrypt.check_password_hash(current_user.password, current_pw):
            flash('Incorrect current password.', 'danger')
            return redirect(url_for('account'))

        new_username = request.form.get('username', '').strip()
        if new_username and new_username != current_user.username:
            current_user.username = new_username

        new_email = request.form.get('email', '').strip().lower()
        if new_email and new_email != current_user.email:
            current_user.email = new_email

        if 'picture' in request.files:
            file = request.files['picture']
            if file and file.filename != '' and allowed_file(file.filename):
                old_id = current_user.profile_pic_id
                
                branch = os.getenv('BRANCH', 'dev')
                target_folder = f"ToPlanBlock/{branch}/profile_pics"

                upload_result = cloudinary.uploader.upload(
                    file, 
                    folder=target_folder,
                    transformation=[{'width': 400, 'height': 400, 'crop': 'fill'}]
                )
                full_public_id = upload_result.get('public_id')
                current_user.profile_pic_id = full_public_id.split('/')[-1]
                if old_id:
                    folder = f"ToPlanBlock/{os.getenv('BRANCH', 'dev')}/profile_pics"
                    old_public_id = f"{folder}/{old_id}"
                    cloudinary.uploader.destroy(old_public_id, invalidate=True)

        # Handle Password Change
        new_pw = request.form.get('new_password', '').strip()
        if new_pw:
            if len(new_pw) < 8:
                flash('New password too short.', 'warning')
            else:
                current_user.password = bcrypt.generate_password_hash(new_pw).decode('utf-8')
                flash('Password updated.', 'success')

        try:
            db.session.commit()
            flash('Account updated!', 'success')
        except IntegrityError:
            db.session.rollback()
            flash('Username or email already in use.', 'danger')

    return render_template('account.html')

@app.route('/todo', methods=['GET', 'POST'])
@login_required
def todo():
    if request.method == 'POST':
        task_text = request.form.get('task', '').strip()
        notes_text = request.form.get('notes', '').strip()
        cat_list = parse_categories_string(request.form.get('categories_csv', ''))
        
        if not task_text:
            flash('Task name is required.', 'danger')
            return redirect(url_for('todo'))
            
        new_todo = Todo(task=task_text, notes=notes_text if notes_text else None, user_id=current_user.id)
        
        if cat_list:
            existing_cats = {c.name: c for c in Category.query.filter(
                Category.name.in_(cat_list),
                Category.user_id == current_user.id
            ).all()}
            
            for clean_name in cat_list:
                cat = existing_cats.get(clean_name)
                if not cat:
                    cat = Category(name=clean_name, user_id=current_user.id, color=None)
                    db.session.add(cat)
                new_todo.categories.append(cat)
                
        db.session.add(new_todo)
        db.session.commit()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return {"status": "success", "message": "Task created successfully!"}, 200
            
        flash('Task created successfully!', 'success')
        return redirect(url_for('todo', category=request.args.get('category', ''), page=request.args.get('page', 1)))

    # --- GET REQUEST OPTIMIZATIONS ---
    page = request.args.get('page', 1, type=int)
    cat_page = request.args.get('cat_page', 1, type=int)
    search_query = request.args.get('search', '').strip()
    status_filter = request.args.get('status', 'all').strip()
    selected_category_input = request.args.get('category', '').strip()

    # OPTIMIZATION 1: Eager load relations via selectinload to completely eliminate N+1 latency bugs
    q = Todo.query.filter_by(user_id=current_user.id).options(selectinload(Todo.categories))

    if search_query:
        q = q.filter(Todo.task.ilike(f"%{search_query}%"))

    if status_filter == 'active':
        q = q.filter(Todo.completed == False)
    elif status_filter == 'completed':
        q = q.filter(Todo.completed == True)

    if selected_category_input:
        cat_names = parse_categories_string(selected_category_input)
        if cat_names:
            for cat_name in cat_names:
                q = q.filter(Todo.categories.any(Category.name == cat_name))

    q = q.order_by(Todo.completed.asc(), Todo.created_at.desc())

    # OPTIMIZATION 2: Leverage standard pagination to calculate counts automatically in exactly 2 roundtrips
    pagination = q.paginate(page=page, per_page=10, error_out=False)
    total_filtered_tasks = pagination.total
    
    completed_filtered_tasks = 0
    if total_filtered_tasks > 0:
        completed_filtered_tasks = q.filter(Todo.completed == True).count()
        
    progress_percent = int((completed_filtered_tasks / total_filtered_tasks * 100)) if total_filtered_tasks > 0 else 0
    
    cat_sort_pref = session.get('cat_sort_by', 'amount')
    base_q = Category.query.filter_by(user_id=current_user.id).options(selectinload(Category.todos))
    
    if cat_sort_pref == 'alpha':
        categories_query = base_q.order_by(Category.is_locked.desc(), Category.name.asc())
    elif cat_sort_pref == 'newest':
        categories_query = base_q.order_by(Category.is_locked.desc(), Category.created_at.desc())
    elif cat_sort_pref == 'oldest':
        categories_query = base_q.order_by(Category.is_locked.desc(), Category.created_at.asc())
    else: 
        categories_query = (base_q.outerjoin(Category.todos)
                            .group_by(Category.id)
                            .order_by(Category.is_locked.desc(), db.func.count(Todo.id).desc(), Category.name.asc()))
    
    categories_pagination = categories_query.paginate(page=cat_page, per_page=9, error_out=False)

    # OPTIMIZATION 3: Use with_entities projection to avoid querying heavy unused properties across all entries
    all_categories = Category.query.filter_by(user_id=current_user.id)\
                                   .with_entities(Category.id, Category.name, Category.color)\
                                   .order_by(Category.name.asc())\
                                   .all()

    # OPTIMIZATION 4: Selectively load only ID and Task values, bypassing massive Notes blocks down the wire
    all_tasks = Todo.query.filter_by(user_id=current_user.id)\
                          .with_entities(Todo.id, Todo.task)\
                          .order_by(Todo.task.asc())\
                          .all()

    return render_template('todo.html', 
                           pagination=pagination,
                           categories_pagination=categories_pagination,
                           categories=categories_pagination.items,
                           all_categories=all_categories,
                           all_tasks=all_tasks,
                           selected_category=selected_category_input, 
                           search_query=search_query,
                           status_filter=status_filter,
                           progress_percent=progress_percent,
                           toggle_cat=toggle_category_string)

@app.route('/version')
def version():
    releases = github_api_request()
    return render_template('version.html', releases=releases)

@app.route('/export/tasks')
@login_required
@limiter.limit("5 per hour")
def export_tasks():
    export_format = request.args.get('format', 'json').lower()
    user_todos = Todo.query.filter_by(user_id=current_user.id)\
                           .options(selectinload(Todo.categories))\
                           .order_by(Todo.created_at.desc())\
                           .all()
    
    if export_format == 'csv':
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Task Description', 'Status', 'Associated Categories', 'Notes'])
        for t in user_todos:
            categories_str = ", ".join([c.name for c in t.categories])
            status_str = "Completed" if t.completed else "Pending"
            writer.writerow([t.task, status_str, categories_str, t.notes or ''])
        
        buffer = io.BytesIO()
        buffer.write(output.getvalue().encode('utf-8'))
        buffer.seek(0)
        
        return send_file(
            buffer,
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'{current_user.username}_tasks_{datetime.now().strftime("%Y%m%d")}.csv'
        )
        
    else: # Default to JSON export
        export_data = []
        for t in user_todos:
            export_data.append({
                "task": t.task,
                "completed": t.completed,
                "categories": [c.name for c in t.categories],
                "notes": t.notes or ""
            })
        json_string = json.dumps(export_data, indent=4)
        buffer = io.BytesIO()
        buffer.write(json_string.encode('utf-8'))
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype='application/json',
            as_attachment=True,
            download_name=f'{current_user.username}_tasks_{datetime.now().strftime("%Y%m%d")}.json'
        )

@app.route('/health')
@limiter.exempt
def health_check():
    return "OK", 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=not IS_PROD)
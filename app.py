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
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import IntegrityError

load_dotenv()
app = Flask(__name__, static_folder='static', template_folder='templates')

# --- CONFIGURATION ---
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "secure-fallback-key-for-local-dev")
IS_PROD = os.getenv("BRANCH") == "production"

if IS_PROD:
    database_url = os.getenv('DATABASE_URL')
else:
    database_url = 'sqlite:///todo.db'
    UPLOAD_FOLDER = os.path.join('static', 'uploads', 'profile_pics')
    os.makedirs(os.path.join(app.root_path, UPLOAD_FOLDER), exist_ok=True)

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
    'pool_size': 5,
    'max_overflow': 10,
    'pool_recycle': 1800,
    'pool_pre_ping': True,
    'pool_timeout': 30
}

cache = Cache(app, config={'CACHE_TYPE': 'SimpleCache', 'CACHE_DEFAULT_TIMEOUT': 3600})

# --- EXTENSIONS ---
db = SQLAlchemy(app)
migrate = Migrate(app, db, render_as_batch=True)
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
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    profile_pic_url = db.Column(db.String(500), nullable=True) 
    created_at = db.Column(db.DateTime, default=datetime.now)
    todos = db.relationship('Todo', backref='owner', lazy=True, cascade='all, delete-orphan')

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    todos = db.relationship('Todo', secondary='todo_category', back_populates='categories')

todo_category = db.Table(
    'todo_category',
    db.Column('todo_id', db.Integer, db.ForeignKey('todo.id'), primary_key=True),
    db.Column('category_id', db.Integer, db.ForeignKey('category.id'), primary_key=True)
)

class Todo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task = db.Column(db.String(200), nullable=False)
    completed = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    categories = db.relationship('Category', secondary=todo_category, back_populates='todos')

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

# --------------- Helpers ----------------
def allowed_file(filename):
    """Check if the file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def delete_old_image(url):
    """Handles deletion for both Cloudinary and local files."""
    if not url:
        return
    
    # Check if it's a local file
    if url.startswith('/static/uploads/'):
        relative_path = url.lstrip('/')
        full_path = os.path.join(current_app.root_path, relative_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            
    # Otherwise, assume Cloudinary
    elif 'cloudinary.com' in url:
        try:
            parts = url.split('/')
            if 'upload' in parts:
                idx = parts.index('upload')
                public_id = "/".join(parts[idx+2:]).rsplit('.', 1)[0]
                cloudinary.uploader.destroy(public_id, invalidate=True)
        except Exception as e:
            print(f"Error removing Cloudinary image: {e}")

def toggle_category_string(current_str, toggle_name):
    """Helper to add/remove a category name from a comma-separated string."""
    if not current_str:
        return toggle_name
    
    parts = [p.strip().upper() for p in current_str.split(',') if p.strip()]
    toggle_name = toggle_name.strip().upper()
    
    if toggle_name in parts:
        parts.remove(toggle_name)
    else:
        parts.append(toggle_name)
    
    return ",".join(parts)

@cache.cached(timeout=3600) # This function is cached for 1 hour
def github_api_request():
    """Helper to make GitHub API requests with error handling."""
    url = "https://api.github.com/repos/ermichele/toplanblock/releases"
    try:
        response = requests.get(url, headers={"User-Agent": "ToPlanBlock-App"}, timeout=10)
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
        f"script-src 'self' https://cdn.jsdelivr.net 'nonce-{nonce}'; "
        f"style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
        f"font-src 'self' https://cdn.jsdelivr.net; " 
        f"img-src 'self' data: https://res.cloudinary.com; "
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
        cats = list(t.categories)
        db.session.delete(t)
        db.session.commit()
        for cat in cats:
            if not cat.todos:
                db.session.delete(cat)
        db.session.commit()
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
                            status=request.args.get('status', 'all')))

@app.post('/todo/<int:todo_id>/delete')
@login_required
def delete(todo_id):
    t = Todo.query.filter_by(id=todo_id, user_id=current_user.id).first_or_404()
    cats = list(t.categories)
    db.session.delete(t)
    db.session.commit()
    for cat in cats:
        if not cat.todos:
            db.session.delete(cat)
    db.session.commit()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success", "message": "Task deleted."}, 200

    return redirect(url_for('todo', 
                            category=request.args.get('category', ''), 
                            page=request.args.get('page', 1),
                            search=request.args.get('search', ''),
                            status=request.args.get('status', 'all')))
    
@app.post('/todo/<int:todo_id>/edit')
@login_required
def edit(todo_id):
    t = Todo.query.filter_by(id=todo_id, user_id=current_user.id).first_or_404()
    task_text = request.form.get('task', '').strip()
    cat_list = [c.strip().upper() for c in request.form.get('categories_csv', '').split(',') if c.strip()]
    
    if task_text:
        t.task = task_text
        t.categories = [] 
        for clean_name in cat_list:
            cat = Category.query.filter_by(name=clean_name).first() or Category(name=clean_name)
            if cat not in t.categories:
                t.categories.append(cat)
        db.session.commit()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success", "message": "Task updated."}, 200
        
    flash('Task updated successfully!', 'success')
    return redirect(url_for('todo', 
                            category=request.args.get('category', ''), 
                            page=request.args.get('page', 1),
                            search=request.args.get('search', ''),
                            status=request.args.get('status', 'all')))
    
@app.post('/todo/bulk')
@login_required
def bulk_action():
    todo_ids = request.form.getlist('todo_ids')
    action = request.form.get('action')
    
    if not todo_ids:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return {"status": "error", "message": "No tasks selected."}, 400
        flash('No tasks were selected.', 'warning')
        return redirect(url_for('todo', category=request.args.get('category', ''), page=request.args.get('page', 1)))

    todos = Todo.query.filter(Todo.id.in_(todo_ids), Todo.user_id == current_user.id).all()
    
    if action == 'toggle':
        auto_delete = session.get('auto_delete')
        affected_cats = set()
        for t in todos:
            t.completed = not t.completed 
            if auto_delete and t.completed:
                affected_cats.update([cat for cat in t.categories])
                db.session.delete(t)
        db.session.commit()
        if auto_delete:
            for cat in affected_cats:
                if not cat.todos:
                    db.session.delete(cat)
            db.session.commit()
            
    elif action == 'delete':
        affected_cats = set()
        for t in todos:
            affected_cats.update([cat for cat in t.categories])
            db.session.delete(t)
        db.session.commit()
        for cat in affected_cats:
            if not cat.todos:
                db.session.delete(cat)
        db.session.commit()

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
                            status=request.args.get('status', 'all')))

@app.post('/update_preferences')
@login_required
def update_preferences():
    session['auto_delete'] = 'auto_delete' in request.form
    session['confirm_delete'] = 'confirm_delete' in request.form
    session['sort_by'] = request.form.get('sort_by', 'newest')
    session['theme'] = request.form.get('theme', 'system')
    
    # Check if request is AJAX
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"status": "success"}, 200
        
    flash('Preferences updated.', 'success')
    return redirect(url_for('account'))

@app.post('/account/delete')
@login_required
def delete_account():
    user_id = current_user.id
    if current_user.profile_pic_url:
        delete_old_image(current_user.profile_pic_url)
    user_todos = Todo.query.filter_by(user_id=user_id).all()
    affected_cats = set()
    for t in user_todos:
        for cat in t.categories:
            affected_cats.add(cat.id)

    db.session.delete(current_user)
    db.session.commit()

    logout_user()
    session.clear()

    for cat_id in affected_cats:
        c = db.session.get(Category, cat_id)
        if c and not c.todos:
            db.session.delete(c)
    db.session.commit()
    
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
@app.errorhandler(404)
def not_found_error(error):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('500.html'), 500

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
                old_url = current_user.profile_pic_url
                
                if IS_PROD:
                    upload_result = cloudinary.uploader.upload(
                        file, folder="profile_pics/",
                        public_id=f"user_{current_user.id}_{uuid.uuid4().hex[:5]}",
                        transformation=[{'width': 400, 'height': 400, 'crop': 'fill'}]
                    )
                    current_user.profile_pic_url = upload_result.get('secure_url')
                else:
                    filename = f"user_{current_user.id}_{uuid.uuid4().hex[:5]}.webp"
                    filepath = os.path.join(current_app.root_path, 'static/uploads/profile_pics', filename)
                    file.save(filepath)
                    current_user.profile_pic_url = f"/static/uploads/profile_pics/{filename}"

                delete_old_image(old_url)

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
        cat_list = [c.strip().upper() for c in request.form.get('categories_csv', '').split(',') if c.strip()]
        
        if task_text:
            new_todo = Todo(task=task_text, user_id=current_user.id)
            for clean_name in cat_list:
                cat = Category.query.filter_by(name=clean_name).first() or Category(name=clean_name)
                if cat not in new_todo.categories:
                    new_todo.categories.append(cat)
            db.session.add(new_todo)
            db.session.commit()

            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return {"status": "success", "message": "Task added!"}, 200
            
            flash('Task added!', 'success')
            return redirect(url_for('todo', category=request.args.get('category', ''), page=request.args.get('page', 1)))

    page = request.args.get('page', 1, type=int)
    selected_category_input = request.args.get('category', '')
    search_query = request.args.get('search', '').strip()
    status_filter = request.args.get('status', 'all').lower()
    q = Todo.query.options(joinedload(Todo.categories)).filter_by(user_id=current_user.id)
    
    # Keyword Search (Case-insensitive)
    if search_query:
        q = q.filter(Todo.task.ilike(f"%{search_query}%"))

    # Category Filter
    if selected_category_input:
        cat_filter_list = [c.strip().upper() for c in selected_category_input.split(',') if c.strip()]
        for cat_name in cat_filter_list:
            q = q.filter(Todo.categories.any(Category.name == cat_name))

    # Status Filtering
    if status_filter == 'active':
        q = q.filter(Todo.completed == False)
    elif status_filter == 'completed':
        q = q.filter(Todo.completed == True)

    # Sorting
    sort_pref = session.get('sort_by', 'newest')
    if sort_pref == 'alpha':
        q = q.order_by(Todo.completed.asc(), Todo.task.asc())
    elif sort_pref == 'oldest':
        q = q.order_by(Todo.completed.asc(), Todo.id.asc())
    else:  # Default to 'newest'
        q = q.order_by(Todo.completed.asc(), Todo.id.desc())

    pagination = q.distinct().paginate(page=page, per_page=10, error_out=False)
    
    # Calculate progress bar percentage for tasks currently on page
    page_items = pagination.items
    total_on_page = len(page_items)
    completed_on_page = sum(1 for t in page_items if t.completed)
    progress_percent = int((completed_on_page / total_on_page * 100)) if total_on_page > 0 else 0

    user_cat_ids = db.session.query(Category.id).join(Todo.categories).filter(Todo.user_id == current_user.id).distinct()
    categories = Category.query.filter(Category.id.in_(user_cat_ids)).order_by(Category.name).all()

    return render_template('todo.html', 
                         pagination=pagination,
                         categories=categories, 
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
    user_todos = Todo.query.filter_by(user_id=current_user.id).all()
    export_data = []
    for t in user_todos:
        export_data.append({
            "task": t.task,
            "completed": t.completed,
            "categories": [c.name for c in t.categories]
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
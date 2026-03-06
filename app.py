import os
import uuid
import io
import cloudinary
import cloudinary.uploader
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, render_template, redirect, url_for, request, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_

load_dotenv()
app = Flask(__name__)

# --- CONFIGURATION ---
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "secure-fallback-key-for-local-dev")
if os.getenv("BRANCH") == "production":
    database_url = os.getenv('DATABASE_URL')
else:
    database_url = 'sqlite:///todo.db'

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # Aumentato a 5MB per Cloudinary

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
    default_limits=["200 per day", "50 per hour", "10 per minute"],
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
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def delete_old_cloudinary_image(url):
    """Estrae il public_id dall'URL e cancella l'immagine da Cloudinary per liberare spazio."""
    if not url:
        return
    try:
        parts = url.split('/')
        if 'upload' in parts:
            idx = parts.index('upload')
            public_id_with_ext = "/".join(parts[idx+2:]) 
            public_id = public_id_with_ext.rsplit('.', 1)[0]
            cloudinary.uploader.destroy(public_id, invalidate=True)
    except Exception as e:
        print(f"Error with the removal of the old image: {e}")

# ---------------- Error Handlers ----------------
@app.errorhandler(404)
def not_found_error(error):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('500.html'), 500

# ---------------- Routes ----------------
@app.route('/')
def landing():
    return render_template('landing.html')

@app.route('/privacy')
def privacy():
    now_date = datetime.now().strftime('%d/%m/%Y') 
    return render_template('privacy.html', now_date=now_date)

@app.route('/terms')
def terms():
    return render_template('terms.html')

@app.route('/register', methods=['GET','POST'])
@limiter.limit("10 per hour")
def register():
    if current_user.is_authenticated:
        return redirect(url_for('todo'))
    
    if request.method == 'POST':
        username = request.form['username'].strip()
        email = request.form['email'].strip().lower()
        raw_pw = request.form['password']
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
        email = request.form['email'].strip().lower()
        pw = request.form['password']
        user = User.query.filter_by(email=email).first()
        if user and bcrypt.check_password_hash(user.password, pw):
            login_user(user)
            flash('Logged in successfully.', 'success')
            return redirect(request.args.get('next') or url_for('todo'))
        flash('Invalid credentials.', 'danger')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Logged out.', 'info')
    return redirect(url_for('landing'))

@app.route('/account', methods=['GET','POST'])
@login_required
def account():
    if request.method == 'POST':
        # Security check
        current_pw = request.form.get('current_password') or request.form.get('old_password')
        if not current_pw or not bcrypt.check_password_hash(current_user.password, current_pw):
            flash('Incorrect current password.', 'danger')
            return redirect(url_for('account'))

        # Update Username/Email
        new_username = request.form.get('username', '').strip()
        new_email = request.form.get('email', '').strip().lower()
        if new_username and new_email:
            current_user.username = new_username
            current_user.email = new_email

        if 'picture' in request.files:
            file = request.files['picture']
            if file and file.filename != '' and allowed_file(file.filename):
                try:
                    old_url = current_user.profile_pic_url

                    upload_result = cloudinary.uploader.upload(
                        file,
                        folder = "profile_pics/",
                        public_id = f"user_{current_user.id}_{uuid.uuid4().hex[:5]}",
                        transformation = [
                            {'width': 400, 'height': 400, 'crop': 'fill', 'gravity': 'face', 'quality': 'auto'}
                        ]
                    )
                    current_user.profile_pic_url = upload_result.get('secure_url')

                    if old_url:
                        delete_old_cloudinary_image(old_url)

                except Exception as e:
                    flash(f"Error uploading image: {str(e)}", 'danger')

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

@app.post('/account/delete')
@login_required
def delete_account():
    user_todos = Todo.query.filter_by(user_id=current_user.id).all()
    affected_cats = set()
    for t in user_todos:
        for cat in t.categories:
            affected_cats.add(cat)

    db.session.delete(current_user)
    db.session.commit()

    for cat in affected_cats:
        c = db.session.get(Category, cat.id)
        if c and not c.todos:
            db.session.delete(c)
    db.session.commit()
    return redirect(url_for('landing'))

@app.route('/todo', methods=['GET','POST'])
@login_required
def todo():
    if request.method == 'POST':
        task = request.form['task'].strip()
        cat_input = request.form['category'].replace('\n', ',').strip()
        cat_names = [name.strip().upper() for name in cat_input.split(',') if name.strip()]
        if task:
            new_task = Todo(task=task, user_id=current_user.id)
            for name in cat_names:
                category = Category.query.filter_by(name=name).first() or Category(name=name)
                if category not in new_task.categories:
                    new_task.categories.append(category)
            db.session.add(new_task)
            db.session.commit()
            
    selected_category_input = request.args.get('category', '').strip()
    filter_prefixes = [name.strip() for name in selected_category_input.split(',') if name.strip()]
    
    q = Todo.query.filter_by(user_id=current_user.id).options(joinedload(Todo.categories))
    if filter_prefixes:
        conditions = [Category.name.ilike(f"{prefix}%") for prefix in filter_prefixes]
        matching_cat_ids = db.session.query(Category.id).filter(or_(*conditions)).subquery()
        q = q.join(Todo.categories).filter(Category.id.in_(matching_cat_ids))

    tasks = q.distinct().order_by(Todo.completed.asc(), Todo.id.desc()).all()
    user_cat_ids = db.session.query(Category.id).join(Todo.categories).filter(Todo.user_id == current_user.id).distinct()
    categories = Category.query.filter(Category.id.in_(user_cat_ids)).order_by(Category.name).all()

    return render_template('todo.html', tasks=tasks, categories=categories, selected_category=selected_category_input)

@app.post('/todo/<int:todo_id>/toggle')
@login_required
def toggle(todo_id):
    t = Todo.query.filter_by(id=todo_id, user_id=current_user.id).first_or_404()
    t.completed = not t.completed
    db.session.commit()
    return redirect(url_for('todo', category=request.args.get('category', '')))

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
    return redirect(url_for('todo', category=request.args.get('category', '')))

@app.route('/health')
@limiter.exempt
def health_check():
    return "OK", 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
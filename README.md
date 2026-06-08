# ToPlanBlock

A clean, full-stack task manager built as an educational project by **Michele Acciuffi (ErMichele)**.

---

## Features

- **Task management** — create, edit, toggle, and delete tasks with optional Markdown notes
- **Categories** — organise tasks into colour-coded, pinnable groups with many-to-many linking
- **Smart filtering** — filter by category, status (all / active / done), or free-text search
- **Bulk actions** — select multiple tasks across pages and toggle or delete in one click
- **AJAX navigation** — the task list and sidebar update without a full page reload
- **Theming** — dark / light / system modes, five colour tones, and three corner-radius styles, all applied live
- **Preferences** — per-user settings stored server-side and applied to every session
- **Data export** — download all tasks as JSON or CSV
- **Profile pictures** — upload and crop a square avatar (stored on Cloudinary)
- **Security** — CSRF protection on every form, rate limiting, bcrypt password hashing

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python · Flask · SQLAlchemy · Flask-Login · Flask-WTF |
| Frontend | Bootstrap 5.3 · Bootstrap Icons · Cropper.js |
| Storage | PostgreSQL · Cloudinary |
| Templating | Jinja2 with a custom `markdown` filter |

---

## Project Structure

```
├── app.py              # Flask application, routes, and models
├── templates/
│   ├── base.html       # Shared layout, navbar, footer, toast container
│   ├── todo.html       # Main task-list page
│   ├── account.html    # User settings page
│   ├── landing.html    # Public landing page
│   ├── login.html      # Login form
│   ├── register.html   # Registration form
│   ├── privacy.html    # Privacy policy
│   ├── terms.html      # Terms of service
│   ├── version.html    # Changelog (fetched from GitHub Releases API)
│   ├── 403.html        # Access denied error page
│   ├── 404.html        # Not found error page
│   ├── 429.html        # Rate limit error page
│   └── 500.html        # Internal server error page
└── static/
    ├── css/
    │   ├── main.css    # Global styles, theming variables, animations
    │   └── todo.css    # Task card and tag input styles
    └── js/
        ├── main.js     # Shared utilities (toast, loading overlay, theme)
        ├── todo.js     # AJAX task manager, tag inputs, bulk selection
        └── account.js  # Profile cropper, preferences auto-save, export
```

---

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/ermichele/toplanblock
cd toplanblock

# 2. Create a virtual environment and install dependencies
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Configure environment variables (copy and fill in .env.example)
cp .env.example .env

# 4. Initialise the database
flask db upgrade

# 5. Run the development server
flask run
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

> This project is an educational demonstrative work and is provided "AS IS" without any guarantee of uptime or data preservation.
document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    const cookieBtn = document.getElementById('accept-cookies-btn');
    if (cookieBtn) cookieBtn.addEventListener('click', acceptCookies);
    checkCookies();
    initThemeListener();
    const toastElements = document.querySelectorAll('.toast');
    toastElements.forEach(el => {
        const toast = new bootstrap.Toast(el, { delay: 5000 });
        toast.show();
    });
    document.addEventListener('submit', (e) => {
        window.toggleLoading(true);
    });
    window.addEventListener('beforeunload', () => {
        window.toggleLoading(true);
    });
});

function checkCookies() {
    if (!localStorage.getItem('cookieConsent')) {
        const banner = document.getElementById('cookie-banner');
        if (banner) banner.style.display = 'block';
    }
}

function acceptCookies() {
    localStorage.setItem('cookieConsent', 'true');
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.style.display = 'none';
}

function initThemeListener() {
    const themePref = document.documentElement.getAttribute('data-theme-pref');

    if (themePref === 'system') {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            document.documentElement.setAttribute('data-bs-theme', e.matches ? 'dark' : 'light');
        });
    }
}

window.toggleLoading = function(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.toggle('d-none', !show);
    }
};

window.showToast = function(message, type = 'dark') {
    const container = document.getElementById('mainToastContainer');
    if (!container) return;

    const bgClass = {
        'success': 'bg-success',
        'error': 'bg-danger',
        'danger': 'bg-danger',
        'warning': 'bg-warning',
        'info': 'bg-info'
    }[type] || 'bg-dark';

    const toastId = 'toast-' + Date.now();
    const html = `
        <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0 shadow-lg mb-2" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="bi bi-info-circle me-2"></i>${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>`;

    container.insertAdjacentHTML('beforeend', html);
    const el = document.getElementById(toastId);
    const toast = new bootstrap.Toast(el, { delay: 5000 });
    toast.show();
    
    el.addEventListener('hidden.bs.toast', () => el.remove());
};
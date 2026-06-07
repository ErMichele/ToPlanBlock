document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const cookieBtn = document.getElementById('accept-cookies-btn');
    if (cookieBtn) cookieBtn.addEventListener('click', acceptCookies);

    checkCookies();
    initThemeListener();

    document.querySelectorAll('.toast').forEach(el => {
        new bootstrap.Toast(el, { delay: 5000 }).show();
    });

    // Show the loading overlay on any standard (non-AJAX) form submission
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form.classList.contains('ajax-form') || form.dataset.remote === 'true') return;
        window.toggleLoading(true);
    });

    // Show the loading overlay while navigating away from the page
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
    // Keep the Bootstrap theme in sync with the OS preference when set to "system"
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (document.documentElement.getAttribute('data-theme-pref') === 'system') {
            document.documentElement.setAttribute('data-bs-theme', e.matches ? 'dark' : 'light');
        }
    });

    if (!document.documentElement.getAttribute('data-ui-tone')) {
        document.documentElement.setAttribute('data-ui-tone', 'blue');
    }

    if (!document.documentElement.getAttribute('data-corners')) {
        document.documentElement.setAttribute('data-corners', 'normal');
    }
}

/**
 * Toggles the full-screen loading overlay.
 * Called by both standard navigation and AJAX operations.
 */
window.toggleLoading = function (show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.toggle('d-none', !show);
};

/**
 * Renders a dismissible Bootstrap toast notification.
 * @param {string} message - The text to display.
 * @param {string} [type='dark'] - Bootstrap color context: 'success', 'danger', 'warning', 'info'.
 */
window.showToast = function (message, type = 'dark') {
    const container = document.getElementById('mainToastContainer');
    if (!container) return;

    const bgClass = {
        success: 'bg-success',
        error: 'bg-danger',
        danger: 'bg-danger',
        warning: 'bg-warning',
        info: 'bg-info',
    }[type] || 'bg-dark';

    const toastId = 'toast-' + Date.now();
    container.insertAdjacentHTML('beforeend', `
        <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0 shadow-lg mb-2"
             role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="bi bi-info-circle me-2"></i>${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `);

    const el = document.getElementById(toastId);
    const toast = new bootstrap.Toast(el, { delay: 5000 });
    toast.show();

    el.addEventListener('hidden.bs.toast', () => el.remove());
};
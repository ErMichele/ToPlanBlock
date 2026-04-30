document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    const cookieBtn = document.getElementById('accept-cookies-btn');
    if (cookieBtn) {
        cookieBtn.addEventListener('click', acceptCookies);
    }
    checkCookies();
    initThemeListener();
    checkCookies();
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
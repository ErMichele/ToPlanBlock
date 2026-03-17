document.addEventListener('DOMContentLoaded', function() {
    const infoForm = document.getElementById('profileForm');
    const prefsForm = document.getElementById('prefsForm');
    const unsavedModal = new bootstrap.Modal(document.getElementById('unsavedChangesModal'));
    const unsavedList = document.getElementById('unsavedList');
    let targetUrl = '';
    let skipCheck = false;

    const getFormState = (form) => {
        const formData = new FormData(form);
        const state = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'current_password' || key === 'csrf_token') continue;
            state[key] = (value instanceof File) ? value.name : value;
        }
        return JSON.stringify(state);
    };

    const initialInfo = getFormState(infoForm);
    const initialPrefs = getFormState(prefsForm);

    const isDirty = () => {
        if (skipCheck) return false;
        return {
            info: getFormState(infoForm) !== initialInfo,
            prefs: getFormState(prefsForm) !== initialPrefs
        };
    };

    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href') === '#' || this.getAttribute('data-bs-toggle')) return;
            
            const status = isDirty();
            if (status && (status.info || status.prefs)) {
                e.preventDefault();
                targetUrl = this.href;
                unsavedList.innerHTML = '';
                if (status.info) unsavedList.innerHTML += '<li>General information</li>';
                if (status.prefs) unsavedList.innerHTML += '<li>Account preferences</li>';
                unsavedModal.show();
            }
        });
    });

    document.getElementById('confirmLeaveBtn').addEventListener('click', () => {
        skipCheck = true;
        window.location.href = targetUrl;
    });

    [infoForm, prefsForm].forEach(form => {
        form.addEventListener('submit', () => {
            skipCheck = true; 
        });
    });

    window.addEventListener('beforeunload', (e) => {
        const status = isDirty();
        if (status && (status.info || status.prefs)) {
            e.preventDefault();
        }
    });
});
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

    // 3. Intercettazione Link
    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href') === '#' || this.getAttribute('data-bs-toggle')) return;
            
            const status = isDirty();
            if (status && (status.info || status.prefs)) {
                e.preventDefault();
                targetUrl = this.href;
                unsavedList.innerHTML = '';
                if (status.info) unsavedList.innerHTML += '<li>Informazioni Generali</li>';
                if (status.prefs) unsavedList.innerHTML += '<li>Preferenze Account</li>';
                unsavedModal.show();
            }
        });
    });

    // 4. Gestione "Leave Anyway"
    document.getElementById('confirmLeaveBtn').addEventListener('click', () => {
        skipCheck = true;
        window.location.href = targetUrl;
    });

    // 5. Gestione "Salva" (Submit dei form)
    [infoForm, prefsForm].forEach(form => {
        form.addEventListener('submit', () => {
            skipCheck = true; 
        });
    });

    // 6. Protezione browser (Tab chiusa/Refresh)
    window.addEventListener('beforeunload', (e) => {
        const status = isDirty();
        if (status && (status.info || status.prefs)) {
            e.preventDefault();
        }
    });
});
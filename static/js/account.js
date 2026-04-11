document.addEventListener('DOMContentLoaded', function() {
    const infoForm = document.getElementById('profileForm');
    const unsavedModal = new bootstrap.Modal(document.getElementById('unsavedChangesModal'));
    const saveToast = new bootstrap.Toast(document.getElementById('saveToast'));
    let targetUrl = '';
    let skipCheck = false;

    const getFormState = (form) => {
        const formData = new FormData(form);
        const state = {};
        for (let [key, value] of formData.entries()) {
            if (['current_password', 'csrf_token', 'picture'].includes(key)) continue;
            state[key] = value;
        }
        return JSON.stringify(state);
    };

    let initialInfo = getFormState(infoForm);

    const isDirty = () => {
        if (skipCheck) return false;
        return getFormState(infoForm) !== initialInfo;
    };

    window.addEventListener('beforeunload', (e) => {
        if (isDirty()) {
            e.preventDefault();
            e.returnValue = ''; 
        }
    });

    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href') === '#' || this.getAttribute('data-bs-toggle') || this.hostname !== window.location.hostname) return;
            
            if (isDirty()) {
                e.preventDefault();
                targetUrl = this.href;
                unsavedModal.show();
            }
        });
    });

    document.querySelectorAll('.pref-auto-save').forEach(input => {
        input.addEventListener('change', async () => {
            const formData = new FormData();
            document.querySelectorAll('.pref-auto-save').forEach(i => {
                if (i.type === 'checkbox') {
                    if (i.checked) formData.append(i.name, 'on');
                } else {
                    formData.append(i.name, i.value);
                }
            });
            
            formData.append('csrf_token', CSRF_TOKEN);

            try {
                const response = await fetch(PREF_URL, {
                    method: 'POST',
                    body: formData,
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                });

                if (response.ok) {
                    saveToast.show();
                    const theme = formData.get('theme');
                    if (theme) {
                        const target = theme === 'system' 
                            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') 
                            : theme;
                        document.documentElement.setAttribute('data-bs-theme', target);
                    }
                }
            } catch (err) {
                console.error("Auto-save error:", err);
            }
        });
    });

    document.getElementById('confirmLeaveBtn').addEventListener('click', () => {
        skipCheck = true;
        window.location.href = targetUrl;
    });

    infoForm.addEventListener('submit', () => { skipCheck = true; });
});
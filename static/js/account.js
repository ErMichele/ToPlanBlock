document.addEventListener('DOMContentLoaded', function () {
    const infoForm = document.querySelector('form[enctype="multipart/form-data"]');
    const prefsForm = document.querySelector('form[action*="update_preferences"]');
    const unsavedModal = new bootstrap.Modal(document.getElementById('unsavedChangesModal'));
    const unsavedList = document.getElementById('unsavedList');

    let targetUrl = '';

    // Function to capture the current state of a form
    const getFormState = (form) => {
        const formData = new FormData(form);
        const state = {};
        for (let [key, value] of formData.entries()) {
            // Handle file inputs separately as they don't serialize to strings easily
            if (value instanceof File) {
                state[key] = value.name || '';
            } else {
                state[key] = value;
            }
        }
        return JSON.stringify(state);
    };

    // 1. Capture Initial States
    const initialInfoState = getFormState(infoForm);
    const initialPrefsState = getFormState(prefsForm);

    // 2. State Checkers
    const isInfoDirty = () => getFormState(infoForm) !== initialInfoState;
    const isPrefsDirty = () => getFormState(prefsForm) !== initialPrefsState;

    // 3. Intercept Navigation
    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function (e) {
            if (this.getAttribute('href') === '#' || this.getAttribute('data-bs-toggle')) return;

            const infoChanged = isInfoDirty();
            const prefsChanged = isPrefsDirty();

            if (infoChanged || prefsChanged) {
                e.preventDefault();
                targetUrl = this.href;

                // Populate the modal list based on current differences
                unsavedList.innerHTML = '';
                if (infoChanged) {
                    const li = document.createElement('li');
                    li.textContent = 'General Information';
                    unsavedList.appendChild(li);
                }
                if (prefsChanged) {
                    const li = document.createElement('li');
                    li.textContent = 'Account Preferences';
                    unsavedList.appendChild(li);
                }

                unsavedModal.show();
            }
        });
    });

    // 4. Handle "Leave Anyway"
    document.getElementById('confirmLeaveBtn').addEventListener('click', () => {
        window.location.href = targetUrl;
    });

    // 5. Browser-level protection (tab close/refresh)
    window.addEventListener('beforeunload', (e) => {
        if (isInfoDirty() || isPrefsDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});
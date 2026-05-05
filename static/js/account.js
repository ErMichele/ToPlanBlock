document.addEventListener('DOMContentLoaded', function () {
    const infoForm = document.getElementById('profileForm');
    const unsavedModal = new bootstrap.Modal(document.getElementById('unsavedChangesModal'))
    let targetUrl = '';
    let skipCheck = false;
    const fileInput = infoForm.querySelector('input[name="picture"]');
    const profileImg = document.getElementById('profile-img');
    const fallbackAvatar = document.getElementById('fallback-avatar');
    let cropper;
    const cropperModal = new bootstrap.Modal(document.getElementById('cropperModal'));
    const cropperImg = document.getElementById('cropper-image');
    const saveCropBtn = document.getElementById('saveCropBtn');
    const originalSrc = profileImg.src;

    const handleImageError = () => {
        profileImg.classList.add('d-none');
        fallbackAvatar.classList.remove('d-none');
    };

    profileImg.addEventListener('error', handleImageError);

    if (profileImg.complete && profileImg.naturalWidth === 0) {
        handleImageError();
    }

    fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                cropperImg.src = e.target.result;
                cropperModal.show();
            };
            reader.readAsDataURL(this.files[0]);
        } else {
            profileImg.src = originalSrc;
        }
    });

    document.getElementById('cropperModal').addEventListener('shown.bs.modal', function () {
        cropper = new Cropper(cropperImg, {
            aspectRatio: 1,
            viewMode: 1,
            guides: false,
        });
    });

    document.getElementById('cropperModal').addEventListener('hidden.bs.modal', function () {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }

        if (!profileImg.src.startsWith('data:image')) {
            fileInput.value = ""; 
        }
    });

    saveCropBtn.addEventListener('click', () => {
        const canvas = cropper.getCroppedCanvas({ width: 400, height: 400 });
        
        canvas.toBlob((blob) => {
            const originalFileName = fileInput.files && fileInput.files[0] ? fileInput.files[0].name : 'profile.jpg';
            const croppedFile = new File([blob], originalFileName, { type: "image/jpeg" });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(croppedFile);
            fileInput.files = dataTransfer.files;
            profileImg.src = canvas.toDataURL('image/jpeg');
            profileImg.classList.remove('d-none');
            fallbackAvatar.classList.add('d-none');
            cropperModal.hide();
            initialInfo = initialInfo;
        }, 'image/jpeg');
    });

    const getFormState = (form) => {
        const formData = new FormData(form);
        const state = {};
        for (let [key, value] of formData.entries()) {
            if (['current_password', 'csrf_token'].includes(key)) continue;
            state[key] = (key === 'picture') ? (value.name || "") : value;
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
        }
    });

    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function (e) {
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
                    window.showToast("Preferences saved automatically.", "success");
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
    const exportBtn = document.getElementById('exportBtn');

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                const response = await fetch(EXPORT_URL);
                if (!response.ok) throw new Error('Export failed');
                const disposition = response.headers.get('Content-Disposition');
                let filename = `tasks_export_${new Date().toISOString().slice(0, 10)}.json`;
                if (disposition && disposition.includes('filename=')) {
                    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                    const matches = filenameRegex.exec(disposition);
                    if (matches != null && matches[1]) {
                        filename = matches[1].replace(/['"]/g, '');
                    }
                }
                const blob = await response.blob();
                if ('showSaveFilePicker' in window) {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: 'JSON File',
                            accept: { 'application/json': ['.json'] },
                        }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } else {
                    // Fallback for browsers like Firefox
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Export error:", err);
                }
            }
        });
    }
});
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
    const originalProfileImgHidden = profileImg.classList.contains('d-none');
    const originalFallbackAvatarHidden = fallbackAvatar.classList.contains('d-none');

    let currentImageSrc = profileImg.src;
    let cropSaved = false;
    let originalFileName = 'profile_pic.webp';

    const restoreOriginalState = () => {
        fileInput.value = "";
        profileImg.src = originalSrc;
        currentImageSrc = originalSrc;
        cropSaved = false;

        if (originalProfileImgHidden) {
            profileImg.classList.add('d-none');
        } else {
            profileImg.classList.remove('d-none');
        }

        if (originalFallbackAvatarHidden) {
            fallbackAvatar.classList.add('d-none');
        } else {
            fallbackAvatar.classList.remove('d-none');
        }
    };

    const handleImageError = () => {
        profileImg.classList.add('d-none');
        fallbackAvatar.classList.remove('d-none');
    };

    profileImg.addEventListener('error', handleImageError);

    if (profileImg.complete && profileImg.naturalWidth === 0) {
        handleImageError();
    }

    fileInput.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            const originalName = this.files[0].name;
            const lastDot = originalName.lastIndexOf('.');
            originalFileName = (lastDot !== -1 ? originalName.substring(0, lastDot) : originalName) + '.webp';

            const reader = new FileReader();
            reader.onload = (e) => {
                cropperImg.src = e.target.result;
                cropperModal.show();
            };
            reader.readAsDataURL(this.files[0]);
        } else {
            // Triggered if a user cancels out of the browser's native file picker and empties it
            restoreOriginalState();
            cropperModal.hide();
        }
    });

    document.getElementById('cropperModal').addEventListener('shown.bs.modal', function () {
        cropper = new Cropper(cropperImg, {
            aspectRatio: 1,
            viewMode: 1,
            autoCropArea: 1
        });
    });

    document.getElementById('cropperModal').addEventListener('hidden.bs.modal', function () {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        if (!cropSaved) {
            restoreOriginalState();
        }
        cropSaved = false; // Reset state tracking
    });

    saveCropBtn.addEventListener('click', function () {
        if (cropper) {
            cropper.getCroppedCanvas({ width: 400, height: 400 }).toBlob((blob) => {
                const dataTransfer = new DataTransfer();
                const file = new File([blob], originalFileName, { type: "image/webp" });
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;

                const url = URL.createObjectURL(blob);
                profileImg.src = url;
                currentImageSrc = url;
                cropSaved = true;

                fallbackAvatar.classList.add('d-none');
                profileImg.classList.remove('d-none');
                cropperModal.hide();
            }, 'image/webp', 0.85);
        }
    });

    const prefsContainer = document.getElementById('prefsContainer');
    if (prefsContainer) {
        prefsContainer.addEventListener('change', async function (e) {
            if (e.target.classList.contains('pref-auto-save') || e.target.closest('.pref-auto-save')) {
                const formData = new FormData();
                
                const csrfInput = document.querySelector('input[name="csrf_token"]');
                if (csrfInput) {
                    formData.append('csrf_token', csrfInput.value);
                }
                
                const inputs = prefsContainer.querySelectorAll('select, input');
                inputs.forEach(input => {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        if (input.checked) {
                            formData.append(input.name, input.value || 'on');
                        }
                    } else {
                        formData.append(input.name, input.value);
                    }
                });

                const themeSelect = prefsContainer.querySelector('select[name="theme"]');
                if (themeSelect) {
                    const selectedTheme = themeSelect.value;
                    document.documentElement.setAttribute('data-theme-pref', selectedTheme);
                    if (selectedTheme === 'system') {
                        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                        document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
                    } else {
                        document.documentElement.setAttribute('data-bs-theme', selectedTheme);
                    }
                }

                try {
                    const response = await fetch('/update_preferences', {
                        method: 'POST',
                        body: formData,
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    });
                    if (response.ok) {
                        if (window.showToast) {
                            window.showToast('Preferences auto-saved!', 'success');
                        }
                    } else {
                        if (window.showToast) {
                            window.showToast('Failed to auto-save preferences.', 'danger');
                        }
                    }
                } catch (err) {
                    console.error('Error saving preferences:', err);
                }
            }
        });
    }

    function getFormStateString(form) {
        const formData = new FormData(form);
        const params = new URLSearchParams();
        for (const [key, value] of formData.entries()) {
            if (value instanceof File) {
                if (value.name === "" && value.size === 0) {
                    params.append(key, "empty");
                } else {
                    params.append(key, `${value.name}:${value.size}`);
                }
            } else {
                params.append(key, value);
            }
        }
        return params.toString();
    }

    let initialDataString = getFormStateString(infoForm);

    window.addEventListener('beforeunload', function (e) {
        if (skipCheck) return;
        let currentDataString = getFormStateString(infoForm);

        if (currentDataString !== initialDataString) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes!';
        }
    });

    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function (e) {
            if (skipCheck) return;
            let currentDataString = getFormStateString(infoForm);

            const href = this.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

            if (currentDataString !== initialDataString) {
                e.preventDefault();
                targetUrl = this.href;
                unsavedModal.show();
            }
        });
    });

    document.getElementById('confirmLeaveBtn').addEventListener('click', function () {
        skipCheck = true;
        unsavedModal.hide();
        window.location.href = targetUrl;
    });

    infoForm.addEventListener('submit', function () {
        skipCheck = true;
        window.toggleLoading(true);
    });

    async function handleExport(buttonElement) {
        const href = buttonElement.getAttribute('href');
        if (!href) return;

        const urlObj = new URL(href, window.location.origin);
        const format = urlObj.searchParams.get('format') || 'json';
        const isCsv = format === 'csv';
        const filename = `tasks_export_${new Date().toISOString().slice(0,10)}.${format}`;

        try {
            window.toggleLoading(true);
            const response = await fetch(href);
            window.toggleLoading(false);

            if (!response.ok) throw new Error('Export network error response.');

            const blob = await response.blob();

            if ('showSaveFilePicker' in window) {
                const pickerOptions = {
                    suggestedName: filename,
                    types: isCsv ? [{
                        description: 'CSV File',
                        accept: { 'text/csv': ['.csv'] }
                    }] : [{
                        description: 'JSON File',
                        accept: { 'application/json': ['.json'] }
                    }]
                };
                const handle = await window.showSaveFilePicker(pickerOptions);
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
            } else {
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
            window.toggleLoading(false);
            if (err.name !== 'AbortError') {
                console.error("Export error:", err);
            }
        }
    }

    const exportButtons = document.querySelectorAll('a[href*="/export/tasks"]');
    exportButtons.forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            handleExport(this);
        });
    });
});
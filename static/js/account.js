/**
 * ProfileImageCropper - Manages image selection, canvas cropping updates,
 * and avatar placeholder fallback configurations.
 */
class ProfileImageCropper {
    constructor(form, cropperModalEl, saveCropBtn, profileImg, fallbackAvatar) {
        this.form = form;
        this.cropperModalEl = cropperModalEl;
        this.saveCropBtn = saveCropBtn;
        this.profileImg = profileImg;
        this.fallbackAvatar = fallbackAvatar;
        
        if (!this.form || !this.profileImg) return;

        this.fileInput = this.form.querySelector('input[name="picture"]');
        this.cropperImg = document.getElementById('cropper-image');
        this.bootstrapModal = new bootstrap.Modal(this.cropperModalEl);

        // Layout baselines for resetting states
        this.originalSrc = this.profileImg.src;
        this.originalProfileImgHidden = this.profileImg.classList.contains('d-none');
        this.originalFallbackAvatarHidden = this.fallbackAvatar ? this.fallbackAvatar.classList.contains('d-none') : false;

        this.cropper = null;
        this.cropSaved = false;
        this.originalFileName = 'profile_pic.webp';

        this.init();
    }

    init() {
        this.bindEvents();
    }

    restoreOriginalState() {
        if (!this.fileInput) return;
        this.fileInput.value = "";
        this.profileImg.src = this.originalSrc;
        this.cropSaved = false;

        if (this.originalProfileImgHidden) {
            this.profileImg.classList.add('d-none');
        } else {
            this.profileImg.classList.remove('d-none');
        }

        if (this.fallbackAvatar) {
            if (this.originalFallbackAvatarHidden) {
                this.fallbackAvatar.classList.add('d-none');
            } else {
                this.fallbackAvatar.classList.remove('d-none');
            }
        }
    }

    handleImageError() {
        if (this.profileImg && this.fallbackAvatar) {
            this.profileImg.classList.add('d-none');
            this.fallbackAvatar.classList.remove('d-none');
        }
    }

    bindEvents() {
        // Image missing error bounds checking
        this.profileImg.addEventListener('error', () => this.handleImageError());
        if (this.profileImg.complete && this.profileImg.naturalWidth === 0) {
            this.handleImageError();
        }

        // File Selection handling
        this.fileInput?.addEventListener('change', (e) => {
            const input = e.target;
            if (input.files && input.files[0]) {
                const originalName = input.files[0].name;
                const lastDot = originalName.lastIndexOf('.');
                this.originalFileName = (lastDot !== -1 ? originalName.substring(0, lastDot) : originalName) + '.webp';

                const reader = new FileReader();
                reader.onload = (event) => {
                    this.cropperImg.src = event.target.result;
                    this.bootstrapModal.show();
                };
                reader.readAsDataURL(input.files[0]);
            } else {
                this.restoreOriginalState();
                this.bootstrapModal.hide();
            }
        });

        // Cropper Initialization Hooks
        this.cropperModalEl.addEventListener('shown.bs.modal', () => {
            this.cropper = new Cropper(this.cropperImg, {
                aspectRatio: 1,
                viewMode: 1,
                autoCropArea: 1
            });
        });

        this.cropperModalEl.addEventListener('hidden.bs.modal', () => {
            if (this.cropper) {
                this.cropper.destroy();
                this.cropper = null;
            }
            if (!this.cropSaved) {
                this.restoreOriginalState();
            }
            this.cropSaved = false; 
        });

        // Save layout crop data transformations
        this.saveCropBtn?.addEventListener('click', () => {
            if (this.cropper) {
                this.cropper.getCroppedCanvas({ width: 400, height: 400 }).toBlob((blob) => {
                    const dataTransfer = new DataTransfer();
                    const file = new File([blob], this.originalFileName, { type: "image/webp" });
                    dataTransfer.items.add(file);
                    this.fileInput.files = dataTransfer.files;

                    const url = URL.createObjectURL(blob);
                    this.profileImg.src = url;
                    this.cropSaved = true;

                    this.fallbackAvatar?.classList.add('d-none');
                    this.profileImg.classList.remove('d-none');
                    this.bootstrapModal.hide();
                }, 'image/webp', 0.85);
            }
        });
    }
}

/**
 * PreferencesManager - Watches customization layouts container to sync options via background AJAX payloads.
 */
class PreferencesManager {
    constructor(container) {
        this.container = container;
        if (!this.container) return;
        this.init();
    }

    init() {
        this.container.addEventListener('change', (e) => {
            if (e.target.classList.contains('pref-auto-save') || e.target.closest('.pref-auto-save')) {
                this.autoSave();
            }
        });
    }

    async autoSave() {
        const formData = new FormData();
        const csrfInput = document.querySelector('input[name="csrf_token"]');
        if (csrfInput) {
            formData.append('csrf_token', csrfInput.value);
        }
        
        const inputs = this.container.querySelectorAll('select, input');
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                if (input.checked) {
                    formData.append(input.name, input.value || 'on');
                }
            } else {
                formData.append(input.name, input.value);
            }
        });

        this.applyLivePreviewUpdates();

        try {
            const response = await fetch('/update_preferences', {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            if (response.ok) {
                window.showToast?.('Preferences auto-saved!', 'success');
            } else {
                window.showToast?.('Failed to auto-save preferences.', 'danger');
            }
        } catch (err) {
            console.error('Error saving preferences:', err);
        }
    }

    applyLivePreviewUpdates() {
        const themeSelect = this.container.querySelector('select[name="theme"]');
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

        const uiToneSelect = this.container.querySelector('select[name="ui_tone"]');
        if (uiToneSelect) {
            document.documentElement.setAttribute('data-ui-tone', uiToneSelect.value);
        }

        const cornersSelect = this.container.querySelector('select[name="corners"]');
        if (cornersSelect) {
            document.documentElement.setAttribute('data-corners', cornersSelect.value);
        }
    }
}

/**
 * AccountManager - Main orchestrator handling state dirty flags, profile submissions, and tasks conversions links.
 */
class AccountManager {
    constructor() {
        this.infoForm = document.getElementById('profileForm');
        if (!this.infoForm) return;

        this.unsavedModal = new bootstrap.Modal(document.getElementById('unsavedChangesModal'));
        this.targetUrl = '';
        this.skipCheck = false;

        // Capture initial form snapshot baseline
        this.initialDataString = this.getFormStateString(this.infoForm);

        this.initSubComponents();
        this.init();
    }

    initSubComponents() {
        // Instantiate child managers mapping directly to matching markup DOM definitions
        new ProfileImageCropper(
            this.infoForm,
            document.getElementById('cropperModal'),
            document.getElementById('saveCropBtn'),
            document.getElementById('profile-img'),
            document.getElementById('fallback-avatar')
        );

        new PreferencesManager(document.getElementById('prefsContainer'));
    }

    init() {
        this.bindNavigationValidation();
        this.bindExportEvents();
    }

    /**
     * Serializes layout elements to capture mutations.
     * BUG FIX: Omitting 'current_password' guarantees password manager background auto-fills 
     * won't mismatch states causing phantom validation prompts.
     */
    getFormStateString(form) {
        const formData = new FormData(form);
        const params = new URLSearchParams();

        for (const [key, value] of formData.entries()) {
            if (key === 'current_password') continue;

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

    bindNavigationValidation() {
        window.addEventListener('beforeunload', (e) => {
            if (this.skipCheck) return;
            if (this.getFormStateString(this.infoForm) !== this.initialDataString) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes!';
            }
        });

        document.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                if (this.skipCheck) return;
                
                const href = link.getAttribute('href');
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

                if (this.getFormStateString(this.infoForm) !== this.initialDataString) {
                    e.preventDefault();
                    this.targetUrl = link.href;
                    this.unsavedModal.show();
                }
            });
        });

        document.getElementById('confirmLeaveBtn')?.addEventListener('click', () => {
            this.skipCheck = true;
            this.unsavedModal.hide();
            window.location.href = this.targetUrl;
        });

        this.infoForm.addEventListener('submit', () => {
            this.skipCheck = true;
            window.toggleLoading?.(true);
        });
    }

    bindExportEvents() {
        const exportButtons = document.querySelectorAll('a[href*="/export/tasks"]');
        exportButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleDataExport(btn);
            });
        });
    }

    async handleDataExport(buttonElement) {
        const href = buttonElement.getAttribute('href');
        if (!href) return;

        const urlObj = new URL(href, window.location.origin);
        const format = urlObj.searchParams.get('format') || 'json';
        const isCsv = format === 'csv';
        const filename = `tasks_export_${new Date().toISOString().slice(0,10)}.${format}`;

        try {
            window.toggleLoading?.(true);
            const response = await fetch(href);
            window.toggleLoading?.(false);

            if (!response.ok) throw new Error('Data transmission error during data export operations.');

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
            window.toggleLoading?.(false);
            if (err.name !== 'AbortError') {
                console.error("Export error encountered:", err);
            }
        }
    }
}

// Initializing orchestration execution blocks cleanly on DOM complete load hooks
document.addEventListener('DOMContentLoaded', () => {
    new AccountManager();
});
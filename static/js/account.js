/**
 * ProfileImageCropper
 * Handles profile picture selection, interactive canvas cropping via Cropper.js,
 * and fallback avatar placeholder state management.
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

        // Snapshot the initial avatar state so it can be restored on modal cancel
        this.originalSrc = this.profileImg.src;
        this.originalProfileImgHidden = this.profileImg.classList.contains('d-none');
        this.originalFallbackAvatarHidden = this.fallbackAvatar
            ? this.fallbackAvatar.classList.contains('d-none')
            : false;

        this.cropper = null;
        this.cropSaved = false;
        this.originalFileName = 'profile_pic.webp';

        this.bindEvents();
    }

    restoreOriginalState() {
        if (!this.fileInput) return;
        this.fileInput.value = '';
        this.profileImg.src = this.originalSrc;
        this.cropSaved = false;

        this.profileImg.classList.toggle('d-none', this.originalProfileImgHidden);

        if (this.fallbackAvatar) {
            this.fallbackAvatar.classList.toggle('d-none', this.originalFallbackAvatarHidden);
        }
    }

    handleImageError() {
        if (this.profileImg && this.fallbackAvatar) {
            this.profileImg.classList.add('d-none');
            this.fallbackAvatar.classList.remove('d-none');
        }
    }

    bindEvents() {
        // Fall back to the initial letter avatar if the image URL fails to load
        this.profileImg.addEventListener('error', () => this.handleImageError());
        if (this.profileImg.complete && this.profileImg.naturalWidth === 0) {
            this.handleImageError();
        }

        this.fileInput?.addEventListener('change', (e) => {
            const input = e.target;
            if (!input.files?.length) {
                this.restoreOriginalState();
                this.bootstrapModal.hide();
                return;
            }

            const originalName = input.files[0].name;
            const lastDot = originalName.lastIndexOf('.');
            this.originalFileName =
                (lastDot !== -1 ? originalName.substring(0, lastDot) : originalName) + '.webp';

            const reader = new FileReader();
            reader.onload = (event) => {
                this.cropperImg.src = event.target.result;
                this.bootstrapModal.show();
            };
            reader.readAsDataURL(input.files[0]);
        });

        this.cropperModalEl.addEventListener('shown.bs.modal', () => {
            this.cropper = new Cropper(this.cropperImg, {
                aspectRatio: 1,
                viewMode: 1,
                autoCropArea: 1,
            });
        });

        this.cropperModalEl.addEventListener('hidden.bs.modal', () => {
            if (this.cropper) {
                this.cropper.destroy();
                this.cropper = null;
            }
            // If the user dismissed without saving, revert to the previous state
            if (!this.cropSaved) this.restoreOriginalState();
            this.cropSaved = false;
        });

        this.saveCropBtn?.addEventListener('click', () => {
            if (!this.cropper) return;

            this.cropper.getCroppedCanvas({ width: 400, height: 400 }).toBlob((blob) => {
                const file = new File([blob], this.originalFileName, { type: 'image/webp' });
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                this.fileInput.files = dataTransfer.files;

                this.profileImg.src = URL.createObjectURL(blob);
                this.cropSaved = true;

                this.fallbackAvatar?.classList.add('d-none');
                this.profileImg.classList.remove('d-none');
                this.bootstrapModal.hide();
            }, 'image/webp', 0.85);
        });
    }
}

/**
 * PreferencesManager
 * Listens for changes inside the preferences panel and persists them
 * via a background AJAX POST, applying visual updates immediately.
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
        if (csrfInput) formData.append('csrf_token', csrfInput.value);

        this.container.querySelectorAll('select, input').forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                if (input.checked) formData.append(input.name, input.value || 'on');
            } else {
                formData.append(input.name, input.value);
            }
        });

        // Apply theme, tone, and corner changes immediately before the server round-trip
        this.applyLivePreviewUpdates();

        try {
            const response = await fetch('/update_preferences', {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
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
            const selected = themeSelect.value;
            document.documentElement.setAttribute('data-theme-pref', selected);
            if (selected === 'system') {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
            } else {
                document.documentElement.setAttribute('data-bs-theme', selected);
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
 * AccountManager
 * Top-level orchestrator for the account settings page.
 * Manages unsaved-change guards, delegates to sub-components, and handles data exports.
 */
class AccountManager {
    constructor() {
        this.infoForm = document.getElementById('profileForm');
        if (!this.infoForm) return;

        this.unsavedModal = new bootstrap.Modal(document.getElementById('unsavedChangesModal'));
        this.targetUrl = '';
        this.skipCheck = false;

        this.initialDataString = this.getFormStateString(this.infoForm);

        this.initSubComponents();
        this.bindNavigationValidation();
        this.bindExportEvents();
    }

    initSubComponents() {
        new ProfileImageCropper(
            this.infoForm,
            document.getElementById('cropperModal'),
            document.getElementById('saveCropBtn'),
            document.getElementById('profile-img'),
            document.getElementById('fallback-avatar')
        );

        new PreferencesManager(document.getElementById('prefsContainer'));
    }

    /**
     * Serialises the profile form into a comparable string to detect mutations.
     * 'current_password' is intentionally excluded: password-manager auto-fills
     * would otherwise trigger phantom "unsaved changes" warnings on page load.
     */
    getFormStateString(form) {
        const formData = new FormData(form);
        const params = new URLSearchParams();

        for (const [key, value] of formData.entries()) {
            if (key === 'current_password') continue;

            if (value instanceof File) {
                params.append(key, value.name && value.size ? `${value.name}:${value.size}` : 'empty');
            } else {
                params.append(key, value);
            }
        }

        return params.toString();
    }

    bindNavigationValidation() {
        // Warn the browser natively when the user tries to close or reload the tab
        window.addEventListener('beforeunload', (e) => {
            if (this.skipCheck) return;
            if (this.getFormStateString(this.infoForm) !== this.initialDataString) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes!';
            }
        });

        // Intercept internal link clicks and show the custom modal instead
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

        // Allow the form to submit without triggering the unsaved-changes guard
        this.infoForm.addEventListener('submit', () => {
            this.skipCheck = true;
            window.toggleLoading?.(true);
        });
    }

    bindExportEvents() {
        document.querySelectorAll('a[href*="/export/tasks"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleDataExport(btn);
            });
        });
    }

    /**
     * Streams the export response to disk.
     * Prefers the File System Access API (showSaveFilePicker) when available;
     * falls back to a programmatic <a> click for older browsers.
     */
    async handleDataExport(buttonElement) {
        const href = buttonElement.getAttribute('href');
        if (!href) return;

        const urlObj = new URL(href, window.location.origin);
        const format = urlObj.searchParams.get('format') || 'json';
        const isCsv = format === 'csv';
        const filename = `tasks_export_${new Date().toISOString().slice(0, 10)}.${format}`;

        try {
            window.toggleLoading?.(true);
            const response = await fetch(href);
            window.toggleLoading?.(false);

            if (!response.ok) throw new Error('Export request failed.');

            const blob = await response.blob();

            if ('showSaveFilePicker' in window) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: isCsv
                        ? [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }]
                        : [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
            } else {
                const url = URL.createObjectURL(blob);
                const a = Object.assign(document.createElement('a'), { href: url, download: filename });
                document.body.appendChild(a);
                a.click();
                URL.revokeObjectURL(url);
                a.remove();
            }
        } catch (err) {
            window.toggleLoading?.(false);
            if (err.name !== 'AbortError') console.error('Export error:', err);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AccountManager();
});
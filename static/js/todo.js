/**
 * TagInputManager
 * Renders an interactive tag/chip input with autocomplete suggestions,
 * keyboard shortcuts (Enter/Comma to add, Backspace to remove),
 * and a hidden CSV field kept in sync for form submission.
 */
class TagInputManager {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.container = wrapper.querySelector('.tag-input-container');
        this.input = wrapper.querySelector('.tag-input-field');
        this.hiddenInput = wrapper.querySelector('.tags-hidden-input');
        this.suggestions = wrapper.querySelector('.suggestions-list');

        this.tags = this.hiddenInput.value
            ? this.hiddenInput.value.split(',').map(t => t.trim()).filter(Boolean)
            : [];

        this.init();
    }

    init() {
        this.renderTags();

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                this.addTag(this.input.value);
            }

            // Backspace on empty input removes the last tag
            if (e.key === 'Backspace' && this.input.value.trim() === '' && this.tags.length) {
                this.removeTag(this.tags[this.tags.length - 1]);
            }
        });

        this.input.addEventListener('input', () => this.filterSuggestions());

        this.suggestions.addEventListener('click', (e) => {
            const item = e.target.closest('.suggestion-item');
            if (!item) return;
            this.addTag(item.dataset.value);
            this.input.focus();
        });

        this.container.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-tag');
            if (removeBtn) {
                this.removeTag(removeBtn.dataset.item);
                return;
            }
            this.input.focus();
        });

        // Hide the suggestion dropdown when clicking anywhere outside the widget
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) this.hideSuggestions();
        });

        // Flush any partially typed tag when the parent form is submitted
        const form = this.wrapper.closest('form');
        if (form) {
            form.addEventListener('submit', () => {
                if (this.input.value.trim()) this.addTag(this.input.value);
            });
        }
    }

    normalize(tag) {
        return tag.trim().toUpperCase();
    }

    addTag(tag) {
        const normalized = this.normalize(tag);
        if (!normalized) return;

        if (!this.tags.includes(normalized)) {
            this.tags.push(normalized);
            this.lastAddedTag = normalized;
            this.update();
            this.lastAddedTag = null;
        }

        this.input.value = '';
        this.hideSuggestions();
    }

    removeTag(tag) {
        this.tags = this.tags.filter(t => t !== tag);
        this.update();
    }

    update() {
        this.renderTags();
        this.syncHiddenInput();
    }

    syncHiddenInput() {
        this.hiddenInput.value = this.tags.join(',');
    }

    renderTags() {
        // Clear existing badge elements before re-rendering
        this.container.querySelectorAll('.tag-badge').forEach(el => el.remove());

        this.tags.forEach(tag => {
            const matchSuggestion = this.suggestions.querySelector(`.suggestion-item[data-value="${tag}"]`);
            let color = matchSuggestion?.dataset.color || 'var(--bs-primary)';
            if (color === 'None' || color === 'null') color = 'var(--bs-primary)';

            const badge = document.createElement('div');
            badge.className = 'tag-badge badge rounded d-flex align-items-center gap-2 px-3 py-2';

            // Play the pop-in animation only for the most recently added tag
            if (tag === this.lastAddedTag) badge.classList.add('tag-badge-animated');

            badge.style.backgroundColor = color;
            badge.style.color = '#fff';
            badge.innerHTML = `
                <span>${tag}</span>
                <span class="remove-tag cursor-pointer" role="button" data-item="${tag}">&times;</span>
            `;

            this.container.insertBefore(badge, this.input);
        });
    }

    filterSuggestions() {
        const query = this.normalize(this.input.value);
        let visibleCount = 0;

        this.suggestions.querySelectorAll('.suggestion-item').forEach(item => {
            const value = this.normalize(item.dataset.value);
            const show = query && value.includes(query) && !this.tags.includes(value);
            item.style.display = show ? 'block' : 'none';
            if (show) visibleCount++;
        });

        this.suggestions.style.display = visibleCount > 0 ? 'block' : 'none';
    }

    hideSuggestions() {
        this.suggestions.style.display = 'none';
    }
}

/**
 * BulkSelectionManager
 * Tracks which task checkboxes are selected across AJAX-driven pagination
 * by storing IDs in a persistent Set, surviving DOM replacements.
 */
class BulkSelectionManager {
    constructor(options = {}) {
        this.checkboxSelector = options.checkboxSelector || '.todo-checkbox';
        this.selectAllSelector = options.selectAllSelector || '#selectAll';
        this.bulkBtnSelector = options.bulkBtnSelector || '#bulkActionsBtn';

        this.selectedIds = new Set();
        this.initEvents();
    }

    initEvents() {
        // Event delegation handles checkboxes injected after initial page load
        document.addEventListener('change', (e) => {
            if (e.target.matches(this.checkboxSelector)) {
                this.handleCheckboxChange(e.target);
            } else if (e.target.matches(this.selectAllSelector)) {
                this.handleSelectAllChange(e.target);
            }
        });
    }

    handleCheckboxChange(cb) {
        cb.checked ? this.selectedIds.add(cb.value) : this.selectedIds.delete(cb.value);
        this.syncSelectAllState();
        this.updateBulkButtonState();
    }

    handleSelectAllChange(selectAllCb) {
        document.querySelectorAll(this.checkboxSelector).forEach(cb => {
            cb.checked = selectAllCb.checked;
            selectAllCb.checked ? this.selectedIds.add(cb.value) : this.selectedIds.delete(cb.value);
        });
        this.updateBulkButtonState();
    }

    /** Re-applies stored selection state to freshly rendered checkboxes after an AJAX swap. */
    syncUI() {
        document.querySelectorAll(this.checkboxSelector).forEach(cb => {
            cb.checked = this.selectedIds.has(cb.value);
        });
        this.syncSelectAllState();
        this.updateBulkButtonState();
    }

    syncSelectAllState() {
        const selectAllCb = document.querySelector(this.selectAllSelector);
        if (!selectAllCb) return;
        const checkboxes = document.querySelectorAll(this.checkboxSelector);
        selectAllCb.checked = checkboxes.length > 0 && [...checkboxes].every(cb => cb.checked);
    }

    updateBulkButtonState() {
        const bulkBtn = document.querySelector(this.bulkBtnSelector);
        if (bulkBtn) bulkBtn.disabled = this.selectedIds.size === 0;
    }

    clear() {
        this.selectedIds.clear();
        this.syncUI();
    }

    getIds() {
        return Array.from(this.selectedIds);
    }
}

/**
 * TodoAJAXManager
 * Central controller for the task list page. Intercepts form submissions and
 * navigation links to perform AJAX requests, then surgically replaces only the
 * sidebar and task-list DOM regions to avoid a full page reload.
 */
class TodoAJAXManager {
    constructor() {
        this.bulkManager = new BulkSelectionManager({
            checkboxSelector: '.todo-checkbox',
            selectAllSelector: '#selectAll',
            bulkBtnSelector: '#bulkActionsBtn',
        });

        // Category filter state is preserved in a Set so it survives AJAX pagination renders
        this.selectedCategories = new Set();
        this.initCategories();
        this.bindGlobalEvents();
    }

    /** Hydrates selectedCategories from the hidden input written by the server on first load. */
    initCategories() {
        const filterInput = document.getElementById('filter-category-input');
        if (filterInput?.value.trim()) {
            filterInput.value.split(',').forEach(cat => {
                const trimmed = cat.trim();
                if (trimmed) this.selectedCategories.add(trimmed);
            });
        }
    }

    hasCategory(catName) {
        return [...this.selectedCategories].some(c => c.toUpperCase() === catName.toUpperCase());
    }

    deleteCategory(catName) {
        for (const c of this.selectedCategories) {
            if (c.toUpperCase() === catName.toUpperCase()) this.selectedCategories.delete(c);
        }
    }

    /** Writes the active filter set back to the hidden input and repaints all sidebar badges. */
    syncCategoryUI() {
        const filterInput = document.getElementById('filter-category-input');
        if (filterInput) filterInput.value = Array.from(this.selectedCategories).join(',');

        document.querySelectorAll('.category-filter-item').forEach(item => {
            const catName = item.getAttribute('data-cat-name');
            const catColor = item.getAttribute('data-cat-color');
            const checkIconSpan = item.querySelector('.category-check-icon');
            const badgeSpan = item.querySelector('.badge');
            const isActive = this.hasCategory(catName);

            if (checkIconSpan) {
                checkIconSpan.innerHTML = isActive
                    ? `<i class="bi bi-check-circle-fill" style="color: ${catColor}; font-size: 1.1rem;"></i>`
                    : '<i class="bi bi-circle text-muted" style="font-size: 1.1rem;"></i>';
            }

            if (badgeSpan) {
                if (isActive) {
                    badgeSpan.className = 'badge px-3 py-2 rounded text-white border';
                    badgeSpan.style.backgroundColor = catColor;
                    badgeSpan.style.borderColor = catColor;
                    badgeSpan.style.color = '#fff';
                    badgeSpan.style.opacity = '1';
                } else {
                    badgeSpan.className = 'badge px-3 py-2 rounded text-body border';
                    badgeSpan.style.backgroundColor = 'var(--bs-body-secondary)';
                    badgeSpan.style.borderColor = 'var(--bs-border-color)';
                    badgeSpan.style.color = 'var(--bs-body-color)';
                    badgeSpan.style.opacity = '0.85';
                }
            }
        });
    }

    /**
     * Reads --bs-primary from computed styles and converts it to a hex string.
     * Falls back to Bootstrap's default blue if the value cannot be parsed.
     */
    getThemePrimaryColor() {
        const computedStyle = getComputedStyle(document.documentElement);
        let color = computedStyle.getPropertyValue('--bs-primary').trim()
                 || computedStyle.getPropertyValue('--primary-color').trim();

        if (color.startsWith('rgb')) {
            const values = color.match(/\d+/g);
            if (values?.length >= 3) {
                const toHex = n => parseInt(n).toString(16).padStart(2, '0');
                color = `#${toHex(values[0])}${toHex(values[1])}${toHex(values[2])}`;
            }
        }

        return color.startsWith('#') && color.length === 7 ? color : '#0d6efd';
    }

    /** Syncs color picker values to the current theme color when a category modal is opened. */
    initModalColorPickers(modalElement) {
        const defaultColor = this.getThemePrimaryColor();

        modalElement.querySelectorAll('.theme-color-toggle').forEach(toggle => {
            const picker = modalElement.querySelector(`#${toggle.getAttribute('data-target')}`);
            if (!picker) return;

            if (toggle.checked) {
                picker.disabled = true;
                picker.style.opacity = '0.5';
                picker.value = defaultColor;
            } else {
                picker.disabled = false;
                picker.style.opacity = '1';
            }
        });
    }

    bindGlobalEvents() {
        // Clean up stale Bootstrap modal artefacts after any modal closes
        document.addEventListener('hidden.bs.modal', () => {
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            document.body.style.removeProperty('overflow');
        });

        document.addEventListener('shown.bs.modal', (e) => {
            const modal = e.target;

            if (modal.querySelector('.modal-task-checkbox') || modal.querySelector('.task-modal-search')) {
                this.updateCategoryModalState(modal);

                const searchInput = modal.querySelector('.task-modal-search');
                if (searchInput) {
                    searchInput.value = '';
                    modal.querySelectorAll('.modal-task-row').forEach(row => {
                        row.classList.remove('d-none');
                        row.classList.add('d-flex');
                    });
                    searchInput.focus();
                }
            }

            this.initModalColorPickers(modal);
        });

        // Live task search inside category modals
        document.addEventListener('input', (e) => {
            if (!e.target.matches('.task-modal-search')) return;

            const filterValue = e.target.value.toLowerCase().trim();
            const modal = e.target.closest('.modal');
            if (!modal) return;

            modal.querySelectorAll('.modal-task-row').forEach(row => {
                const textSpan = row.querySelector('.task-text-span');
                const text = textSpan ? textSpan.textContent.toLowerCase() : row.textContent.toLowerCase();
                const visible = text.includes(filterValue);
                row.classList.toggle('d-none', !visible);
                row.classList.toggle('d-flex', visible);
            });
        });

        document.addEventListener('change', (e) => {
            // Update the selection counter badge when a task checkbox in a modal changes
            if (e.target.matches('.modal-task-checkbox')) {
                const modal = e.target.closest('.modal');
                if (modal) this.updateCategoryModalState(modal);
            }

            // Toggle the associated color picker when the "use theme default" checkbox changes
            if (e.target.matches('.theme-color-toggle')) {
                const picker = document.getElementById(e.target.getAttribute('data-target'));
                if (!picker) return;

                if (e.target.checked) {
                    picker.disabled = true;
                    picker.style.opacity = '0.5';
                    picker.value = this.getThemePrimaryColor();
                } else {
                    picker.disabled = false;
                    picker.style.opacity = '1';
                }
            }
        });

        document.addEventListener('submit', (e) => {
            const form = e.target;
            const ajaxForms = ['#todo-form', '#bulk-form', '#ajax-search-form'];

            const shouldHandle =
                ajaxForms.some(sel => form.matches(sel)) ||
                form.action?.includes('/toggle') ||
                form.action?.includes('/delete') ||
                form.action?.includes('/edit') ||
                form.action?.includes('/category');

            if (!shouldHandle) return;

            e.preventDefault();
            this.submitForm(form);
        });

        document.addEventListener('click', (e) => {
            const toggleZone = e.target.closest('.category-toggle-zone');
            if (toggleZone) {
                e.preventDefault();
                this.toggleCategoryFilter(toggleZone);
                return;
            }

            const link = e.target.closest('.ajax-filter-trigger');
            if (!link) return;

            e.preventDefault();

            // Clicking "Clear Filters" resets the in-memory category selection
            if (link.textContent.includes('Clear') || link.querySelector('.bi-trash3')) {
                this.selectedCategories.clear();
            }

            let url = link.href;

            // The "Apply Filters" button appends the current category selection to the URL
            if (link.id === 'apply-filters-btn') {
                const filterInput = document.getElementById('filter-category-input');
                const categoriesValue = filterInput?.value || '';
                const baseUrl = link.getAttribute('data-base-url') || url;
                url = categoriesValue
                    ? baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'category=' + encodeURIComponent(categoriesValue)
                    : baseUrl;
            }

            this.loadPage(url);
        });

        document.addEventListener('show.bs.modal', (event) => {
            const button = event.relatedTarget;
            if (!button) return;

            const url = button.dataset.url;
            const modal = event.target;
            const form = modal.querySelector('form');

            if (url && form) form.action = url;
        });
    }

    /** Updates the "N selected" counter badge and row highlight states inside a category modal. */
    updateCategoryModalState(modalElement) {
        const totalChecked = modalElement.querySelectorAll('.modal-task-checkbox:checked').length;
        const counterBadge = modalElement.querySelector('.target-counter');
        if (counterBadge) counterBadge.textContent = `${totalChecked} selected`;

        modalElement.querySelectorAll('.modal-task-row').forEach(row => {
            const checked = row.querySelector('.modal-task-checkbox')?.checked;
            row.classList.toggle('modal-task-row-active', !!checked);
        });
    }

    toggleCategoryFilter(toggleZone) {
        const item = toggleZone.closest('.category-filter-item');
        if (!item) return;

        const catName = item.getAttribute('data-cat-name');
        if (!catName) return;

        // Trigger the pop animation on the badge
        const badgeSpan = item.querySelector('.badge');
        if (badgeSpan) {
            badgeSpan.classList.remove('badge-pop');
            void badgeSpan.offsetWidth; // force reflow to restart the animation
            badgeSpan.classList.add('badge-pop');
        }

        if (this.hasCategory(catName)) {
            this.deleteCategory(catName);
        } else {
            this.selectedCategories.add(catName);
        }

        this.syncCategoryUI();
    }

    async submitForm(form) {
        window.toggleLoading(true);

        try {
            const formData = new FormData(form);

            if (form.id === 'bulk-form') {
                const ids = this.bulkManager
                    ? this.bulkManager.getIds()
                    : [...document.querySelectorAll('.todo-checkbox:checked')].map(cb => cb.value);

                ids.forEach(id => formData.append('todo_ids', id));

                if (document.activeElement?.name === 'action') {
                    formData.append('action', document.activeElement.value);
                }
            }

            let url = form.getAttribute('action') || window.location.href;
            const method = (form.method || 'POST').toUpperCase();
            
            const fetchOptions = {
                method: method,
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            };

            if (method === 'GET' || method === 'HEAD') {
                const urlObj = new URL(url, window.location.origin);
                const params = new URLSearchParams(formData);
                
                for (const [key, value] of params.entries()) {
                    if (value.trim()) {
                        urlObj.searchParams.set(key, value);
                    } else {
                        urlObj.searchParams.delete(key);
                    }
                }
                
                if (params.has('search')) {
                    urlObj.searchParams.set('page', '1');
                }

                url = urlObj.pathname + urlObj.search;
            } else {
                fetchOptions.body = formData;
            }

            const response = await fetch(url, fetchOptions);
            const contentType = response.headers.get('content-type');

            if (contentType?.includes('application/json')) {
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || data.error || 'Request failed');

                this.closeOpenModal();
                if (form.id === 'bulk-form') this.bulkManager?.clear();

                await this.refreshCurrentPage();
                window.showToast?.(data.message || 'Success!', 'success');
            } else {
                const html = await response.text();
                if (form.id === 'bulk-form') this.bulkManager?.clear();
                this.replacePageContent(html);

                if (method === 'GET' || method === 'HEAD') {
                    window.history.pushState({}, '', url);
                }
            }
        } catch (err) {
            console.error(err);
            window.showToast?.(err.message || 'Something went wrong.', 'danger');
        } finally {
            window.toggleLoading(false);
        }
    }

    async loadPage(url) {
        window.toggleLoading(true);

        try {
            const response = await fetch(url, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const html = await response.text();

            this.replacePageContent(html);
            window.history.pushState({}, '', url);
        } catch (err) {
            console.error(err);
            window.showToast?.('Failed to load content.', 'danger');
        } finally {
            window.toggleLoading(false);
        }
    }

    async refreshCurrentPage() {
        await this.loadPage(window.location.href);
    }

    /**
     * Surgically replaces the sidebar and task-list regions with content
     * from a server-rendered HTML string, then re-initialises dynamic widgets.
     */
    replacePageContent(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const regions = ['sidebar-container', 'tasks-container'];
        regions.forEach(id => {
            const current = document.getElementById(id);
            const incoming = doc.getElementById(id);
            if (current && incoming) current.innerHTML = incoming.innerHTML;
        });

        this.reinitializeUI();
        this.handleEmptyPage();
    }

    reinitializeUI() {
        document.querySelectorAll('.tag-input-wrapper').forEach(wrapper => new TagInputManager(wrapper));
        this.bulkManager?.syncUI();
        // Re-apply active filter highlights after the sidebar HTML has been replaced
        this.syncCategoryUI();
    }

    /**
     * Redirects to the previous page if the current one has become empty after
     * a delete or bulk action (e.g. deleting the last task on page 3 → go to page 2).
     */
    handleEmptyPage() {
        if (document.querySelectorAll('.todo-checkbox').length > 0) return;

        const urlParams = new URLSearchParams(window.location.search);
        const currentPage = parseInt(urlParams.get('page')) || 1;
        if (currentPage <= 1) return;

        let maxPageFound = 1;
        document.querySelectorAll('a[href*="page="]').forEach(link => {
            try {
                const p = parseInt(new URL(link.getAttribute('href'), window.location.origin).searchParams.get('page'));
                if (!isNaN(p) && p > maxPageFound) maxPageFound = p;
            } catch (_) {}
        });

        urlParams.set('page', Math.min(currentPage - 1, maxPageFound));
        this.loadPage(window.location.pathname + '?' + urlParams.toString());
    }

    closeOpenModal() {
        document.querySelectorAll('.modal.show').forEach(modalEl => {
            bootstrap.Modal.getInstance(modalEl)?.hide();
        });

        // Ensure backdrop and body scroll-lock are cleaned up after the hide animation
        setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            document.body.style.removeProperty('overflow');
        }, 300);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tag-input-wrapper').forEach(wrapper => new TagInputManager(wrapper));
    new TodoAJAXManager();
});
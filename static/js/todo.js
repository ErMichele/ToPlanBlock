/**
 * TagInputManager - A reusable class for managing interactive tag inputs
 * Supports autocomplete, keyboard navigation, and hidden field synchronization.
 */
class TagInputManager {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.container = wrapper.querySelector('.tag-input-container');
        this.input = wrapper.querySelector('.tag-input-field');
        this.hiddenInput = wrapper.querySelector('.tags-hidden-input');
        this.suggestions = wrapper.querySelector('.suggestions-list');

        this.tags = this.hiddenInput.value
            ? this.hiddenInput.value
                .split(',')
                .map(t => t.trim())
                .filter(Boolean)
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

            if (
                e.key === 'Backspace' &&
                this.input.value.trim() === '' &&
                this.tags.length
            ) {
                this.removeTag(this.tags[this.tags.length - 1]);
            }
        });

        this.input.addEventListener('input', () => {
            this.filterSuggestions();
        });

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

        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.hideSuggestions();
            }
        });

        const form = this.wrapper.closest('form');

        if (form) {
            form.addEventListener('submit', () => {
                if (this.input.value.trim()) {
                    this.addTag(this.input.value);
                }
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
        this.container
            .querySelectorAll('.tag-badge')
            .forEach(el => el.remove());

        this.tags.forEach(tag => {
            const matchSuggestion = this.suggestions.querySelector(`.suggestion-item[data-value="${tag}"]`);
            const customBadgeColor = (matchSuggestion && matchSuggestion.dataset.color) ? matchSuggestion.dataset.color : 'var(--bs-primary)';

            const badge = document.createElement('div');
            badge.className = 'tag-badge badge rounded d-flex align-items-center gap-2 px-3 py-2';
            
            if (tag === this.lastAddedTag) {
                badge.classList.add('tag-badge-animated');
            }
            
            badge.style.backgroundColor = customBadgeColor;
            badge.style.color = '#fff';

            badge.innerHTML = `
                <span>${tag}</span>
                <span 
                    class="remove-tag cursor-pointer"
                    role="button"
                    data-item="${tag}"
                >&times;</span>
            `;

            this.container.insertBefore(badge, this.input);
        });
    }

    filterSuggestions() {
        const query = this.normalize(this.input.value);

        let visibleCount = 0;

        this.suggestions
            .querySelectorAll('.suggestion-item')
            .forEach(item => {
                const value = this.normalize(item.dataset.value);

                const show =
                    query &&
                    value.includes(query) &&
                    !this.tags.includes(value);

                item.style.display = show ? 'block' : 'none';

                if (show) visibleCount++;
            });

        this.suggestions.style.display =
            visibleCount > 0 ? 'block' : 'none';
    }

    hideSuggestions() {
        this.suggestions.style.display = 'none';
    }
}

/**
 * BulkSelectionManager - Reusable class to manage selection tracking across pagination
 * Stores selected row IDs in a persistent JavaScript Set instance.
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
        // Use global event delegation to gracefully manage dynamically added AJAX elements
        document.addEventListener('change', (e) => {
            if (e.target.matches(this.checkboxSelector)) {
                this.handleCheckboxChange(e.target);
            } else if (e.target.matches(this.selectAllSelector)) {
                this.handleSelectAllChange(e.target);
            }
        });
    }

    handleCheckboxChange(cb) {
        if (cb.checked) {
            this.selectedIds.add(cb.value);
        } else {
            this.selectedIds.delete(cb.value);
        }
        this.syncSelectAllState();
        this.updateBulkButtonState();
    }

    handleSelectAllChange(selectAllCb) {
        const checkboxes = document.querySelectorAll(this.checkboxSelector);
        checkboxes.forEach(cb => {
            cb.checked = selectAllCb.checked;
            if (selectAllCb.checked) {
                this.selectedIds.add(cb.value);
            } else {
                this.selectedIds.delete(cb.value);
            }
        });
        this.updateBulkButtonState();
    }

    syncUI() {
        const checkboxes = document.querySelectorAll(this.checkboxSelector);
        checkboxes.forEach(cb => {
            cb.checked = this.selectedIds.has(cb.value);
        });
        this.syncSelectAllState();
        this.updateBulkButtonState();
    }

    syncSelectAllState() {
        const selectAllCb = document.querySelector(this.selectAllSelector);
        if (selectAllCb) {
            const checkboxes = document.querySelectorAll(this.checkboxSelector);
            selectAllCb.checked = checkboxes.length > 0 && [...checkboxes].every(cb => cb.checked);
        }
    }

    updateBulkButtonState() {
        const bulkBtn = document.querySelector(this.bulkBtnSelector);
        if (bulkBtn) {
            bulkBtn.disabled = this.selectedIds.size === 0;
        }
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
 * TodoAJAXManager - Handles AJAX interactions for the ToDo app
 * Intercepts form submissions and link clicks to perform AJAX requests,
 * updates the UI dynamically, and manages loading states and toasts.
 */
class TodoAJAXManager {
    constructor() {
        this.init();
    }

    init() {
        this.bulkManager = new BulkSelectionManager({
            checkboxSelector: '.todo-checkbox',
            selectAllSelector: '#selectAll',
            bulkBtnSelector: '#bulkActionsBtn'
        });
        
        // Tracks chosen category filters across AJAX pagination renders
        this.selectedCategories = new Set();
        this.initCategories();
        this.bindGlobalEvents();
    }

    initCategories() {
        const filterInput = document.getElementById('filter-category-input');
        if (filterInput && filterInput.value.trim()) {
            filterInput.value.split(',').forEach(cat => {
                const trimmed = cat.trim();
                if (trimmed) {
                    this.selectedCategories.add(trimmed);
                }
            });
        }
    }

    hasCategory(catName) {
        return [...this.selectedCategories].some(c => c.toUpperCase() === catName.toUpperCase());
    }

    deleteCategory(catName) {
        for (const c of this.selectedCategories) {
            if (c.toUpperCase() === catName.toUpperCase()) {
                this.selectedCategories.delete(c);
            }
        }
    }

    syncCategoryUI() {
        const filterInput = document.getElementById('filter-category-input');
        if (filterInput) {
            filterInput.value = Array.from(this.selectedCategories).join(',');
        }

        document.querySelectorAll('.category-filter-item').forEach(item => {
            const catName = item.getAttribute('data-cat-name');
            const catColor = item.getAttribute('data-cat-color');
            const checkIconSpan = item.querySelector('.category-check-icon');
            const badgeSpan = item.querySelector('.badge');

            if (this.hasCategory(catName)) {
                if (checkIconSpan) {
                    checkIconSpan.innerHTML = `<i class="bi bi-check-circle-fill" style="color: ${catColor}; font-size: 1.1rem;"></i>`;
                }
                if (badgeSpan) {
                    badgeSpan.className = 'badge px-3 py-2 rounded text-white border';
                    badgeSpan.style.backgroundColor = catColor;
                    badgeSpan.style.borderColor = catColor; 
                    badgeSpan.style.color = '#fff';
                    badgeSpan.style.opacity = '1';
                }
            } else {
                if (checkIconSpan) {
                    checkIconSpan.innerHTML = '<i class="bi bi-circle text-muted" style="font-size: 1.1rem;"></i>';
                }
                if (badgeSpan) {
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
     * Extracts and converts the global primary color from document styles into a valid HEX code format
     */
    getThemePrimaryColor() {
        const root = document.documentElement;
        const computedStyle = getComputedStyle(root);
        
        let color = computedStyle.getPropertyValue('--bs-primary').trim() || 
                    computedStyle.getPropertyValue('--primary-color').trim();
        
        if (color.startsWith('rgb')) {
            const rgbValues = color.match(/\d+/g);
            if (rgbValues && rgbValues.length >= 3) {
                const r = parseInt(rgbValues[0]).toString(16).padStart(2, '0');
                const g = parseInt(rgbValues[1]).toString(16).padStart(2, '0');
                const b = parseInt(rgbValues[2]).toString(16).padStart(2, '0');
                color = `#${r}${g}${b}`;
            }
        }
        
        return color.startsWith('#') && color.length === 7 ? color : '#0d6efd';
    }

    /**
     * Sets picker values to match the default system tone color contextually at modal display instantiation
     */
    initModalColorPickers(modalElement) {
        const themeToggles = modalElement.querySelectorAll('.theme-color-toggle');
        const defaultColor = this.getThemePrimaryColor();

        themeToggles.forEach(toggle => {
            const targetId = toggle.getAttribute('data-target');
            const picker = modalElement.querySelector(`#${targetId}`);
            
            if (picker) {
                if (toggle.checked) {
                    picker.disabled = true;
                    picker.style.opacity = '0.5';
                    picker.value = defaultColor;
                } else {
                    picker.disabled = false;
                    picker.style.opacity = '1';
                }
            }
        });
    }

    bindGlobalEvents() {
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

            // Contextually evaluate and fill standard theme colors inside category modulators
            this.initModalColorPickers(modal);
        });

        document.addEventListener('input', (e) => {
            if (e.target.matches('.task-modal-search')) {
                const filterValue = e.target.value.toLowerCase().trim();
                const modal = e.target.closest('.modal');
                if (!modal) return;
                
                modal.querySelectorAll('.modal-task-row').forEach(row => {
                    const textSpan = row.querySelector('.task-text-span');
                    const textContent = textSpan ? textSpan.textContent.toLowerCase() : row.textContent.toLowerCase();
                    if (textContent.includes(filterValue)) {
                        row.classList.remove('d-none');
                        row.classList.add('d-flex');
                    } else {
                        row.classList.remove('d-flex');
                        row.classList.add('d-none');
                    }
                });
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.matches('.modal-task-checkbox')) {
                const modal = e.target.closest('.modal');
                if (modal) {
                    this.updateCategoryModalState(modal);
                }
            }

            // Decoupled listener logic targeting toggle actions for custom/default category labels
            if (e.target.matches('.theme-color-toggle')) {
                const targetId = e.target.getAttribute('data-target');
                const picker = document.getElementById(targetId);
                if (picker) {
                    if (e.target.checked) {
                        picker.disabled = true;
                        picker.style.opacity = '0.5';
                        picker.value = this.getThemePrimaryColor();
                    } else {
                        picker.disabled = false;
                        picker.style.opacity = '1';
                    }
                }
            }
        });

        document.addEventListener('submit', (e) => {
            const form = e.target;

            const ajaxForms = [
                '#todo-form',
                '#bulk-form',
                '#ajax-search-form'
            ];

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

            // Clear the selection set tracking state if the user clicks the "Clear Filters" trigger
            if (link.textContent.includes('Clear') || link.querySelector('.bi-trash3')) {
                this.selectedCategories.clear();
            }

            let url = link.href;
            
            if (link.id === 'apply-filters-btn') {
                const filterInput = document.getElementById('filter-category-input');
                const categoriesValue = filterInput ? filterInput.value : '';
                const baseUrl = link.getAttribute('data-base-url') || url;
                
                let finalUrl = baseUrl;
                if (categoriesValue) {
                    const separator = finalUrl.includes('?') ? '&' : '?';
                    finalUrl += separator + 'category=' + encodeURIComponent(categoriesValue);
                }
                url = finalUrl;
            }

            this.loadPage(url);
        });

        document.addEventListener('show.bs.modal', (event) => {
            const button = event.relatedTarget;

            if (!button) return;

            const url = button.dataset.url;
            const form = event.target.querySelector('form');

            if (url && form) {
                form.action = url;
            }
        });
    }

    updateCategoryModalState(modalElement) {
        const totalChecked = modalElement.querySelectorAll('.modal-task-checkbox:checked').length;
        const counterBadge = modalElement.querySelector('.target-counter');
        if (counterBadge) {
            counterBadge.textContent = `${totalChecked} selected`;
        }
        
        modalElement.querySelectorAll('.modal-task-row').forEach(row => {
            const checkbox = row.querySelector('.modal-task-checkbox');
            if (checkbox && checkbox.checked) {
                row.classList.add('modal-task-row-active');
            } else {
                row.classList.remove('modal-task-row-active');
            }
        });
    }

    toggleCategoryFilter(toggleZone) {
        const item = toggleZone.closest('.category-filter-item');
        if (!item) return;

        const catName = item.getAttribute('data-cat-name');
        if (!catName) return;

        const badgeSpan = item.querySelector('.badge');
        if (badgeSpan) {
            badgeSpan.classList.remove('badge-pop');
            void badgeSpan.offsetWidth; 
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
                if (this.bulkManager) {
                    this.bulkManager.getIds().forEach(id => {
                        formData.append('todo_ids', id);
                    });
                } else {
                    document
                        .querySelectorAll('.todo-checkbox:checked')
                        .forEach(cb => {
                            formData.append('todo_ids', cb.value);
                        });
                }

                if (
                    document.activeElement &&
                    document.activeElement.name === 'action'
                ) {
                    formData.append(
                        'action',
                        document.activeElement.value
                    );
                }
            }

            const url = form.getAttribute('action') || window.location.href;
            const response = await fetch(url, {
                method: form.method || 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const contentType = response.headers.get('content-type');

            if (contentType?.includes('application/json')) {
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || data.error || 'Request failed');
                }

                this.closeOpenModal();
                
                if (form.id === 'bulk-form' && this.bulkManager) {
                    this.bulkManager.clear();
                }

                await this.refreshCurrentPage();

                window.showToast?.(
                    data.message || 'Success!',
                    'success'
                );
            } else {
                const html = await response.text();
                
                if (form.id === 'bulk-form' && this.bulkManager) {
                    this.bulkManager.clear();
                }

                this.replacePageContent(html);
            }
        } catch (err) {
            console.error(err);

            window.showToast?.(
                err.message || 'Something went wrong.',
                'danger'
            );
        } finally {
            window.toggleLoading(false);
        }
    }

    async loadPage(url) {
        window.toggleLoading(true);

        try {
            const response = await fetch(url, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const html = await response.text();

            this.replacePageContent(html);

            window.history.pushState({}, '', url);
        } catch (err) {
            console.error(err);

            window.showToast?.(
                'Failed to load content.',
                'danger'
            );
        } finally {
            window.toggleLoading(false);
        }
    }

    async refreshCurrentPage() {
        await this.loadPage(window.location.href);
    }

    replacePageContent(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const sidebar = document.getElementById('sidebar-container');
        const tasks = document.getElementById('tasks-container');

        const newSidebar = doc.getElementById('sidebar-container');
        const newTasks = doc.getElementById('tasks-container');

        if (sidebar && newSidebar) {
            sidebar.innerHTML = newSidebar.innerHTML;
        }

        if (tasks && newTasks) {
            tasks.innerHTML = newTasks.innerHTML;
        }

        this.reinitializeUI();
        this.handleEmptyPage();
    }

    reinitializeUI() {
        document
            .querySelectorAll('.tag-input-wrapper')
            .forEach(wrapper => {
                new TagInputManager(wrapper);
            });

        if (this.bulkManager) {
            this.bulkManager.syncUI();
        }

        // Restores active selections to the sidebar items following an AJAX render
        this.syncCategoryUI();
    }

    handleEmptyPage() {
        const checkboxes = document.querySelectorAll('.todo-checkbox');
        if (checkboxes.length > 0) return;

        const urlParams = new URLSearchParams(window.location.search);
        const currentPage = parseInt(urlParams.get('page')) || 1;

        if (currentPage <= 1) return;

        let targetPage = currentPage - 1;
        let maxPageFound = 1;

        const pageLinks = document.querySelectorAll('a[href*="page="]');
        pageLinks.forEach(link => {
            try {
                const href = link.getAttribute('href');
                const url = new URL(href, window.location.origin);
                const p = parseInt(url.searchParams.get('page'));
                if (!isNaN(p) && p > maxPageFound) {
                    maxPageFound = p;
                }
            } catch (e) {}
        });

        if (maxPageFound < currentPage) {
            targetPage = maxPageFound;
        }

        urlParams.set('page', targetPage);
        const newUrl = window.location.pathname + '?' + urlParams.toString();
        this.loadPage(newUrl);
    }

    closeOpenModal() {
        document.querySelectorAll('.modal.show').forEach(modalEl => {
            const modal = bootstrap.Modal.getInstance(modalEl);

            if (modal) {
                modal.hide();
            }
        });

        setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());

            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            document.body.style.removeProperty('overflow');
        }, 300);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document
        .querySelectorAll('.tag-input-wrapper')
        .forEach(wrapper => {
            new TagInputManager(wrapper);
        });

    new TodoAJAXManager();
});
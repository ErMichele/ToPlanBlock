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
            const customBadgeColor = matchSuggestion ? matchSuggestion.dataset.color : '#0d6efd';

            const badge = document.createElement('div');
            badge.className = 'tag-badge badge rounded-pill d-flex align-items-center gap-2 px-3 py-2';
            
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
 * TodoAJAXManager - Handles AJAX interactions for the ToDo app
 * Intercepts form submissions and link clicks to perform AJAX requests,
 * updates the UI dynamically, and manages loading states and toasts.
 */
class TodoAJAXManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindGlobalEvents();
        this.bindBulkLogic();
    }

    bindGlobalEvents() {
        document.addEventListener('hidden.bs.modal', () => {
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());

            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            document.body.style.removeProperty('overflow');
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
            // Handle non-checkbox category filter additions/removals locally
            const toggleZone = e.target.closest('.category-toggle-zone');
            if (toggleZone) {
                e.preventDefault();
                this.toggleCategoryFilter(toggleZone);
                return;
            }

            const link = e.target.closest('.ajax-filter-trigger');

            if (!link) return;

            e.preventDefault();

            let url = link.href;
            
            // If clicking 'Apply Filters', build final URL with selected categories
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
            const form = document.getElementById('confirmDeleteForm');

            if (url && form) {
                form.action = url;
            }
        });
    }

    toggleCategoryFilter(toggleZone) {
        const item = toggleZone.closest('.category-filter-item');
        if (!item) return;

        const filterInput = document.getElementById('filter-category-input');
        if (!filterInput) return;

        const catName = item.getAttribute('data-cat-name');
        const catColor = item.getAttribute('data-cat-color');

        let currentVal = filterInput.value.trim();
        let activeCats = currentVal ? currentVal.split(',') : [];

        const index = activeCats.findIndex(c => c.toUpperCase() === catName.toUpperCase());
        const checkIconSpan = item.querySelector('.category-check-icon');
        const badgeSpan = item.querySelector('.badge');

        // Trigger the lil pop animation
        if (badgeSpan) {
            badgeSpan.classList.remove('badge-pop');
            void badgeSpan.offsetWidth; // Trick to force browser reflow and restart the CSS animation
            badgeSpan.classList.add('badge-pop');
        }

        if (index > -1) {
            // De-select category item locally
            activeCats.splice(index, 1);
            if (checkIconSpan) {
                checkIconSpan.innerHTML = '<i class="bi bi-circle text-muted" style="font-size: 1.1rem;"></i>';
            }
            if (badgeSpan) {
                badgeSpan.className = 'badge px-3 py-2 rounded-pill text-body border';
                badgeSpan.style.backgroundColor = 'var(--bs-body-secondary)';
                badgeSpan.style.borderColor = 'var(--bs-border-color)';
                badgeSpan.style.color = 'var(--bs-body-color)';
                badgeSpan.style.opacity = '0.85';
            }
        } else {
            // Select category item locally
            activeCats.push(catName);
            if (checkIconSpan) {
                checkIconSpan.innerHTML = `<i class="bi bi-check-circle-fill" style="color: ${catColor}; font-size: 1.1rem;"></i>`;
            }
            if (badgeSpan) {
                // FIXED: We keep the 'border' class here so the layout size never changes!
                badgeSpan.className = 'badge px-3 py-2 rounded-pill text-white border';
                badgeSpan.style.backgroundColor = catColor;
                badgeSpan.style.borderColor = catColor; // Match border color to background
                badgeSpan.style.color = '#fff';
                badgeSpan.style.opacity = '1';
            }
        }

        filterInput.value = activeCats.join(',');
    }

    async submitForm(form) {
        window.toggleLoading(true);

        try {
            const formData = new FormData(form);

            if (form.id === 'bulk-form') {
                document
                    .querySelectorAll('.todo-checkbox:checked')
                    .forEach(cb => {
                        formData.append('todo_ids', cb.value);
                    });

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
                    throw new Error(data.error || 'Request failed');
                }

                await this.refreshCurrentPage();

                this.closeOpenModal();

                window.showToast?.(
                    data.message || 'Success!',
                    'success'
                );
            } else {
                const html = await response.text();
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
    }

    reinitializeUI() {
        document
            .querySelectorAll('.tag-input-wrapper')
            .forEach(wrapper => {
                new TagInputManager(wrapper);
            });

        this.bindBulkLogic();
    }

    bindBulkLogic() {
        const selectAll = document.getElementById('selectAll');
        const checkboxes = document.querySelectorAll('.todo-checkbox');
        const bulkBtn = document.getElementById('bulkActionsBtn');

        const updateState = () => {
            const anyChecked = [...checkboxes].some(cb => cb.checked);

            if (bulkBtn) {
                bulkBtn.disabled = !anyChecked;
            }

            if (selectAll) {
                selectAll.checked =
                    checkboxes.length > 0 &&
                    [...checkboxes].every(cb => cb.checked);
            }
        };

        if (selectAll) {
            selectAll.addEventListener('change', () => {
                checkboxes.forEach(cb => {
                    cb.checked = selectAll.checked;
                });

                updateState();
            });
        }

        checkboxes.forEach(cb => {
            cb.addEventListener('change', updateState);
        });

        updateState();
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
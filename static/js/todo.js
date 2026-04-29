/**
 * TagInputManager - A reusable class for managing interactive tag inputs
 * Supports autocomplete, keyboard navigation, and hidden field synchronization.
 */
class TagInputManager {
    constructor(container) {
        this.container = container;
        this.tagContainer = container.querySelector('.tag-input-container');
        this.tagInput = container.querySelector('.tag-input-field');
        this.hiddenInput = container.querySelector('.tags-hidden-input');
        this.suggestions = container.querySelector('.suggestions-list');
        
        this.tags = this.hiddenInput.value 
            ? this.hiddenInput.value.split(',').filter(t => t.trim() !== '').map(t => t.toUpperCase()) 
            : [];

        this.init();
    }

    init() {
        // Render initial tags
        this.renderTags();

        // Add Tag on Enter or Comma
        this.tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                this.addTag(this.tagInput.value);
            } else if (e.key === 'Backspace' && this.tagInput.value === '' && this.tags.length > 0) {
                this.removeTag(this.tags[this.tags.length - 1]);
            }
        });

        // Focus input when clicking the container
        this.tagContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-tag')) {
                this.removeTag(e.target.dataset.item);
            } else {
                this.tagInput.focus();
            }
        });

        // Handle Autocomplete filtering
        this.tagInput.addEventListener('input', () => {
            const val = this.tagInput.value.toUpperCase();
            const items = this.suggestions.querySelectorAll('.suggestion-item');
            let count = 0;

            items.forEach(item => {
                const catName = item.dataset.value.toUpperCase();
                if (val && catName.includes(val) && !this.tags.includes(catName)) {
                    item.style.display = 'block';
                    count++;
                } else {
                    item.style.display = 'none';
                }
            });
            this.suggestions.style.display = count > 0 ? 'block' : 'none';
        });

        // Select suggestion
        this.suggestions.addEventListener('click', (e) => {
            const item = e.target.closest('.suggestion-item');
            if (item) {
                this.addTag(item.dataset.value);
                this.tagInput.focus();
            }
        });

        // Close suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.suggestions.style.display = 'none';
            }
        });

        // Ensure tags are added if user submits form while typing a tag
        const form = this.container.closest('form');
        if (form) {
            form.addEventListener('submit', () => {
                if (this.tagInput.value.trim() !== '') {
                    this.addTag(this.tagInput.value);
                }
            });
        }
    }

    updateHiddenInput() {
        this.hiddenInput.value = this.tags.join(',');
    }

    renderTags() {
        // Clear existing badges (but keep the input field)
        const badges = this.tagContainer.querySelectorAll('.tag-badge');
        badges.forEach(b => b.remove());

        // Create new badges
        this.tags.forEach(label => {
            const tagEl = document.createElement('div');
            tagEl.className = 'tag-badge';
            tagEl.innerHTML = `<span>${label}</span><span class="remove-tag" data-item="${label}">&times;</span>`;
            this.tagContainer.insertBefore(tagEl, this.tagInput);
        });
    }

    addTag(label) {
        label = label.trim().toUpperCase();
        if (label && !this.tags.includes(label)) {
            this.tags.push(label);
            this.renderTags();
            this.updateHiddenInput();
        }
        this.tagInput.value = '';
        this.suggestions.style.display = 'none';
    }

    removeTag(label) {
        this.tags = this.tags.filter(t => t !== label);
        this.renderTags();
        this.updateHiddenInput();
    }
}

class TodoAJAXManager {
    constructor() {
        this.overlay = document.getElementById('loading-overlay');
        this.toastEl = document.getElementById('liveToast');
        this.toastMessage = document.getElementById('toast-message');
        this.bsToast = new bootstrap.Toast(this.toastEl);
        this.initEventListeners();
    }

    showLoading(show) {
        if (show) {
            this.overlay.classList.remove('d-none');
        } else {
            this.overlay.classList.add('d-none');
        }
    }

    showToast(message, category = 'success') {
        this.toastMessage.textContent = message;
        this.toastEl.classList.remove('bg-success', 'bg-danger', 'bg-warning');
        
        // Map Flask categories to Bootstrap colors
        const bgColor = category === 'error' || category === 'danger' ? 'bg-danger' : 'bg-success';
        this.toastEl.classList.add(bgColor);
        
        this.bsToast.show();
    }

    initEventListeners() {
        document.addEventListener('submit', (e) => {
            const form = e.target;
            const isTodoForm = form.matches('#todo-form') || 
                               form.closest('.modal-content') || 
                               form.matches('#bulk-form') ||
                               form.getAttribute('action')?.includes('/toggle') ||
                               form.getAttribute('action')?.includes('/delete');

            if (isTodoForm) {
                e.preventDefault();
                this.handleAction(form);
            }
        });
    }

    async handleAction(form) {
        this.showLoading(true);
        const formData = new FormData(form);
        let url = form.getAttribute('action') || window.location.href;
        
        if (form.id === 'bulk-form') {
            const checkedIds = document.querySelectorAll('.todo-checkbox:checked');
            checkedIds.forEach(cb => formData.append('todo_ids', cb.value));
            if (document.activeElement && document.activeElement.name === 'action') {
                formData.append('action', document.activeElement.value);
            }
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });

            const data = await response.json();

            if (response.ok) {
                // Close modals
                const openModalEl = document.querySelector('.modal.show');
                if (openModalEl) {
                    bootstrap.Modal.getInstance(openModalEl)?.hide();
                }
                
                await this.refreshUI();
                this.showToast(data.message || "Action successful!"); 
            } else {
                this.showToast(data.message || "An error occurred.", "danger");
            }
        } catch (error) {
            this.showToast("Network error. Please try again.", "danger");
        } finally {
            this.showLoading(false);
        }
    }

    async refreshUI() {
        const url = window.location.href;
        try {
            const response = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const oldBar = document.querySelector('.progress-bar');
            const newBarContent = doc.querySelector('.progress-bar');
            
            let oldWidth = "0%";
            if (oldBar) oldWidth = oldBar.style.width;

            document.getElementById('sidebar-container').innerHTML = doc.getElementById('sidebar-container').innerHTML;
            document.getElementById('tasks-container').innerHTML = doc.getElementById('tasks-container').innerHTML;

            if (newBarContent) {
                const updatedBar = document.querySelector('.progress-bar');
                const targetWidth = updatedBar.style.width;
                updatedBar.style.transition = 'none';
                updatedBar.style.width = oldWidth;
                updatedBar.offsetHeight; 
                updatedBar.style.transition = '';
                updatedBar.style.width = targetWidth;
            }

            document.querySelectorAll('.tag-input-wrapper').forEach(w => new TagInputManager(w));
            this.rebindBulkLogic();

        } catch (error) {
            console.error("Refresh failed:", error);
        }
    }

    rebindBulkLogic() {
        const selectAll = document.getElementById('selectAll');
        const checkboxes = document.querySelectorAll('.todo-checkbox');
        const bulkActionsBtn = document.getElementById('bulkActionsBtn');

        if (selectAll) {
            selectAll.addEventListener('change', () => {
                checkboxes.forEach(cb => cb.checked = selectAll.checked);
                if (bulkActionsBtn) bulkActionsBtn.disabled = ![...checkboxes].some(c => c.checked);
            });
        }
        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                if (selectAll) selectAll.checked = [...checkboxes].every(c => c.checked);
                if (bulkActionsBtn) bulkActionsBtn.disabled = ![...checkboxes].some(c => c.checked);
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const wrappers = document.querySelectorAll('.tag-input-wrapper');
    wrappers.forEach(wrapper => new TagInputManager(wrapper));

    document.addEventListener('show.bs.modal', function (event) {
        const button = event.relatedTarget; 
        if (!button) return;
        const url = button.getAttribute('data-url');
        const form = document.getElementById('confirmDeleteForm');
        if (form && url) form.setAttribute('action', url);
    });

    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.todo-checkbox');
    const bulkActionsBtn = document.getElementById('bulkActionsBtn');

    if (selectAll) {
        selectAll.addEventListener('change', function() {
            checkboxes.forEach(cb => cb.checked = selectAll.checked);
            updateBulkButton();
        });
    }

    checkboxes.forEach(cb => {
        cb.addEventListener('change', function() {
            if (selectAll) {
                selectAll.checked = [...checkboxes].every(c => c.checked);
            }
            updateBulkButton();
        });
    });

    function updateBulkButton() {
        if (bulkActionsBtn) {
            const anyChecked = [...checkboxes].some(c => c.checked);
            bulkActionsBtn.disabled = !anyChecked;
        }
    }

    new TodoAJAXManager();
});
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

// Initialize all tag inputs on the page
document.addEventListener('DOMContentLoaded', function () {
    const wrappers = document.querySelectorAll('.tag-input-wrapper');
    wrappers.forEach(wrapper => new TagInputManager(wrapper));

    // Handle Delete Modal Logic
    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) {
        deleteModal.addEventListener('show.bs.modal', function (event) {
            const button = event.relatedTarget; 
            const url = button.getAttribute('data-url');
            const form = document.getElementById('confirmDeleteForm');
            if (form && url) {
                form.action = url;
            }
        });
    }

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
});
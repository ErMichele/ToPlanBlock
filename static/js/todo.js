document.addEventListener('DOMContentLoaded', function () {
    const todoForm = document.getElementById('todo-form');
    const tagContainer = document.getElementById('tag-container');
    const tagInput = document.getElementById('tag-input');
    const hiddenInput = document.getElementById('categories-hidden');
    const suggestions = document.getElementById('suggestions');
    const deleteModal = document.getElementById('deleteModal');

    let tags = [];

    function updateHiddenInput() {
        hiddenInput.value = tags.join(',');
    }

    function addTag(label) {
        label = label.trim().toUpperCase();
        if (label && !tags.includes(label)) {
            tags.push(label);
            const tagEl = document.createElement('div');
            tagEl.className = 'tag-badge';
            tagEl.innerHTML = `<span>${label}</span><span class="remove-tag" data-item="${label}">&times;</span>`;
            tagContainer.insertBefore(tagEl, tagInput);
            updateHiddenInput();
        }
        tagInput.value = '';
        suggestions.style.display = 'none';
    }

    function removeTag(label) {
        tags = tags.filter(t => t !== label);
        tagContainer.querySelectorAll('.tag-badge').forEach(b => b.remove());
        tags.forEach(t => {
            const el = document.createElement('div');
            el.className = 'tag-badge';
            el.innerHTML = `<span>${t}</span><span class="remove-tag" data-item="${t}">&times;</span>`;
            tagContainer.insertBefore(el, tagInput);
        });
        updateHiddenInput();
    }

    todoForm.addEventListener('submit', (e) => {
        if (tagInput.value.trim() !== '') {
            addTag(tagInput.value);
        }
    });

    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag(tagInput.value);
        } else if (e.key === 'Backspace' && tagInput.value === '' && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
        }
    });

    tagContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-tag')) {
            removeTag(e.target.dataset.item);
        } else {
            tagInput.focus();
        }
    });

    tagInput.addEventListener('input', () => {
        const val = tagInput.value.toUpperCase();
        const items = suggestions.querySelectorAll('.suggestion-item');
        let count = 0;

        items.forEach(item => {
            const catName = item.dataset.value.toUpperCase();
            if (val && catName.includes(val) && !tags.includes(catName)) {
                item.style.display = 'block';
                count++;
            } else {
                item.style.display = 'none';
            }
        });
        suggestions.style.display = count > 0 ? 'block' : 'none';
    });

    suggestions.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion-item');
        if (item) {
            addTag(item.dataset.value);
            tagInput.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!tagContainer.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.style.display = 'none';
        }
    });

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
});
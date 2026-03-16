function prepareDelete(url) {
    document.getElementById('confirmDeleteForm').action = url;
}

document.addEventListener('DOMContentLoaded', function () {
    const todoForm = document.getElementById('todo-form');
    const tagContainer = document.getElementById('tag-container');
    const tagInput = document.getElementById('tag-input');
    const hiddenInput = document.getElementById('categories-hidden');
    const suggestions = document.getElementById('suggestions');

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
        // Refresh UI
        tagContainer.querySelectorAll('.tag-badge').forEach(b => b.remove());
        tags.forEach(t => {
            const el = document.createElement('div');
            el.className = 'tag-badge';
            el.innerHTML = `<span>${t}</span><span class="remove-tag" data-item="${t}">&times;</span>`;
            tagContainer.insertBefore(el, tagInput);
        });
        updateHiddenInput();
    }

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

    // Handle suggestions visibility
    tagInput.addEventListener('input', () => {
        const val = tagInput.value.toUpperCase();
        const items = suggestions.querySelectorAll('.suggestion-item');
        let count = 0;
        items.forEach(item => {
            if (val && item.dataset.value.includes(val) && !tags.includes(item.dataset.value)) {
                item.style.display = 'block';
                count++;
            } else {
                item.style.display = 'none';
            }
        });
        suggestions.style.display = count > 0 ? 'block' : 'none';
    });

    suggestions.addEventListener('click', (e) => {
        if (e.target.classList.contains('suggestion-item')) {
            addTag(e.target.dataset.value);
        }
    });

    document.addEventListener('click', (e) => {
        if (!tagContainer.contains(e.target)) suggestions.style.display = 'none';
    });

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
});
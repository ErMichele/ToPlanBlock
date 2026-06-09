document.querySelectorAll('.password-toggle-btn').forEach(button => {
    button.addEventListener('click', function () {
        const input = this.closest('.input-group').querySelector('.password-toggle-input');
        const icon = this.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('bi-eye');
            icon.classList.add('bi-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('bi-eye-slash');
            icon.classList.add('bi-eye');
        }
    });
});
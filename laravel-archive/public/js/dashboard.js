document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    document.querySelectorAll('[data-menu-open]').forEach((button) => {
        button.addEventListener('click', () => body.classList.add('menu-open'));
    });
    document.querySelectorAll('[data-menu-close]').forEach((button) => {
        button.addEventListener('click', () => body.classList.remove('menu-open'));
    });
    document.querySelectorAll('[data-print]').forEach((button) => {
        button.addEventListener('click', () => window.print());
    });
    document.querySelectorAll('[data-confirm]').forEach((form) => {
        form.addEventListener('submit', (event) => {
            if (!window.confirm(form.dataset.confirm)) event.preventDefault();
        });
    });
});

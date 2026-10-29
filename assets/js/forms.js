/* Formulários: máscara de telefone, validação com mensagens e estado de envio */
(function () {
    'use strict';
    const { $, $$, formatPhone, isValidPhone } = window.NRJ;

    // Máscara (11) 90000-0000
    $$('[data-phone]').forEach((input) => {
        input.addEventListener('input', () => {
            input.value = formatPhone(input.value);
        });
    });

    function messageFor(input) {
        const value = input.value.trim();
        if (input.required && !value) return 'Preencha este campo.';
        if (!value) return '';
        if (input.hasAttribute('data-phone') && !isValidPhone(value)) return 'Informe o telefone com DDD.';
        if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Informe um e-mail válido.';
        if (input.minLength > 0 && value.length < input.minLength) return 'Muito curto.';
        return '';
    }

    function validateField(input) {
        const field = input.closest('.field');
        if (!field) return true;
        const message = messageFor(input);
        const error = $('.field-error', field);
        field.classList.toggle('is-invalid', Boolean(message));
        field.classList.toggle('is-valid', !message && Boolean(input.value.trim()));
        input.setAttribute('aria-invalid', String(Boolean(message)));
        if (error) {
            error.textContent = message;
            if (!error.id) error.id = `${input.id}-erro`;
            input.setAttribute('aria-describedby', error.id);
        }
        return !message;
    }

    function validateForm(form) {
        const inputs = $$('.field .input, .field .textarea', form);
        const results = inputs.map(validateField);
        const firstInvalid = inputs.find((_, i) => !results[i]);
        if (firstInvalid) firstInvalid.focus();
        return !firstInvalid;
    }

    // Revalida enquanto o usuário corrige
    $$('form[novalidate]').forEach((form) => {
        form.addEventListener('focusout', (event) => {
            if (event.target.matches('.input, .textarea') && event.target.value) validateField(event.target);
        });
        form.addEventListener('input', (event) => {
            if (event.target.closest('.field.is-invalid')) validateField(event.target);
        });
    });

    // Formulário de contato: envia ao StaticForms, que redireciona para obrigado.html
    const contact = $('[data-contact-form]');
    if (contact) {
        contact.addEventListener('submit', (event) => {
            if (!validateForm(contact)) {
                event.preventDefault();
                return;
            }
            $('button[type="submit"]', contact).classList.add('is-loading');
        });
        // Se o usuário voltar do obrigado.html, o botão não fica travado
        window.addEventListener('pageshow', () => {
            $('button[type="submit"]', contact).classList.remove('is-loading');
        });
    }

    window.NRJ.validateForm = validateForm;
})();

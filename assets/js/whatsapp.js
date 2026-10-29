/* Botões de WhatsApp: abrem um formulário rápido antes de seguir para a conversa */
(function () {
    'use strict';
    const { $, $$, toast, startWhatsApp } = window.NRJ;

    const modal = $('#modal-whats');
    const form = $('[data-whats-form]');
    if (!modal || !form || typeof modal.showModal !== 'function') return; // sem <dialog>: o link segue direto

    let lastTrigger = null;

    $$('[data-whats]').forEach((trigger) => {
        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            lastTrigger = trigger;
            modal.showModal();
            $('#w-nome').focus();
        });
    });

    function close() {
        modal.close();
    }

    $('[data-modal-close]', modal).addEventListener('click', close);

    // Fecha ao clicar fora da caixa
    modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
    });

    modal.addEventListener('close', () => lastTrigger?.focus());

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!window.NRJ.validateForm(form)) return;

        startWhatsApp({
            nome: form.name.value.trim(),
            telefone: form.phone.value.trim(),
            email: form.email.value.trim(),
            servico: form.servico.value,
            honeypot: form.honeypot.value,
        });

        close();
        form.reset();
        $$('.field', form).forEach((f) => f.classList.remove('is-valid', 'is-invalid'));
        toast('Abrimos o WhatsApp em uma nova aba. Nossa equipe também foi avisada por e-mail.', 'success');
    });
})();

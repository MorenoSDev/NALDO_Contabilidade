/* Núcleo do site: configuração, utilitários e integração WhatsApp + e-mail.
   Os demais scripts usam o objeto global NRJ definido aqui. */
(function () {
    'use strict';

    const config = {
        whatsNumber: '5511985368674',
        // Chave pública do StaticForms (só permite enviar mensagens para o e-mail cadastrado na conta)
        staticformsKey: 'b300ce7d-565b-430d-b09f-6f9b3aa66312',
        staticformsUrl: 'https://api.staticforms.xyz/submit',
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function $(selector, context = document) {
        return context.querySelector(selector);
    }

    function $$(selector, context = document) {
        return Array.from(context.querySelectorAll(selector));
    }

    const ICONS = { success: 'i-check', error: 'i-alert', info: 'i-alert' };

    function toast(message, type = 'info', duration = 4500) {
        const container = $('[data-toasts]');
        if (!container) return;
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');
        el.innerHTML = `<svg aria-hidden="true"><use href="#${ICONS[type]}"/></svg><span></span>`;
        el.querySelector('span').textContent = message;
        container.appendChild(el);
        setTimeout(() => {
            el.classList.add('is-leaving');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }, duration);
    }

    function onlyDigits(value) {
        return String(value).replace(/\D/g, '');
    }

    function formatPhone(value) {
        const d = onlyDigits(value).slice(0, 11);
        if (d.length <= 2) return d.length ? `(${d}` : '';
        if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
        if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }

    function isValidPhone(value) {
        const len = onlyDigits(value).length;
        return len >= 10 && len <= 13;
    }

    function sendEmailNotification(dados) {
        const body = new URLSearchParams({
            accessKey: config.staticformsKey,
            subject: `Novo contato pelo site - ${dados.nome}`,
            name: dados.nome,
            phone: dados.telefone,
            email: dados.email || 'não informado',
            message: `Contato iniciado pelo ${dados.origem || 'botão do WhatsApp'}. Assunto: ${dados.servico}`,
            $servico: dados.servico,
            honeypot: dados.honeypot || '',
        });
        if (dados.email) body.append('replyTo', dados.email);

        // keepalive garante o envio mesmo que a página perca o foco ao abrir o WhatsApp
        return fetch(config.staticformsUrl, { method: 'POST', body, keepalive: true })
            .catch(() => { /* falha no e-mail não impede a conversa no WhatsApp */ });
    }

    // Avisa o escritório por e-mail e abre o WhatsApp com a mensagem pronta
    function startWhatsApp(dados) {
        sendEmailNotification(dados);

        const texto = `Olá! Meu nome é ${dados.nome}. Vim pelo site e gostaria de falar sobre: ${dados.servico}.`;
        const url = `https://wa.me/${config.whatsNumber}?text=${encodeURIComponent(texto)}`;

        // Abre durante o clique para não ser bloqueado como pop-up
        const janela = window.open(url, '_blank');
        if (janela) janela.opener = null;
        else window.location.href = url;
    }

    window.NRJ = { config, reducedMotion, $, $$, toast, onlyDigits, formatPhone, isValidPhone, startWhatsApp };
    window.NRJ_READY = true;
})();

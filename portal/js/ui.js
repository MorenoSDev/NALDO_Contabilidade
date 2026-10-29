// Utilitários de interface do portal: ícones, formatação, avisos, diálogos e menu lateral.

const SPRITE = '../assets/img/icons.svg';

export const $ = (selector, context = document) => context.querySelector(selector);
export const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));

export function icon(name, cls = 'icon') {
    return `<svg class="${cls}" aria-hidden="true"><use href="${SPRITE}#${name}"/></svg>`;
}

export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

export function initials(name = '') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)).replace(' de ', ' ').replace('.', '') : '—');
export const formatDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');

export function formatBytes(bytes) {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0).replace('.', ',')} ${units[i]}`;
}

export function formatCnpj(value) {
    const d = String(value ?? '').replace(/\D/g, '');
    if (d.length !== 14) return value || '—';
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// Tipo do arquivo a partir do MIME e da extensão
export function fileKind(mime = '', name = '') {
    const ext = name.split('.').pop().toLowerCase();
    if (mime === 'application/pdf' || ext === 'pdf') return { type: 'pdf', label: 'PDF', cls: 'fb-pdf', name: 'PDF' };
    if (/sheet|excel|csv/.test(mime) || ['xls', 'xlsx', 'csv'].includes(ext)) {
        return { type: 'sheet', label: ext === 'csv' ? 'CSV' : 'XLS', cls: 'fb-sheet', name: 'Planilha' };
    }
    if (/word/.test(mime) || ['doc', 'docx'].includes(ext)) return { type: 'doc', label: 'DOC', cls: 'fb-doc', name: 'Documento' };
    if (/^image\//.test(mime)) return { type: 'img', label: ext.toUpperCase().slice(0, 4), cls: 'fb-img', name: 'Imagem' };
    if (/zip/.test(mime) || ext === 'zip') return { type: 'zip', label: 'ZIP', cls: 'fb-zip', name: 'Compactado' };
    return { type: 'other', label: ext.toUpperCase().slice(0, 4) || 'ARQ', cls: 'fb-other', name: 'Outro' };
}

export const fileBadge = (doc) => {
    const kind = fileKind(doc.mime_type, doc.file_name);
    return `<span class="file-badge ${kind.cls}" aria-hidden="true">${esc(kind.label)}</span>`;
};

export function debounce(fn, ms = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export function setBusy(button, busy) {
    if (!button) return;
    button.classList.toggle('is-loading', busy);
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
}

// Traduz as mensagens de erro mais comuns do Supabase
export function friendlyError(error) {
    const msg = String(error?.message || error || '');
    if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(msg)) return 'Seu acesso ainda não foi confirmado. Use o link enviado por e-mail.';
    if (/User is banned|banned/i.test(msg)) return 'Seu acesso está desativado. Fale com o escritório.';
    if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (/same.*password|different from the old/i.test(msg)) return 'A nova senha precisa ser diferente da anterior.';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Não foi possível conectar. Verifique sua internet.';
    if (/JWT|expired|session/i.test(msg)) return 'Sua sessão expirou. Entre novamente.';
    if (/row-level security|permission denied|not authorized/i.test(msg)) return 'Você não tem permissão para esta ação.';
    if (/duplicate key|already exists/i.test(msg)) return 'Já existe um registro com esses dados.';
    if (/violates foreign key/i.test(msg)) return 'Este item está em uso e não pode ser excluído.';
    if (/Payload too large|exceeded the maximum/i.test(msg)) return 'O arquivo é maior que o permitido.';
    if (/mime type|not supported/i.test(msg)) return 'Tipo de arquivo não permitido.';
    return msg || 'Algo deu errado. Tente novamente.';
}

// ---------- Avisos (toasts) ----------

function toastContainer() {
    let el = $('[data-toasts]');
    if (!el) {
        el = document.createElement('div');
        el.className = 'toasts';
        el.setAttribute('aria-live', 'polite');
        el.dataset.toasts = '';
        document.body.appendChild(el);
    }
    return el;
}

export function toast(message, type = 'info', duration = 4500) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const name = { success: 'i-check-circle', error: 'i-alert', info: 'i-info' }[type];
    el.innerHTML = `${icon(name, '')}<span>${esc(message)}</span>`;
    toastContainer().appendChild(el);
    setTimeout(() => {
        el.classList.add('is-leaving');
        el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
}

// ---------- Diálogos ----------

export function wireDialog(dialog) {
    if (dialog.dataset.wired) return dialog;
    dialog.dataset.wired = '1';
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
    });
    return dialog;
}

// Confirmação antes de ações destrutivas. Resolve true/false.
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-body">
                <button type="button" class="modal-close" data-close aria-label="Fechar">${icon('i-x')}</button>
                <div class="modal-head">
                    <span class="icon-box" ${danger ? 'style="color:var(--danger-600);border-color:#f9c6c7;background:var(--danger-50)"' : ''}>
                        ${icon(danger ? 'i-trash' : 'i-info', '')}
                    </span>
                    <div><h2>${esc(title)}</h2><p>${esc(message)}</p></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
                    <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-dark'}" data-ok>${esc(confirmLabel)}</button>
                </div>
            </div>`;
        document.body.appendChild(dialog);
        let result = false;
        wireDialog(dialog);
        $('[data-ok]', dialog).addEventListener('click', () => { result = true; dialog.close(); });
        dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
        dialog.showModal();
        $('[data-ok]', dialog).focus();
    });
}

// ---------- Estrutura (menu lateral no celular) ----------

export function initShell() {
    const sidebar = $('[data-sidebar]');
    const openBtn = $('[data-sidebar-open]');
    if (!sidebar || !openBtn) return { close() {} };
    let backdrop = null;

    function close() {
        sidebar.classList.remove('is-open');
        openBtn.setAttribute('aria-expanded', 'false');
        backdrop?.remove();
        backdrop = null;
    }

    function open() {
        sidebar.classList.add('is-open');
        openBtn.setAttribute('aria-expanded', 'true');
        backdrop = document.createElement('div');
        backdrop.className = 'backdrop';
        backdrop.addEventListener('click', close);
        document.body.appendChild(backdrop);
        $('a, button', sidebar)?.focus();
    }

    openBtn.addEventListener('click', open);
    $('[data-sidebar-close]')?.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && sidebar.classList.contains('is-open')) close();
    });
    return { close };
}

export function emptyState({ iconName = 'i-inbox', title, text, action = '' }) {
    return `
        <div class="empty">
            <span class="empty-ico">${icon(iconName, '')}</span>
            <h3>${esc(title)}</h3>
            <p>${esc(text)}</p>
            ${action}
        </div>`;
}

export function loadingRows(n = 4) {
    return `<div class="loading-rows" aria-label="Carregando">${'<div class="loading-row"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>'.repeat(n)}</div>`;
}

// Mostra/oculta a senha num campo com botão de olho
export function wirePasswordToggles(context = document) {
    $$('[data-toggle-password]', context).forEach((button) => {
        const input = $(`#${button.getAttribute('aria-controls')}`);
        button.addEventListener('click', () => {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
            button.setAttribute('aria-pressed', String(show));
            button.innerHTML = icon(show ? 'i-eye-off' : 'i-eye');
        });
    });
}

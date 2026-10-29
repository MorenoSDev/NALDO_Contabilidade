// Painel administrativo do escritório.
// As permissões são garantidas pelo banco (RLS) e pela Edge Function "admin-users";
// esta tela apenas organiza as operações.
import { supabase } from './supabase.js';
import { requireUser, signOut, fillUserChip } from './session.js';
import { downloadDocument, previewDocument, canPreview } from './files.js';
import { SITE_URL, STORAGE_BUCKET, MAX_FILE_MB } from '../config.js';
import {
    $, $$, icon, esc, initials, formatDate, formatDateTime, formatBytes, formatCnpj, fileKind, fileBadge,
    debounce, setBusy, friendlyError, toast, confirmDialog, wireDialog, initShell, emptyState, loadingRows,
} from './ui.js';

const ROUTES = ['visao', 'documentos', 'clientes', 'empresas', 'categorias', 'registros'];

// Tipos aceitos (precisam bater com allowed_mime_types do bucket em schema.sql)
const MIME_BY_EXT = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    zip: 'application/zip',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
};
const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;

const state = {
    profile: null,
    profiles: [],
    companies: [],
    members: [],
    categories: [],
    docs: [],
    audit: [],
    docFilters: { q: '', company: '', category: '', type: '', sort: 'recent' },
    clientFilters: { q: '', role: '', status: '' },
    companyQuery: '',
    auditFilter: '',
};

// ---------- Auxiliares ----------

const byId = (list, id) => list.find((item) => item.id === id);
const companyName = (id) => byId(state.companies, id)?.name || 'Empresa removida';
const categoryName = (id) => byId(state.categories, id)?.name || 'Sem categoria';
const usersOfCompany = (companyId) => state.members
    .filter((m) => m.company_id === companyId)
    .map((m) => byId(state.profiles, m.user_id))
    .filter(Boolean);
const companiesOfUser = (userId) => state.members
    .filter((m) => m.user_id === userId)
    .map((m) => byId(state.companies, m.company_id))
    .filter(Boolean);
const normalize = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const matches = (query, ...fields) => {
    const q = normalize(query).trim();
    if (!q) return true;
    const hay = normalize(fields.join(' '));
    return q.split(/\s+/).every((term) => hay.includes(term));
};

function safeFileName(name) {
    const dot = name.lastIndexOf('.');
    const base = (dot > 0 ? name.slice(0, dot) : name)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        .slice(0, 80) || 'documento';
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    return ext ? `${base}.${ext}` : base;
}

function validateFile(file) {
    if (!file) return 'Escolha um arquivo.';
    const ext = file.name.split('.').pop().toLowerCase();
    if (!MIME_BY_EXT[ext]) return 'Tipo de arquivo não permitido. Use PDF, Excel, Word, CSV, ZIP ou imagem (PNG/JPG).';
    if (file.size === 0) return 'O arquivo está vazio.';
    if (file.size > MAX_BYTES) return `O arquivo tem ${formatBytes(file.size)}. O limite é ${MAX_FILE_MB} MB.`;
    return '';
}

function formMessage(form, type, text) {
    const target = $('[data-form-message]', form);
    if (!text) { target.innerHTML = ''; return; }
    const name = { error: 'i-alert', success: 'i-check-circle', info: 'i-info', warning: 'i-alert' }[type];
    target.innerHTML = `<div class="alert alert-${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(name, '')}<span>${esc(text)}</span></div>`;
}

function statusBadge(active, on = 'Ativo', off = 'Desativado') {
    return active
        ? `<span class="badge badge-success badge-dot">${on}</span>`
        : `<span class="badge badge-danger badge-dot">${off}</span>`;
}

// ---------- Dados ----------

async function loadData() {
    const results = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role, active, created_at').order('full_name'),
        supabase.from('companies').select('id, name, cnpj, active, created_at').order('name'),
        supabase.from('company_members').select('company_id, user_id'),
        supabase.from('categories').select('id, name, description, sort_order, active').order('sort_order').order('name'),
        supabase.from('documents')
            .select('id, company_id, category_id, title, description, reference_label, reference_date, storage_path, file_name, mime_type, size_bytes, created_at, updated_at')
            .order('created_at', { ascending: false })
            .limit(5000),
        supabase.from('audit_log').select('id, actor_email, action, entity, entity_id, details, created_at')
            .order('created_at', { ascending: false }).limit(300),
    ]);
    results.forEach((r) => { if (r.error) throw r.error; });
    [state.profiles, state.companies, state.members, state.categories, state.docs, state.audit] = results.map((r) => r.data);
}

async function reload({ quiet = false } = {}) {
    try {
        await loadData();
        $('[data-error]').innerHTML = '';
        renderAll();
        if (!quiet) toast('Dados atualizados.', 'success', 2000);
    } catch (error) {
        $('[data-error]').innerHTML = `<div class="alert alert-error" role="alert">${icon('i-alert', '')}<span>Não foi possível carregar os dados: ${esc(friendlyError(error))}</span></div>`;
    }
}

// ---------- Navegação ----------

function currentRoute() {
    const hash = location.hash.slice(1);
    return ROUTES.includes(hash) ? hash : 'visao';
}

function showRoute(shell) {
    const route = currentRoute();
    $$('[data-section]').forEach((s) => { s.hidden = s.dataset.section !== route; });
    $$('[data-route]').forEach((l) => {
        const active = l.dataset.route === route;
        l.classList.toggle('is-active', active);
        if (active) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
    });
    const link = $(`[data-route="${route}"]`);
    const title = [...link.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
    $('[data-topbar-title]').textContent = title;
    document.title = `${title} | Painel NRJ Contabilidade`;
    shell?.close();
    window.scrollTo({ top: 0 });
}

// ---------- Visão geral ----------

const ACTIVITY = {
    'documents:insert': ['i-upload', (d) => `Documento enviado: ${d.title ?? ''}`],
    'documents:update': ['i-edit', (d) => `Documento atualizado: ${d.depois?.title ?? ''}`],
    'documents:delete': ['i-trash', (d) => `Documento excluído: ${d.title ?? ''}`],
    'companies:insert': ['i-building', (d) => `Empresa cadastrada: ${d.name ?? ''}`],
    'companies:update': ['i-building', (d) => `Empresa atualizada: ${d.depois?.name ?? ''}`],
    'companies:delete': ['i-trash', (d) => `Empresa excluída: ${d.name ?? ''}`],
    'company_members:insert': ['i-users', (d) => `Cliente vinculado a ${companyName(d.company_id)}`],
    'company_members:delete': ['i-users', (d) => `Vínculo removido de ${companyName(d.company_id)}`],
    'categories:insert': ['i-tag', (d) => `Categoria criada: ${d.name ?? ''}`],
    'categories:update': ['i-tag', (d) => `Categoria atualizada: ${d.depois?.name ?? ''}`],
    'categories:delete': ['i-trash', (d) => `Categoria excluída: ${d.name ?? ''}`],
    'profiles:insert': ['i-user', (d) => `Usuário criado: ${d.email ?? ''}`],
    'profiles:update': ['i-user', (d) => `Perfil atualizado: ${d.depois?.email ?? ''}`],
    'users:invite': ['i-mail', (d) => `Convite enviado para ${d.email ?? ''}`],
    'users:activate': ['i-power', () => 'Acesso reativado'],
    'users:deactivate': ['i-power', () => 'Acesso desativado'],
};

function describeAudit(entry) {
    const [ico, text] = ACTIVITY[`${entry.entity}:${entry.action}`] || ['i-history', () => `${entry.entity} · ${entry.action}`];
    return { ico, text: text(entry.details || {}) };
}

function renderOverview() {
    const first = (state.profile.full_name || '').split(' ')[0];
    $('[data-greeting]').textContent = first ? `Olá, ${first}` : 'Visão geral';

    const clients = state.profiles.filter((p) => p.role === 'client');
    const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
    const kpis = [
        ['i-users', clients.filter((p) => p.active).length, 'Clientes ativos'],
        ['i-building', state.companies.filter((c) => c.active).length, 'Empresas ativas'],
        ['i-files', state.docs.length, 'Documentos publicados'],
        ['i-upload', state.docs.filter((d) => d.created_at >= monthAgo).length, 'Enviados nos últimos 30 dias'],
    ];
    $('[data-admin-kpis]').innerHTML = kpis.map(([ico, value, label]) => `
        <div class="card kpi">
            <span class="icon-box">${icon(ico, '')}</span>
            <div><strong>${value}</strong><span>${label}</span></div>
        </div>`).join('');

    const latest = state.docs.slice(0, 6);
    $('[data-latest-docs]').innerHTML = latest.length
        ? `<ul class="activity" role="list">${latest.map((d) => `
            <li>${fileBadge(d)}<div><strong>${esc(d.title)}</strong>
            <small>${esc(companyName(d.company_id))} · ${formatDate(d.created_at)}</small></div></li>`).join('')}</ul>`
        : emptyState({
            title: 'Nenhum documento enviado ainda',
            text: 'Cadastre uma empresa, vincule o cliente e envie o primeiro documento.',
            action: `<button type="button" class="btn btn-primary btn-sm" data-new-document>${icon('i-upload')}Enviar documento</button>`,
        });

    const activity = state.audit.slice(0, 8);
    $('[data-latest-activity]').innerHTML = activity.length
        ? activity.map((entry) => {
            const { ico, text } = describeAudit(entry);
            return `<li><span class="act-ico">${icon(ico, '')}</span><div>${esc(text)}
                <small>${esc(entry.actor_email || 'Sistema')} · ${formatDateTime(entry.created_at)}</small></div></li>`;
        }).join('')
        : `<li><div><small>Nenhuma atividade registrada.</small></div></li>`;
}

// ---------- Documentos ----------

function renderDocFilters() {
    const f = state.docFilters;
    $('[data-doc-filter="company"]').innerHTML = `<option value="">Todas as empresas</option>` +
        state.companies.map((c) => `<option value="${c.id}" ${f.company === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    $('[data-doc-filter="category"]').innerHTML = `<option value="">Todas as categorias</option>` +
        state.categories.map((c) => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

function renderDocs() {
    const f = state.docFilters;
    let list = state.docs.filter((d) =>
        (!f.company || d.company_id === f.company)
        && (!f.category || d.category_id === f.category)
        && (!f.type || fileKind(d.mime_type, d.file_name).type === f.type)
        && matches(f.q, d.title, d.description, d.file_name, d.reference_label, companyName(d.company_id)));

    const sorters = {
        recent: (a, b) => b.created_at.localeCompare(a.created_at),
        oldest: (a, b) => a.created_at.localeCompare(b.created_at),
        name: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
        company: (a, b) => companyName(a.company_id).localeCompare(companyName(b.company_id), 'pt-BR'),
    };
    list = list.sort(sorters[f.sort]);

    $('[data-doc-count]').textContent = `${list.length} de ${state.docs.length} documento${state.docs.length === 1 ? '' : 's'}`;
    const target = $('[data-doc-table]');

    if (!state.docs.length) {
        target.innerHTML = emptyState({
            title: 'Nenhum documento enviado',
            text: 'Os documentos enviados aparecerão aqui, organizados por empresa e categoria.',
            action: `<button type="button" class="btn btn-primary btn-sm" data-new-document>${icon('i-upload')}Enviar o primeiro documento</button>`,
        });
        return;
    }
    if (!list.length) {
        target.innerHTML = emptyState({ iconName: 'i-search', title: 'Nenhum documento encontrado', text: 'Ajuste a pesquisa ou os filtros.' });
        return;
    }

    target.innerHTML = `
        <div class="table-wrap"><table class="table table-cards">
            <thead><tr>
                <th scope="col">Documento</th><th scope="col">Empresa</th><th scope="col">Categoria</th>
                <th scope="col">Período</th><th scope="col">Enviado em</th><th scope="col" class="num">Tamanho</th>
                <th scope="col" class="actions"><span class="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>${list.map((d) => `
                <tr>
                    <td><div class="doc-cell">${fileBadge(d)}<div><strong>${esc(d.title)}</strong><small>${esc(d.file_name)}</small></div></div></td>
                    <td data-label="Empresa"><span class="badge badge-brand">${esc(companyName(d.company_id))}</span></td>
                    <td data-label="Categoria">${esc(categoryName(d.category_id))}</td>
                    <td data-label="Período">${esc(d.reference_label || '—')}</td>
                    <td data-label="Enviado em" class="muted">${formatDate(d.created_at)}</td>
                    <td data-label="Tamanho" class="num muted">${formatBytes(d.size_bytes)}</td>
                    <td class="actions"><span class="row-actions">
                        ${canPreview(d) ? `<button type="button" class="icon-btn" data-doc-preview="${d.id}" title="Visualizar" aria-label="Visualizar ${esc(d.title)}">${icon('i-eye')}</button>` : ''}
                        <button type="button" class="icon-btn" data-doc-download="${d.id}" title="Baixar" aria-label="Baixar ${esc(d.title)}">${icon('i-download')}</button>
                        <button type="button" class="icon-btn" data-doc-edit="${d.id}" title="Editar ou substituir arquivo" aria-label="Editar ${esc(d.title)}">${icon('i-edit')}</button>
                        <button type="button" class="icon-btn danger" data-doc-delete="${d.id}" title="Excluir" aria-label="Excluir ${esc(d.title)}">${icon('i-trash')}</button>
                    </span></td>
                </tr>`).join('')}
            </tbody>
        </table></div>`;
}

// Formulário de documento (novo ou edição/substituição)
const docModal = wireDialog($('#modal-document'));
const docForm = $('[data-document-form]');
let editingDoc = null;
let pickedFile = null;

function renderRecipient() {
    const companyId = docForm.company_id.value;
    const box = $('[data-recipient]');
    if (!companyId) { box.hidden = true; return; }
    const users = usersOfCompany(companyId);
    box.hidden = false;
    box.innerHTML = `
        <strong>${icon('i-building')}${esc(companyName(companyId))}</strong>
        <span>${users.length
            ? `Visível para: ${users.map((u) => esc(u.full_name || u.email)).join(', ')}`
            : 'Nenhum cliente vinculado a esta empresa ainda. O documento ficará disponível quando alguém for vinculado.'}</span>`;
}

function renderPickedFile() {
    const target = $('[data-file-picked]');
    if (!pickedFile) {
        target.innerHTML = editingDoc
            ? `<div class="file-picked">${fileBadge(editingDoc)}<div><strong>${esc(editingDoc.file_name)}</strong><small>Arquivo atual · ${formatBytes(editingDoc.size_bytes)}</small></div></div>`
            : '';
        return;
    }
    const kind = fileKind(MIME_BY_EXT[pickedFile.name.split('.').pop().toLowerCase()] || pickedFile.type, pickedFile.name);
    target.innerHTML = `
        <div class="file-picked">
            <span class="file-badge ${kind.cls}">${esc(kind.label)}</span>
            <div><strong>${esc(pickedFile.name)}</strong><small>${formatBytes(pickedFile.size)}${editingDoc ? ' · substituirá o arquivo atual' : ''}</small></div>
            <button type="button" class="icon-btn" data-remove-file aria-label="Remover arquivo">${icon('i-x')}</button>
        </div>`;
}

function setPickedFile(file) {
    const error = file ? validateFile(file) : '';
    if (error) {
        formMessage(docForm, 'error', error);
        pickedFile = null;
    } else {
        formMessage(docForm, '', '');
        pickedFile = file || null;
        if (file && !docForm.title.value.trim()) {
            docForm.title.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        }
    }
    docForm.file.value = '';
    renderPickedFile();
}

function openDocumentModal(doc = null) {
    editingDoc = doc;
    pickedFile = null;
    docForm.reset();
    formMessage(docForm, '', '');
    $('[data-progress]').hidden = true;

    $('#doc-modal-title').textContent = doc ? 'Editar documento' : 'Enviar documento';
    $('[data-doc-modal-sub]').textContent = doc
        ? 'Atualize as informações ou envie um novo arquivo para substituir o atual.'
        : 'O arquivo ficará disponível somente para a empresa escolhida.';
    $('[data-submit]', docForm).textContent = doc ? 'Salvar alterações' : 'Enviar documento';

    const activeCompanies = state.companies.filter((c) => c.active || c.id === doc?.company_id);
    docForm.company_id.innerHTML = `<option value="">Selecione a empresa</option>` +
        activeCompanies.map((c) => `<option value="${c.id}">${esc(c.name)}${c.cnpj ? ` — ${formatCnpj(c.cnpj)}` : ''}</option>`).join('');
    docForm.category_id.innerHTML = `<option value="">Sem categoria</option>` +
        state.categories.filter((c) => c.active || c.id === doc?.category_id)
            .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

    docForm.company_id.disabled = Boolean(doc);
    if (doc) {
        docForm.company_id.value = doc.company_id;
        docForm.category_id.value = doc.category_id || '';
        docForm.title.value = doc.title;
        docForm.description.value = doc.description || '';
        docForm.reference_label.value = doc.reference_label || '';
        docForm.reference_month.value = doc.reference_date ? doc.reference_date.slice(0, 7) : '';
    } else if (state.docFilters.company) {
        docForm.company_id.value = state.docFilters.company;
    }

    $('[data-dropzone-hint]').textContent = doc
        ? 'Opcional: escolha um arquivo apenas se quiser substituir o atual.'
        : 'O arquivo original será disponibilizado para download.';
    renderRecipient();
    renderPickedFile();
    if (!activeCompanies.length) {
        formMessage(docForm, 'warning', 'Cadastre uma empresa antes de enviar documentos.');
    }
    docModal.showModal();
    (doc ? docForm.title : docForm.company_id).focus();
}

function referenceLabelFromMonth(month) {
    if (!month) return '';
    const date = new Date(`${month}-01T12:00:00`);
    const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', '/');
    return label.charAt(0).toUpperCase() + label.slice(1);
}

async function submitDocument(event) {
    event.preventDefault();
    const companyId = docForm.company_id.value;
    const title = docForm.title.value.trim();
    const month = docForm.reference_month.value;

    if (!companyId) { formMessage(docForm, 'error', 'Selecione a empresa destinatária.'); docForm.company_id.focus(); return; }
    if (!title) { formMessage(docForm, 'error', 'Informe o título do documento.'); docForm.title.focus(); return; }
    if (!editingDoc && !pickedFile) { formMessage(docForm, 'error', 'Escolha o arquivo a ser enviado.'); return; }

    const meta = {
        category_id: docForm.category_id.value || null,
        title,
        description: docForm.description.value.trim() || null,
        reference_label: docForm.reference_label.value.trim() || referenceLabelFromMonth(month) || null,
        reference_date: month ? `${month}-01` : null,
    };

    // Confirmação explícita da empresa antes de publicar um arquivo
    if (pickedFile) {
        const users = usersOfCompany(companyId);
        const ok = await confirmDialog({
            title: editingDoc ? 'Substituir o arquivo?' : 'Confirmar envio',
            message: `"${title}" será ${editingDoc ? 'atualizado' : 'publicado'} para a empresa ${companyName(companyId)}`
                + (users.length ? ` e ficará visível para ${users.length} usuário(s).` : '. Ainda não há clientes vinculados a ela.'),
            confirmLabel: editingDoc ? 'Substituir arquivo' : 'Enviar agora',
        });
        if (!ok) return;
    }

    const button = $('[data-submit]', docForm);
    setBusy(button, true);
    $('[data-progress]').hidden = !pickedFile;
    formMessage(docForm, '', '');

    try {
        if (editingDoc) await updateDocument(editingDoc, meta, pickedFile);
        else await createDocument(companyId, meta, pickedFile);
        docModal.close();
        toast(editingDoc ? 'Documento atualizado.' : 'Documento enviado e disponível para o cliente.', 'success');
        await reload({ quiet: true });
    } catch (error) {
        formMessage(docForm, 'error', friendlyError(error));
    } finally {
        setBusy(button, false);
        $('[data-progress]').hidden = true;
    }
}

async function uploadFile(companyId, docId, file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const contentType = MIME_BY_EXT[ext];
    const path = `${companyId}/${docId}/${Date.now()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { contentType, upsert: false });
    if (error) throw error;
    return { storage_path: path, file_name: file.name, mime_type: contentType, size_bytes: file.size };
}

async function createDocument(companyId, meta, file) {
    const id = crypto.randomUUID();
    const fileInfo = await uploadFile(companyId, id, file);
    const { error } = await supabase.from('documents').insert({ id, company_id: companyId, ...meta, ...fileInfo });
    if (error) {
        // Não deixa arquivo órfão no armazenamento
        await supabase.storage.from(STORAGE_BUCKET).remove([fileInfo.storage_path]);
        throw error;
    }
}

async function updateDocument(doc, meta, file) {
    let fileInfo = {};
    if (file) fileInfo = await uploadFile(doc.company_id, doc.id, file);
    const { error } = await supabase.from('documents').update({ ...meta, ...fileInfo }).eq('id', doc.id);
    if (error) {
        if (file) await supabase.storage.from(STORAGE_BUCKET).remove([fileInfo.storage_path]);
        throw error;
    }
    if (file) await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]);
}

async function deleteDocument(doc, button) {
    const ok = await confirmDialog({
        title: 'Excluir documento?',
        message: `"${doc.title}" de ${companyName(doc.company_id)} será removido do portal e o arquivo será apagado. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir documento',
        danger: true,
    });
    if (!ok) return;
    button.classList.add('is-loading');
    try {
        const { error } = await supabase.from('documents').delete().eq('id', doc.id);
        if (error) throw error;
        const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]);
        if (storageError) console.warn('Arquivo não removido do armazenamento:', storageError.message);
        toast('Documento excluído.', 'success');
        await reload({ quiet: true });
    } catch (error) {
        toast(friendlyError(error), 'error');
        button.classList.remove('is-loading');
    }
}

// ---------- Clientes ----------

function renderClients() {
    const f = state.clientFilters;
    const list = state.profiles.filter((p) =>
        (!f.role || p.role === f.role)
        && (!f.status || (f.status === 'active') === p.active)
        && matches(f.q, p.full_name, p.email, companiesOfUser(p.id).map((c) => c.name).join(' ')));

    const target = $('[data-client-table]');
    if (!state.profiles.some((p) => p.role === 'client') && !f.q && !f.role && !f.status) {
        target.innerHTML = emptyState({
            iconName: 'i-users',
            title: 'Nenhum cliente cadastrado',
            text: 'Convide o primeiro cliente. Ele receberá um e-mail para criar a senha.',
            action: `<button type="button" class="btn btn-primary btn-sm" data-new-client>${icon('i-plus')}Novo cliente</button>`,
        });
        return;
    }
    if (!list.length) {
        target.innerHTML = emptyState({ iconName: 'i-search', title: 'Nenhum resultado', text: 'Ajuste a pesquisa ou os filtros.' });
        return;
    }

    target.innerHTML = `
        <div class="table-wrap"><table class="table table-cards">
            <thead><tr>
                <th scope="col">Usuário</th><th scope="col">Empresas</th><th scope="col">Perfil</th>
                <th scope="col">Situação</th><th scope="col">Desde</th>
                <th scope="col" class="actions"><span class="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>${list.map((p) => {
                const isMe = p.id === state.profile.id;
                const companies = companiesOfUser(p.id);
                return `<tr>
                    <td><div class="doc-cell"><span class="avatar">${esc(initials(p.full_name || p.email))}</span>
                        <div><strong>${esc(p.full_name || '—')}${isMe ? ' <span class="badge">Você</span>' : ''}</strong><small>${esc(p.email)}</small></div></div></td>
                    <td data-label="Empresas">${companies.length
                        ? companies.map((c) => `<span class="badge badge-brand">${esc(c.name)}</span>`).join(' ')
                        : (p.role === 'admin' ? '<span class="muted">Acesso total</span>' : '<span class="badge badge-warning">Sem empresa</span>')}</td>
                    <td data-label="Perfil">${p.role === 'admin' ? '<span class="badge">Administrador</span>' : 'Cliente'}</td>
                    <td data-label="Situação">${statusBadge(p.active)}</td>
                    <td data-label="Desde" class="muted">${formatDate(p.created_at)}</td>
                    <td class="actions"><span class="row-actions">
                        <button type="button" class="icon-btn" data-client-edit="${p.id}" title="Editar" aria-label="Editar ${esc(p.email)}">${icon('i-edit')}</button>
                        <button type="button" class="icon-btn" data-client-link="${p.id}" title="Enviar link para definir senha" aria-label="Enviar link de acesso para ${esc(p.email)}">${icon('i-key')}</button>
                        ${isMe ? '' : `<button type="button" class="icon-btn ${p.active ? 'danger' : ''}" data-client-toggle="${p.id}"
                            title="${p.active ? 'Desativar acesso' : 'Reativar acesso'}" aria-label="${p.active ? 'Desativar' : 'Reativar'} ${esc(p.email)}">${icon('i-power')}</button>`}
                    </span></td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>`;
}

const clientModal = wireDialog($('#modal-client'));
const clientForm = $('[data-client-form]');
let editingClient = null;

function openClientModal(profile = null) {
    editingClient = profile;
    clientForm.reset();
    formMessage(clientForm, '', '');
    $('#client-modal-title').textContent = profile ? 'Editar usuário' : 'Novo cliente';
    $('[data-client-modal-sub]').textContent = profile
        ? 'Altere o nome e as empresas que este usuário pode acessar.'
        : 'O cliente receberá um e-mail para criar a senha de acesso.';
    $('[data-submit]', clientForm).textContent = profile ? 'Salvar alterações' : 'Enviar convite';
    clientForm.email.disabled = Boolean(profile);

    const linked = new Set(profile ? companiesOfUser(profile.id).map((c) => c.id) : []);
    $('[data-client-companies]').innerHTML = state.companies.length
        ? state.companies.map((c) => `
            <label><input type="checkbox" name="companies" value="${c.id}" ${linked.has(c.id) ? 'checked' : ''}>
            ${esc(c.name)}${c.active ? '' : ' <span class="badge badge-danger">Desativada</span>'}</label>`).join('')
        : '<span class="field-hint">Cadastre empresas em "Empresas" para poder vinculá-las.</span>';

    if (profile) {
        clientForm.full_name.value = profile.full_name || '';
        clientForm.email.value = profile.email;
    }
    clientModal.showModal();
    clientForm.full_name.focus();
}

async function submitClient(event) {
    event.preventDefault();
    const fullName = clientForm.full_name.value.trim();
    const email = clientForm.email.value.trim().toLowerCase();
    const companyIds = $$('input[name="companies"]:checked', clientForm).map((i) => i.value);

    if (fullName.length < 2) { formMessage(clientForm, 'error', 'Informe o nome.'); clientForm.full_name.focus(); return; }
    if (!editingClient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        formMessage(clientForm, 'error', 'Informe um e-mail válido.'); clientForm.email.focus(); return;
    }

    const button = $('[data-submit]', clientForm);
    setBusy(button, true);
    try {
        if (editingClient) {
            const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', editingClient.id);
            if (error) throw error;
            const current = new Set(companiesOfUser(editingClient.id).map((c) => c.id));
            const wanted = new Set(companyIds);
            const toAdd = [...wanted].filter((id) => !current.has(id)).map((company_id) => ({ company_id, user_id: editingClient.id }));
            const toRemove = [...current].filter((id) => !wanted.has(id));
            if (toAdd.length) {
                const { error: e } = await supabase.from('company_members').insert(toAdd);
                if (e) throw e;
            }
            if (toRemove.length) {
                const { error: e } = await supabase.from('company_members').delete().eq('user_id', editingClient.id).in('company_id', toRemove);
                if (e) throw e;
            }
            toast('Usuário atualizado.', 'success');
        } else {
            const { data, error } = await supabase.functions.invoke('admin-users', {
                body: { action: 'invite', email, full_name: fullName, company_ids: companyIds },
            });
            if (error) throw new Error(await functionError(error));
            if (data?.error) throw new Error(data.error);
            toast(`Convite enviado para ${email}.`, 'success');
        }
        clientModal.close();
        await reload({ quiet: true });
    } catch (error) {
        formMessage(clientForm, 'error', friendlyError(error));
    } finally {
        setBusy(button, false);
    }
}

// Lê a mensagem de erro devolvida pela Edge Function
async function functionError(error) {
    try {
        const body = await error.context?.json?.();
        if (body?.error) return body.error;
    } catch { /* ignora */ }
    if (/Failed to send|FunctionsFetchError|404/i.test(error.message)) {
        return 'A função "admin-users" não está publicada no Supabase. Veja o passo 4 do PORTAL.md.';
    }
    return error.message;
}

async function sendAccessLink(profile, button) {
    const ok = await confirmDialog({
        title: 'Enviar link de acesso?',
        message: `${profile.email} receberá um e-mail com um link para definir uma nova senha.`,
        confirmLabel: 'Enviar link',
    });
    if (!ok) return;
    button.classList.add('is-loading');
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${SITE_URL}/portal/definir-senha.html`,
    });
    button.classList.remove('is-loading');
    if (error) toast(friendlyError(error), 'error');
    else toast(`Link enviado para ${profile.email}.`, 'success');
}

async function toggleClient(profile, button) {
    const activate = !profile.active;
    const ok = await confirmDialog({
        title: activate ? 'Reativar acesso?' : 'Desativar acesso?',
        message: activate
            ? `${profile.full_name || profile.email} voltará a acessar o portal.`
            : `${profile.full_name || profile.email} não conseguirá mais entrar nem ver documentos. Os arquivos não são apagados.`,
        confirmLabel: activate ? 'Reativar' : 'Desativar acesso',
        danger: !activate,
    });
    if (!ok) return;
    button.classList.add('is-loading');
    try {
        const { data, error } = await supabase.functions.invoke('admin-users', {
            body: { action: 'set_active', user_id: profile.id, active: activate },
        });
        if (error) throw new Error(await functionError(error));
        if (data?.error) throw new Error(data.error);
        toast(activate ? 'Acesso reativado.' : 'Acesso desativado.', 'success');
        await reload({ quiet: true });
    } catch (error) {
        toast(friendlyError(error), 'error');
        button.classList.remove('is-loading');
    }
}

// ---------- Empresas ----------

function renderCompanies() {
    const list = state.companies.filter((c) => matches(state.companyQuery, c.name, c.cnpj, formatCnpj(c.cnpj)));
    const target = $('[data-company-table]');
    if (!state.companies.length) {
        target.innerHTML = emptyState({
            iconName: 'i-building',
            title: 'Nenhuma empresa cadastrada',
            text: 'Cadastre as empresas atendidas para vincular clientes e enviar documentos.',
            action: `<button type="button" class="btn btn-primary btn-sm" data-new-company>${icon('i-plus')}Nova empresa</button>`,
        });
        return;
    }
    if (!list.length) {
        target.innerHTML = emptyState({ iconName: 'i-search', title: 'Nenhuma empresa encontrada', text: 'Tente outro nome ou CNPJ.' });
        return;
    }
    target.innerHTML = `
        <div class="table-wrap"><table class="table table-cards">
            <thead><tr>
                <th scope="col">Empresa</th><th scope="col">CNPJ</th><th scope="col">Usuários</th>
                <th scope="col">Documentos</th><th scope="col">Situação</th>
                <th scope="col" class="actions"><span class="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>${list.map((c) => {
                const users = usersOfCompany(c.id);
                const docs = state.docs.filter((d) => d.company_id === c.id).length;
                return `<tr>
                    <td><div class="doc-cell"><span class="icon-box" style="width:40px;height:40px">${icon('i-building', '')}</span><strong>${esc(c.name)}</strong></div></td>
                    <td data-label="CNPJ">${esc(formatCnpj(c.cnpj))}</td>
                    <td data-label="Usuários" title="${esc(users.map((u) => u.email).join(', '))}">${users.length}</td>
                    <td data-label="Documentos">${docs}</td>
                    <td data-label="Situação">${statusBadge(c.active, 'Ativa', 'Desativada')}</td>
                    <td class="actions"><span class="row-actions">
                        <button type="button" class="icon-btn" data-company-docs="${c.id}" title="Ver documentos" aria-label="Ver documentos de ${esc(c.name)}">${icon('i-files')}</button>
                        <button type="button" class="icon-btn" data-company-edit="${c.id}" title="Editar" aria-label="Editar ${esc(c.name)}">${icon('i-edit')}</button>
                        <button type="button" class="icon-btn ${c.active ? 'danger' : ''}" data-company-toggle="${c.id}" title="${c.active ? 'Desativar' : 'Reativar'}" aria-label="${c.active ? 'Desativar' : 'Reativar'} ${esc(c.name)}">${icon('i-power')}</button>
                        ${docs ? '' : `<button type="button" class="icon-btn danger" data-company-delete="${c.id}" title="Excluir" aria-label="Excluir ${esc(c.name)}">${icon('i-trash')}</button>`}
                    </span></td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>`;
}

const companyModal = wireDialog($('#modal-company'));
const companyForm = $('[data-company-form]');
let editingCompany = null;

function maskCnpj(value) {
    const d = value.replace(/\D/g, '').slice(0, 14);
    return d
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
}

function validCnpj(cnpj) {
    if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
    const calc = (len) => {
        const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0);
        const rest = sum % 11;
        return rest < 2 ? 0 : 11 - rest;
    };
    return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

function openCompanyModal(company = null) {
    editingCompany = company;
    companyForm.reset();
    formMessage(companyForm, '', '');
    $('#company-modal-title').textContent = company ? 'Editar empresa' : 'Nova empresa';
    if (company) {
        companyForm.name.value = company.name;
        companyForm.cnpj.value = company.cnpj ? maskCnpj(company.cnpj) : '';
    }
    companyModal.showModal();
    companyForm.name.focus();
}

async function submitCompany(event) {
    event.preventDefault();
    const name = companyForm.name.value.trim();
    const cnpj = companyForm.cnpj.value.replace(/\D/g, '') || null;
    if (!name) { formMessage(companyForm, 'error', 'Informe o nome da empresa.'); companyForm.name.focus(); return; }
    if (cnpj && !validCnpj(cnpj)) { formMessage(companyForm, 'error', 'CNPJ inválido. Confira os números.'); companyForm.cnpj.focus(); return; }

    const button = $('[data-submit]', companyForm);
    setBusy(button, true);
    try {
        const query = editingCompany
            ? supabase.from('companies').update({ name, cnpj }).eq('id', editingCompany.id)
            : supabase.from('companies').insert({ name, cnpj });
        const { error } = await query;
        if (error) throw error;
        companyModal.close();
        toast(editingCompany ? 'Empresa atualizada.' : 'Empresa cadastrada.', 'success');
        await reload({ quiet: true });
    } catch (error) {
        formMessage(companyForm, 'error', /duplicate|unique/i.test(error.message) ? 'Já existe uma empresa com este CNPJ.' : friendlyError(error));
    } finally {
        setBusy(button, false);
    }
}

async function toggleCompany(company, button) {
    const activate = !company.active;
    const ok = await confirmDialog({
        title: activate ? 'Reativar empresa?' : 'Desativar empresa?',
        message: activate
            ? `Os clientes vinculados voltarão a ver os documentos de ${company.name}.`
            : `Os clientes vinculados deixarão de ver os documentos de ${company.name}. Nada é apagado.`,
        confirmLabel: activate ? 'Reativar' : 'Desativar empresa',
        danger: !activate,
    });
    if (!ok) return;
    button.classList.add('is-loading');
    const { error } = await supabase.from('companies').update({ active: activate }).eq('id', company.id);
    if (error) { toast(friendlyError(error), 'error'); button.classList.remove('is-loading'); return; }
    toast(activate ? 'Empresa reativada.' : 'Empresa desativada.', 'success');
    await reload({ quiet: true });
}

async function deleteCompany(company, button) {
    const ok = await confirmDialog({
        title: 'Excluir empresa?',
        message: `${company.name} e os vínculos com clientes serão removidos. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir empresa',
        danger: true,
    });
    if (!ok) return;
    button.classList.add('is-loading');
    const { error } = await supabase.from('companies').delete().eq('id', company.id);
    if (error) { toast(friendlyError(error), 'error'); button.classList.remove('is-loading'); return; }
    toast('Empresa excluída.', 'success');
    await reload({ quiet: true });
}

// ---------- Categorias ----------

function renderCategories() {
    const target = $('[data-category-table]');
    if (!state.categories.length) {
        target.innerHTML = emptyState({
            iconName: 'i-tag',
            title: 'Nenhuma categoria',
            text: 'Crie categorias como "Balanço patrimonial" ou "DRE" para organizar os documentos.',
            action: `<button type="button" class="btn btn-primary btn-sm" data-new-category>${icon('i-plus')}Nova categoria</button>`,
        });
        return;
    }
    target.innerHTML = `
        <div class="table-wrap"><table class="table table-cards">
            <thead><tr>
                <th scope="col">Ordem</th><th scope="col">Categoria</th><th scope="col">Documentos</th>
                <th scope="col">Situação</th><th scope="col" class="actions"><span class="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>${state.categories.map((c) => `
                <tr>
                    <td data-label="Ordem" class="muted">${c.sort_order}</td>
                    <td><strong>${esc(c.name)}</strong>${c.description ? `<br><small class="muted">${esc(c.description)}</small>` : ''}</td>
                    <td data-label="Documentos">${state.docs.filter((d) => d.category_id === c.id).length}</td>
                    <td data-label="Situação">${statusBadge(c.active, 'Visível', 'Oculta')}</td>
                    <td class="actions"><span class="row-actions">
                        <button type="button" class="icon-btn" data-category-edit="${c.id}" title="Editar" aria-label="Editar ${esc(c.name)}">${icon('i-edit')}</button>
                        <button type="button" class="icon-btn danger" data-category-delete="${c.id}" title="Excluir" aria-label="Excluir ${esc(c.name)}">${icon('i-trash')}</button>
                    </span></td>
                </tr>`).join('')}
            </tbody>
        </table></div>`;
}

const categoryModal = wireDialog($('#modal-category'));
const categoryForm = $('[data-category-form]');
let editingCategory = null;

function openCategoryModal(category = null) {
    editingCategory = category;
    categoryForm.reset();
    formMessage(categoryForm, '', '');
    $('#category-modal-title').textContent = category ? 'Editar categoria' : 'Nova categoria';
    if (category) {
        categoryForm.name.value = category.name;
        categoryForm.description.value = category.description || '';
        categoryForm.sort_order.value = category.sort_order;
        categoryForm.active.checked = category.active;
    } else {
        categoryForm.sort_order.value = (Math.max(0, ...state.categories.map((c) => c.sort_order)) + 10);
    }
    categoryModal.showModal();
    categoryForm.name.focus();
}

async function submitCategory(event) {
    event.preventDefault();
    const payload = {
        name: categoryForm.name.value.trim(),
        description: categoryForm.description.value.trim() || null,
        sort_order: Number(categoryForm.sort_order.value) || 0,
        active: categoryForm.active.checked,
    };
    if (!payload.name) { formMessage(categoryForm, 'error', 'Informe o nome da categoria.'); categoryForm.name.focus(); return; }
    const button = $('[data-submit]', categoryForm);
    setBusy(button, true);
    try {
        const query = editingCategory
            ? supabase.from('categories').update(payload).eq('id', editingCategory.id)
            : supabase.from('categories').insert(payload);
        const { error } = await query;
        if (error) throw error;
        categoryModal.close();
        toast('Categoria salva.', 'success');
        await reload({ quiet: true });
    } catch (error) {
        formMessage(categoryForm, 'error', /duplicate|unique/i.test(error.message) ? 'Já existe uma categoria com este nome.' : friendlyError(error));
    } finally {
        setBusy(button, false);
    }
}

async function deleteCategory(category, button) {
    const count = state.docs.filter((d) => d.category_id === category.id).length;
    const ok = await confirmDialog({
        title: 'Excluir categoria?',
        message: count
            ? `${count} documento(s) ficarão "Sem categoria". Os arquivos não são apagados.`
            : `A categoria "${category.name}" será removida.`,
        confirmLabel: 'Excluir categoria',
        danger: true,
    });
    if (!ok) return;
    button.classList.add('is-loading');
    const { error } = await supabase.from('categories').delete().eq('id', category.id);
    if (error) { toast(friendlyError(error), 'error'); button.classList.remove('is-loading'); return; }
    toast('Categoria excluída.', 'success');
    await reload({ quiet: true });
}

// ---------- Registros ----------

function renderAudit() {
    const list = state.audit.filter((a) => !state.auditFilter || a.entity === state.auditFilter);
    const target = $('[data-audit-table]');
    if (!list.length) {
        target.innerHTML = emptyState({ iconName: 'i-history', title: 'Nenhum registro', text: 'As operações administrativas aparecerão aqui.' });
        return;
    }
    target.innerHTML = `
        <div class="table-wrap"><table class="table table-cards">
            <thead><tr><th scope="col">Data</th><th scope="col">Operação</th><th scope="col">Responsável</th><th scope="col">Detalhes</th></tr></thead>
            <tbody>${list.map((a) => {
                const { ico, text } = describeAudit(a);
                return `<tr>
                    <td data-label="Data" class="muted" style="white-space:nowrap">${formatDateTime(a.created_at)}</td>
                    <td><div class="doc-cell" style="min-width:0"><span class="act-ico icon-box" style="width:32px;height:32px">${icon(ico, '')}</span>${esc(text)}</div></td>
                    <td data-label="Responsável">${esc(a.actor_email || 'Sistema')}</td>
                    <td data-label="Detalhes"><div class="json-details" title="${esc(JSON.stringify(a.details))}">${esc(JSON.stringify(a.details))}</div></td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>`;
}

// ---------- Renderização geral e eventos ----------

function renderCounts() {
    $('[data-count="documentos"]').textContent = state.docs.length;
    $('[data-count="clientes"]').textContent = state.profiles.filter((p) => p.role === 'client').length;
    $('[data-count="empresas"]').textContent = state.companies.length;
}

function renderAll() {
    renderCounts();
    renderOverview();
    renderDocFilters();
    renderDocs();
    renderClients();
    renderCompanies();
    renderCategories();
    renderAudit();
}

function wireEvents(shell) {
    window.addEventListener('hashchange', () => showRoute(shell));

    // Formulários
    docForm.addEventListener('submit', submitDocument);
    docForm.company_id.addEventListener('change', renderRecipient);
    clientForm.addEventListener('submit', submitClient);
    companyForm.addEventListener('submit', submitCompany);
    categoryForm.addEventListener('submit', submitCategory);
    companyForm.cnpj.addEventListener('input', () => { companyForm.cnpj.value = maskCnpj(companyForm.cnpj.value); });

    // Arquivo: seleção e arrastar-e-soltar
    const dropzone = $('[data-dropzone]');
    docForm.file.addEventListener('change', () => setPickedFile(docForm.file.files[0]));
    ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (e) => { e.preventDefault(); dropzone.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, () => dropzone.classList.remove('is-over')));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 1) toast('Envie um arquivo por vez.', 'info');
        setPickedFile(e.dataTransfer.files[0]);
    });

    // Filtros e pesquisas
    $('[data-doc-search]').addEventListener('input', debounce((e) => { state.docFilters.q = e.target.value; renderDocs(); }));
    $$('[data-doc-filter]').forEach((s) => s.addEventListener('change', () => { state.docFilters[s.dataset.docFilter] = s.value; renderDocs(); }));
    $('[data-client-search]').addEventListener('input', debounce((e) => { state.clientFilters.q = e.target.value; renderClients(); }));
    $$('[data-client-filter]').forEach((s) => s.addEventListener('change', () => { state.clientFilters[s.dataset.clientFilter] = s.value; renderClients(); }));
    $('[data-company-search]').addEventListener('input', debounce((e) => { state.companyQuery = e.target.value; renderCompanies(); }));
    $('[data-audit-filter]').addEventListener('change', (e) => { state.auditFilter = e.target.value; renderAudit(); });

    // Ações por delegação
    document.addEventListener('click', (event) => {
        const t = event.target.closest('button, a');
        if (!t) return;
        const d = t.dataset;

        if ('logout' in d) return signOut();
        if ('reload' in d) return reload();
        if ('newDocument' in d) return openDocumentModal();
        if ('newClient' in d) return openClientModal();
        if ('newCompany' in d) return openCompanyModal();
        if ('newCategory' in d) return openCategoryModal();
        if ('removeFile' in d) { pickedFile = null; renderPickedFile(); return; }

        if (d.docPreview) return previewDocument(byId(state.docs, d.docPreview), t);
        if (d.docDownload) return downloadDocument(byId(state.docs, d.docDownload), t);
        if (d.docEdit) return openDocumentModal(byId(state.docs, d.docEdit));
        if (d.docDelete) return deleteDocument(byId(state.docs, d.docDelete), t);

        if (d.clientEdit) return openClientModal(byId(state.profiles, d.clientEdit));
        if (d.clientLink) return sendAccessLink(byId(state.profiles, d.clientLink), t);
        if (d.clientToggle) return toggleClient(byId(state.profiles, d.clientToggle), t);

        if (d.companyEdit) return openCompanyModal(byId(state.companies, d.companyEdit));
        if (d.companyToggle) return toggleCompany(byId(state.companies, d.companyToggle), t);
        if (d.companyDelete) return deleteCompany(byId(state.companies, d.companyDelete), t);
        if (d.companyDocs) {
            state.docFilters.company = d.companyDocs;
            renderDocFilters();
            renderDocs();
            location.hash = 'documentos';
            return;
        }

        if (d.categoryEdit) return openCategoryModal(byId(state.categories, d.categoryEdit));
        if (d.categoryDelete) return deleteCategory(byId(state.categories, d.categoryDelete), t);
    });
}

// ---------- Início ----------

async function init() {
    const auth = await requireUser({ role: 'admin' });
    if (!auth) return;
    state.profile = auth.profile;

    $('[data-boot]').remove();
    $('[data-app]').hidden = false;
    fillUserChip(state.profile);
    const shell = initShell();
    wireEvents(shell);
    showRoute();

    ['[data-doc-table]', '[data-client-table]', '[data-company-table]', '[data-category-table]', '[data-audit-table]', '[data-latest-docs]']
        .forEach((sel) => { $(sel).innerHTML = loadingRows(4); });

    await reload({ quiet: true });
}

init();

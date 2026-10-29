// Painel do cliente: resumo, documentos recentes e central de documentos.
// Todas as consultas passam pelas regras de segurança do banco (RLS): o cliente
// só recebe os dados das empresas às quais está vinculado.
import { supabase } from './supabase.js';
import { requireUser, signOut, fillUserChip } from './session.js';
import { downloadDocument, previewDocument, canPreview } from './files.js';
import {
    $, $$, icon, esc, formatDate, formatBytes, fileKind, fileBadge, debounce,
    emptyState, loadingRows, friendlyError, initShell,
} from './ui.js';

const state = {
    profile: null,
    companies: [],
    categories: [],
    docs: [],
    viewed: new Set(),
    filters: { q: '', category: '', company: '', year: '', type: '', sort: 'recent' },
};

const companyName = (id) => state.companies.find((c) => c.id === id)?.name || '';
const categoryName = (id) => state.categories.find((c) => c.id === id)?.name || 'Sem categoria';
const isNew = (doc) => !state.viewed.has(doc.id);
const refYear = (doc) => (doc.reference_date || doc.created_at || '').slice(0, 4);

function normalize(text) {
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------- Carregamento ----------

async function loadData() {
    const [companies, categories, docs, views] = await Promise.all([
        supabase.from('companies').select('id, name, cnpj').eq('active', true).order('name'),
        supabase.from('categories').select('id, name, sort_order').order('sort_order').order('name'),
        supabase.from('documents')
            .select('id, company_id, category_id, title, description, reference_label, reference_date, storage_path, file_name, mime_type, size_bytes, created_at')
            .order('created_at', { ascending: false })
            .limit(2000),
        supabase.from('document_views').select('document_id').eq('user_id', state.profile.id),
    ]);
    for (const result of [companies, categories, docs, views]) {
        if (result.error) throw result.error;
    }
    state.companies = companies.data;
    state.categories = categories.data;
    state.docs = docs.data;
    state.viewed = new Set(views.data.map((v) => v.document_id));
}

async function markViewed(doc) {
    if (state.viewed.has(doc.id)) return;
    state.viewed.add(doc.id);
    renderAll();
    const { error } = await supabase
        .from('document_views')
        .upsert({ document_id: doc.id, user_id: state.profile.id }, { onConflict: 'document_id,user_id', ignoreDuplicates: true });
    if (error) console.warn('Não foi possível registrar a visualização:', error.message);
}

// ---------- Filtros ----------

function scopedDocs() {
    return state.filters.company ? state.docs.filter((d) => d.company_id === state.filters.company) : state.docs;
}

function filteredDocs() {
    const f = state.filters;
    const q = normalize(f.q);
    let list = scopedDocs().filter((doc) => {
        if (f.category && (doc.category_id || 'none') !== f.category) return false;
        if (f.year && refYear(doc) !== f.year) return false;
        if (f.type && fileKind(doc.mime_type, doc.file_name).type !== f.type) return false;
        if (q) {
            const haystack = normalize([doc.title, doc.description, doc.reference_label, doc.file_name, categoryName(doc.category_id)].join(' '));
            if (!q.split(/\s+/).every((term) => haystack.includes(term))) return false;
        }
        return true;
    });

    const sorters = {
        recent: (a, b) => b.created_at.localeCompare(a.created_at),
        oldest: (a, b) => a.created_at.localeCompare(b.created_at),
        name: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
        period: (a, b) => (b.reference_date || '').localeCompare(a.reference_date || '') || b.created_at.localeCompare(a.created_at),
    };
    return list.sort(sorters[f.sort] || sorters.recent);
}

function hasActiveFilters() {
    const f = state.filters;
    return Boolean(f.q || f.category || f.year || f.type);
}

// ---------- Renderização ----------

function renderHeader() {
    const first = (state.profile.full_name || '').split(' ')[0];
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    $('[data-greeting]').textContent = first ? `${hello}, ${first}!` : `${hello}!`;

    $('[data-company-badges]').innerHTML = state.companies
        .map((c) => `<span class="badge badge-brand">${icon('i-building')}${esc(c.name)}</span>`)
        .join('');

    const switcher = $('[data-company-switch]');
    switcher.hidden = state.companies.length < 2;
    $('[data-filter="company"]').innerHTML =
        `<option value="">Todas as empresas</option>` +
        state.companies.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

function renderKpis() {
    const docs = scopedDocs();
    $('[data-kpi="total"]').textContent = docs.length;
    $('[data-kpi="new"]').textContent = docs.filter(isNew).length;
    const last = docs.reduce((max, d) => (d.created_at > max ? d.created_at : max), '');
    $('[data-kpi="last"]').textContent = last ? formatDate(last) : '—';
}

function categoriesWithCount() {
    const docs = scopedDocs();
    const counts = new Map();
    docs.forEach((d) => counts.set(d.category_id || 'none', (counts.get(d.category_id || 'none') || 0) + 1));
    const list = state.categories
        .filter((c) => counts.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) }));
    if (counts.has('none')) list.push({ id: 'none', name: 'Sem categoria', count: counts.get('none') });
    return { list, total: docs.length };
}

function renderCategories() {
    const { list, total } = categoriesWithCount();
    const current = state.filters.category;

    $('[data-side-categories]').innerHTML =
        [{ id: '', name: 'Todos os documentos', count: total }, ...list].map((c) => `
            <button type="button" class="side-link ${current === c.id ? 'is-active' : ''}" data-category="${c.id}">
                ${icon(c.id ? 'i-folder' : 'i-grid')}${esc(c.name)}<span class="count">${c.count}</span>
            </button>`).join('');

    $('[data-chips]').innerHTML =
        [{ id: '', name: 'Todos', count: total }, ...list].map((c) => `
            <button type="button" class="chip" aria-pressed="${current === c.id}" data-category="${c.id}">
                ${esc(c.name)} <span class="count">${c.count}</span>
            </button>`).join('');

    $('[data-filter="category"]').innerHTML =
        `<option value="">Todas as categorias</option>` +
        list.map((c) => `<option value="${c.id}" ${current === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

    const years = [...new Set(scopedDocs().map(refYear).filter(Boolean))].sort().reverse();
    $('[data-filter="year"]').innerHTML =
        `<option value="">Todos os períodos</option>` +
        years.map((y) => `<option value="${y}" ${state.filters.year === y ? 'selected' : ''}>${y}</option>`).join('');
}

function docActions(doc) {
    return `
        <span class="row-actions">
            ${canPreview(doc) ? `<button type="button" class="icon-btn" data-preview="${doc.id}" aria-label="Visualizar ${esc(doc.title)}" title="Visualizar">${icon('i-eye')}</button>` : ''}
            <button type="button" class="icon-btn primary" data-download="${doc.id}" aria-label="Baixar ${esc(doc.title)}" title="Baixar">${icon('i-download')}</button>
        </span>`;
}

function renderRecent() {
    const target = $('[data-recent]');
    const docs = scopedDocs().slice(0, 4);
    if (!docs.length) {
        target.innerHTML = state.companies.length
            ? emptyState({
                title: 'Ainda não há documentos disponíveis',
                text: 'Quando o escritório publicar balanços, DRE ou outros documentos da sua empresa, eles aparecerão aqui.',
            })
            : emptyState({
                iconName: 'i-building',
                title: 'Sua conta ainda não está vinculada a uma empresa',
                text: 'Fale com o escritório para liberar o acesso aos documentos da sua empresa.',
                action: '<a class="btn btn-ghost btn-sm" href="https://wa.me/5511985368674" target="_blank" rel="noopener">Falar com o escritório</a>',
            });
        return;
    }
    target.innerHTML = `<div class="recent">${docs.map((doc) => `
        <article class="recent-card">
            ${isNew(doc) ? '<span class="badge badge-warning badge-dot new-dot">Novo</span>' : ''}
            ${fileBadge(doc)}
            <div>
                <div class="doc-name">${esc(doc.title)}</div>
                <div class="doc-meta">${esc(categoryName(doc.category_id))}${doc.reference_label ? ` · ${esc(doc.reference_label)}` : ''}</div>
                ${state.companies.length > 1 ? `<div class="doc-meta">${esc(companyName(doc.company_id))}</div>` : ''}
            </div>
            <div class="recent-actions">${docActions(doc)}</div>
        </article>`).join('')}</div>`;
}

function renderDocs() {
    const target = $('[data-docs]');
    const list = filteredDocs();
    const total = scopedDocs().length;
    const multi = state.companies.length > 1 && !state.filters.company;

    $('[data-result-count]').textContent = total
        ? `${list.length} de ${total} documento${total === 1 ? '' : 's'}`
        : '';
    $('[data-clear-filters]').hidden = !hasActiveFilters();

    if (!total) {
        target.innerHTML = emptyState({
            title: 'Nenhum documento por aqui ainda',
            text: 'Assim que o escritório disponibilizar arquivos, você poderá visualizar e baixar tudo nesta área.',
        });
        return;
    }
    if (!list.length) {
        target.innerHTML = emptyState({
            iconName: 'i-search',
            title: 'Nenhum documento encontrado',
            text: 'Tente outro termo de pesquisa ou remova alguns filtros.',
            action: '<button type="button" class="btn btn-ghost btn-sm" data-clear-filters-inline>Limpar filtros</button>',
        });
        return;
    }

    target.innerHTML = `
        <div class="table-wrap">
            <table class="table table-cards">
                <thead>
                    <tr>
                        <th scope="col">Documento</th>
                        <th scope="col">Categoria</th>
                        <th scope="col">Período</th>
                        <th scope="col">Disponível em</th>
                        <th scope="col" class="num">Tamanho</th>
                        <th scope="col" class="actions"><span class="sr-only">Ações</span></th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map((doc) => `
                        <tr>
                            <td>
                                <div class="doc-cell">
                                    ${fileBadge(doc)}
                                    <div>
                                        <strong>${esc(doc.title)}${isNew(doc) ? ' <span class="badge badge-warning badge-dot">Novo</span>' : ''}</strong>
                                        ${multi ? `<small>${icon('i-building')} ${esc(companyName(doc.company_id))}</small>` : ''}
                                        ${doc.description ? `<small title="${esc(doc.description)}">${esc(doc.description)}</small>` : ''}
                                    </div>
                                </div>
                            </td>
                            <td data-label="Categoria">${esc(categoryName(doc.category_id))}</td>
                            <td data-label="Período">${esc(doc.reference_label || '—')}</td>
                            <td data-label="Disponível em" class="muted">${formatDate(doc.created_at)}</td>
                            <td data-label="Tamanho" class="num muted">${formatBytes(doc.size_bytes)} · ${esc(fileKind(doc.mime_type, doc.file_name).name)}</td>
                            <td class="actions">${docActions(doc)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderAll() {
    renderKpis();
    renderCategories();
    renderRecent();
    renderDocs();
}

// ---------- Eventos ----------

function clearFilters() {
    Object.assign(state.filters, { q: '', category: '', year: '', type: '' });
    $$('[data-search]').forEach((i) => { i.value = ''; });
    $('[data-filter="type"]').value = '';
    renderAll();
}

function wireEvents(shell) {
    const onSearch = debounce((value) => {
        state.filters.q = value;
        renderDocs();
    }, 200);

    $$('[data-search]').forEach((input) => {
        input.addEventListener('input', () => {
            $$('[data-search]').forEach((other) => { if (other !== input) other.value = input.value; });
            onSearch(input.value.trim());
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && input.closest('.topbar')) $('#documentos').scrollIntoView({ behavior: 'smooth' });
        });
    });

    $$('[data-filter]').forEach((select) => {
        select.addEventListener('change', () => {
            state.filters[select.dataset.filter] = select.value;
            if (select.dataset.filter === 'company') {
                state.filters.category = '';
                state.filters.year = '';
            }
            renderAll();
        });
    });

    document.addEventListener('click', (event) => {
        const category = event.target.closest('[data-category]');
        if (category) {
            state.filters.category = category.dataset.category;
            renderAll();
            if (category.closest('[data-sidebar]')) {
                shell.close();
                $('#documentos').scrollIntoView({ behavior: 'smooth' });
            }
            return;
        }

        const preview = event.target.closest('[data-preview]');
        const download = event.target.closest('[data-download]');
        const button = preview || download;
        if (button) {
            const doc = state.docs.find((d) => d.id === (button.dataset.preview || button.dataset.download));
            if (!doc) return;
            const action = preview ? previewDocument : downloadDocument;
            action(doc, button).then((done) => { if (done) markViewed(doc); });
            return;
        }

        if (event.target.closest('[data-clear-filters], [data-clear-filters-inline]')) clearFilters();

        if (event.target.closest('[data-logout]')) signOut();

        const section = event.target.closest('[data-side-section]');
        if (section) {
            $$('[data-side-section]').forEach((l) => l.classList.toggle('is-active', l === section));
            shell.close();
        }
    });
}

// ---------- Início ----------

async function init() {
    const auth = await requireUser({ role: 'client' });
    if (!auth) return;
    state.profile = auth.profile;

    $('[data-boot]').remove();
    $('[data-app]').hidden = false;
    fillUserChip(state.profile);
    const shell = initShell();
    wireEvents(shell);

    $('[data-docs]').innerHTML = loadingRows(5);
    $('[data-recent]').innerHTML = loadingRows(2);

    try {
        await loadData();
        $('[data-error]').innerHTML = '';
        renderHeader();
        renderAll();
    } catch (error) {
        $('[data-docs]').innerHTML = '';
        $('[data-recent]').innerHTML = '';
        $('[data-error]').innerHTML = `
            <div class="alert alert-error" role="alert">${icon('i-alert', '')}
                <div><strong>Não foi possível carregar seus documentos.</strong><br>${esc(friendlyError(error))}
                <br><button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="location.reload()">${icon('i-refresh')}Tentar novamente</button></div>
            </div>`;
    }
}

init();

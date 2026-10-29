// Download e pré-visualização de documentos com links temporários do Storage.
// O link só é gerado se as regras do Storage permitirem que este usuário leia o arquivo.
import { supabase } from './supabase.js';
import { STORAGE_BUCKET } from '../config.js';
import { $, esc, icon, fileKind, formatBytes, friendlyError, toast, wireDialog } from './ui.js';

const DOWNLOAD_TTL = 60;      // segundos
const PREVIEW_TTL = 300;

export function canPreview(doc) {
    const { type } = fileKind(doc.mime_type, doc.file_name);
    return type === 'pdf' || type === 'img';
}

async function signedUrl(doc, { download = false, expires = DOWNLOAD_TTL } = {}) {
    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(doc.storage_path, expires, download ? { download: doc.file_name } : undefined);
    if (error) throw error;
    return data.signedUrl;
}

export async function downloadDocument(doc, button) {
    button?.classList.add('is-loading');
    try {
        const url = await signedUrl(doc, { download: true });
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.file_name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast(`Download de "${doc.title}" iniciado.`, 'success', 3000);
        return true;
    } catch (error) {
        toast(friendlyError(error), 'error');
        return false;
    } finally {
        button?.classList.remove('is-loading');
    }
}

let previewDialog;

function ensurePreviewDialog() {
    if (previewDialog) return previewDialog;
    previewDialog = document.createElement('dialog');
    previewDialog.className = 'modal modal-lg';
    previewDialog.setAttribute('aria-label', 'Visualizar documento');
    previewDialog.innerHTML = `
        <div class="preview">
            <button type="button" class="modal-close" data-close aria-label="Fechar">${icon('i-x')}</button>
            <div class="preview-head">
                <span data-preview-badge></span>
                <div><strong data-preview-title></strong><small data-preview-meta></small></div>
                <button type="button" class="btn btn-dark btn-sm" data-preview-download>${icon('i-download')}<span class="btn-label">Baixar</span></button>
            </div>
            <div class="preview-body" data-preview-body></div>
        </div>`;
    document.body.appendChild(previewDialog);
    wireDialog(previewDialog);
    previewDialog.addEventListener('close', () => { $('[data-preview-body]', previewDialog).innerHTML = ''; });
    return previewDialog;
}

export async function previewDocument(doc, button) {
    if (!canPreview(doc)) return downloadDocument(doc, button);
    button?.classList.add('is-loading');
    try {
        const url = await signedUrl(doc, { expires: PREVIEW_TTL });
        const dialog = ensurePreviewDialog();
        const kind = fileKind(doc.mime_type, doc.file_name);
        $('[data-preview-badge]', dialog).innerHTML = `<span class="file-badge ${kind.cls}">${esc(kind.label)}</span>`;
        $('[data-preview-title]', dialog).textContent = doc.title;
        $('[data-preview-meta]', dialog).textContent = `${doc.file_name} · ${formatBytes(doc.size_bytes)}`;
        $('[data-preview-body]', dialog).innerHTML = kind.type === 'pdf'
            ? `<iframe src="${esc(url)}" title="${esc(doc.title)}"></iframe>`
            : `<img src="${esc(url)}" alt="${esc(doc.title)}">`;
        $('[data-preview-download]', dialog).onclick = (event) => downloadDocument(doc, event.currentTarget);
        dialog.showModal();
        return true;
    } catch (error) {
        toast(friendlyError(error), 'error');
        return false;
    } finally {
        button?.classList.remove('is-loading');
    }
}

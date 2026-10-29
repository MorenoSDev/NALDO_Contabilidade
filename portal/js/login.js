// Tela de login e de recuperação de senha
import { supabase, isConfigured } from './supabase.js';
import { getProfile } from './session.js';
import { SITE_URL } from '../config.js';
import { $, $$, icon, esc, setBusy, friendlyError, wirePasswordToggles } from './ui.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function showView(name) {
    $$('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== name; });
    const view = $(`[data-view="${name}"]`);
    $('[data-message]', view).innerHTML = '';
    $('input', view)?.focus();
}

function message(view, type, text) {
    const target = $(`[data-view="${view}"] [data-message]`);
    const name = { error: 'i-alert', success: 'i-check-circle', info: 'i-info', warning: 'i-alert' }[type];
    target.innerHTML = `<div class="alert alert-${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(name, '')}<span>${esc(text)}</span></div>`;
}

function destinationFor(profile) {
    const next = new URLSearchParams(location.search).get('next');
    const allowed = profile.role === 'admin' ? ['admin.html'] : ['index.html'];
    if (next && allowed.includes(next)) return next;
    return profile.role === 'admin' ? 'admin.html' : 'index.html';
}

async function init() {
    wirePasswordToggles();
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.go)));

    if (!isConfigured) {
        message('login', 'warning', 'O portal ainda está sendo configurado pelo escritório. Tente novamente mais tarde.');
        $$('form button[type="submit"]').forEach((b) => { b.disabled = true; });
        return;
    }

    const params = new URLSearchParams(location.search);
    if (params.get('erro') === 'inativo') message('login', 'error', 'Seu acesso está desativado. Fale com o escritório.');
    if (params.get('erro') === 'perfil') message('login', 'error', 'Não encontramos o seu cadastro. Fale com o escritório.');
    if (params.get('saiu')) message('login', 'success', 'Você saiu da sua conta com segurança.');
    if (params.get('senha') === 'ok') message('login', 'success', 'Senha definida! Entre com seu e-mail e a nova senha.');

    // Já está logado? Vai direto para o painel
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        try {
            const profile = await getProfile(session.user.id);
            if (profile.active) {
                location.replace(destinationFor(profile));
                return;
            }
        } catch { /* segue para o login */ }
        await supabase.auth.signOut();
    }

    $('[data-login-form]').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const email = form.email.value.trim().toLowerCase();
        const password = form.password.value;

        if (!EMAIL_RE.test(email) || !password) {
            message('login', 'error', 'Informe e-mail e senha.');
            (EMAIL_RE.test(email) ? form.password : form.email).focus();
            return;
        }

        const button = $('button[type="submit"]', form);
        setBusy(button, true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            const profile = await getProfile(data.user.id).catch(async () => {
                await supabase.auth.signOut();
                throw new Error('Não encontramos o seu cadastro. Fale com o escritório.');
            });
            if (!profile.active) {
                await supabase.auth.signOut();
                throw new Error('banned');
            }
            message('login', 'success', `Olá, ${profile.full_name?.split(' ')[0] || 'tudo certo'}! Abrindo seu painel...`);
            location.replace(destinationFor(profile));
        } catch (error) {
            message('login', 'error', friendlyError(error));
            form.password.value = '';
            form.password.focus();
            setBusy(button, false);
        }
    });

    $('[data-recover-form]').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const email = form.email.value.trim().toLowerCase();
        if (!EMAIL_RE.test(email)) {
            message('recover', 'error', 'Informe um e-mail válido.');
            form.email.focus();
            return;
        }
        const button = $('button[type="submit"]', form);
        setBusy(button, true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${SITE_URL}/portal/definir-senha.html`,
            });
            if (error && !/not found/i.test(error.message)) throw error;
            // Mesma resposta exista ou não o e-mail (não revela quem é cliente)
            message('recover', 'success', 'Se este e-mail estiver cadastrado, você receberá um link em instantes. Confira também a caixa de spam.');
            form.reset();
        } catch (error) {
            message('recover', 'error', friendlyError(error));
        } finally {
            setBusy(button, false);
        }
    });
}

init();

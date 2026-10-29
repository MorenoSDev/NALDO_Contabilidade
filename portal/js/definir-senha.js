// Definição de senha a partir do link de convite ou de recuperação enviado por e-mail.
// O Supabase lê o token do link, cria uma sessão temporária e então trocamos a senha.
import { supabase, isConfigured } from './supabase.js';
import { $, icon, esc, setBusy, friendlyError, wirePasswordToggles } from './ui.js';

function message(type, text) {
    const name = { error: 'i-alert', success: 'i-check-circle', info: 'i-info', warning: 'i-alert' }[type];
    $('[data-message]').innerHTML =
        `<div class="alert alert-${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(name, '')}<span>${esc(text)}</span></div>`;
}

function strength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
}

const LABELS = ['Mínimo de 8 caracteres.', 'Senha fraca.', 'Senha razoável.', 'Senha boa.', 'Senha forte.'];

async function init() {
    wirePasswordToggles();
    const form = $('[data-password-form]');

    if (!isConfigured) {
        $('[data-intro]').textContent = '';
        message('warning', 'O portal ainda está sendo configurado pelo escritório.');
        return;
    }

    // Erros devolvidos pelo Supabase no endereço (ex.: link expirado)
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get('error')) {
        $('[data-intro]').textContent = '';
        message('error', 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".');
        return;
    }

    // Aguarda o Supabase processar o token do link
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        session = await new Promise((resolve) => {
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
                if (s) { subscription.unsubscribe(); resolve(s); }
            });
            setTimeout(() => { subscription.unsubscribe(); resolve(null); }, 4000);
        });
    }

    if (!session) {
        $('[data-intro]').textContent = '';
        message('error', 'Link inválido ou expirado. Peça um novo em "Esqueci minha senha" na tela de login.');
        return;
    }

    // Remove o token do endereço para que não fique no histórico
    history.replaceState(null, '', location.pathname);

    $('[data-intro]').textContent = `Conta: ${session.user.email}`;
    form.hidden = false;
    form.password.focus();

    form.password.addEventListener('input', () => {
        const level = form.password.value ? Math.max(strength(form.password.value), 1) : 0;
        $('[data-strength]').dataset.level = String(level);
        $('[data-strength-label]').textContent = LABELS[level];
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = form.password.value;
        if (password.length < 8) {
            message('error', 'A senha precisa ter pelo menos 8 caracteres.');
            form.password.focus();
            return;
        }
        if (strength(password) < 2) {
            message('error', 'Escolha uma senha mais forte: misture letras maiúsculas, minúsculas, números ou símbolos.');
            form.password.focus();
            return;
        }
        if (password !== form.confirm.value) {
            message('error', 'As senhas não conferem.');
            form.confirm.focus();
            return;
        }

        const button = $('button[type="submit"]', form);
        setBusy(button, true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            // Encerra a sessão do link e pede login com a nova senha
            await supabase.auth.signOut();
            location.replace('login.html?senha=ok');
        } catch (error) {
            message('error', friendlyError(error));
            setBusy(button, false);
        }
    });
}

init();

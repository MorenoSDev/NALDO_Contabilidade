// Sessão do usuário: garante login, perfil ativo e o papel certo para cada página.
// Importante: isto só organiza a navegação. Quem realmente bloqueia o acesso aos
// dados são as regras de segurança (RLS) do banco e do armazenamento.
import { supabase, isConfigured } from './supabase.js';
import { $, icon } from './ui.js';

export function renderNotConfigured(target = document.body) {
    target.innerHTML = `
        <div class="page-loading">
            <div class="alert alert-warning config-alert" role="alert">
                ${icon('i-alert', '')}
                <div>
                    <strong>Portal em configuração.</strong><br>
                    Preencha <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> em <code>portal/config.js</code>
                    seguindo o guia <code>PORTAL.md</code>.
                    <br><br><a href="../index.html">← Voltar ao site</a>
                </div>
            </div>
        </div>`;
}

export async function getProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, active')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data;
}

// Usada nas páginas internas. Retorna { session, profile } ou redireciona.
export async function requireUser({ role }) {
    if (!isConfigured) {
        renderNotConfigured();
        return null;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`);
        return null;
    }

    let profile;
    try {
        profile = await getProfile(session.user.id);
    } catch {
        await supabase.auth.signOut();
        location.replace('login.html?erro=perfil');
        return null;
    }

    if (!profile.active) {
        await supabase.auth.signOut();
        location.replace('login.html?erro=inativo');
        return null;
    }

    if (role === 'admin' && profile.role !== 'admin') {
        location.replace('index.html');
        return null;
    }
    if (role === 'client' && profile.role === 'admin') {
        location.replace('admin.html');
        return null;
    }

    // Se a sessão terminar em outra aba, volta para o login
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') location.replace('login.html');
    });

    return { session, profile };
}

export async function signOut() {
    try {
        await supabase.auth.signOut();
    } finally {
        // Limpa qualquer resto de sessão guardado neste navegador
        Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k));
        location.replace('login.html?saiu=1');
    }
}

export function fillUserChip(profile) {
    const chip = $('[data-user-chip]');
    if (!chip) return;
    const name = profile.full_name || profile.email;
    chip.querySelector('[data-user-name]').textContent = name;
    chip.querySelector('[data-user-email]').textContent = profile.email;
    chip.querySelector('[data-user-initials]').textContent =
        name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

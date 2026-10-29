// Edge Function "admin-users" — operações que exigem a chave secreta (service role):
//   invite      → convida um cliente por e-mail e vincula às empresas
//   set_active  → ativa/desativa o acesso de um usuário (bloqueia também o login)
//
// A chave secreta fica somente no servidor do Supabase; o navegador envia
// apenas o token do administrador logado, que é conferido aqui.
//
// Deploy:  supabase functions deploy admin-users
// Variável obrigatória: SITE_URL (ex.: https://morenosdev.github.io/NALDO_Contabilidade)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sessão não encontrada.' }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Quem está chamando? Precisa ser um administrador ativo.
    const { data: caller, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !caller?.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);

    const { data: callerProfile } = await admin
        .from('profiles').select('id, email, role, active').eq('id', caller.user.id).single();
    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.active) {
        return json({ error: 'Acesso permitido somente a administradores.' }, 403);
    }

    let payload: Record<string, unknown>;
    try {
        payload = await req.json();
    } catch {
        return json({ error: 'Requisição inválida.' }, 400);
    }

    const audit = (action: string, entityId: string, details: Record<string, unknown>) =>
        admin.from('audit_log').insert({
            actor_id: callerProfile.id,
            actor_email: callerProfile.email,
            action,
            entity: 'users',
            entity_id: entityId,
            details,
        });

    try {
        switch (payload.action) {
            case 'invite': {
                const email = String(payload.email ?? '').trim().toLowerCase();
                const fullName = String(payload.full_name ?? '').trim();
                const companyIds = Array.isArray(payload.company_ids) ? payload.company_ids.map(String) : [];

                if (!EMAIL_RE.test(email)) return json({ error: 'Informe um e-mail válido.' }, 400);
                if (fullName.length < 2) return json({ error: 'Informe o nome do cliente.' }, 400);
                if (companyIds.some((id) => !UUID_RE.test(id))) return json({ error: 'Empresa inválida.' }, 400);

                const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
                    data: { full_name: fullName },
                    redirectTo: siteUrl ? `${siteUrl}/portal/definir-senha.html` : undefined,
                });
                if (error) {
                    const exists = /already|registered|exists/i.test(error.message);
                    return json({ error: exists ? 'Já existe um usuário com este e-mail.' : error.message }, 400);
                }

                const userId = invited.user.id;
                await admin.from('profiles').update({ full_name: fullName, role: 'client' }).eq('id', userId);
                if (companyIds.length) {
                    const rows = companyIds.map((company_id) => ({ company_id, user_id: userId }));
                    const { error: linkError } = await admin.from('company_members').insert(rows);
                    if (linkError) return json({ error: 'Usuário convidado, mas não foi possível vincular as empresas.' }, 500);
                }

                await audit('invite', userId, { email, full_name: fullName, company_ids: companyIds });
                return json({ ok: true, user_id: userId });
            }

            case 'set_active': {
                const userId = String(payload.user_id ?? '');
                const active = Boolean(payload.active);
                if (!UUID_RE.test(userId)) return json({ error: 'Usuário inválido.' }, 400);
                if (userId === callerProfile.id) return json({ error: 'Você não pode alterar o próprio acesso.' }, 400);

                const { error: banError } = await admin.auth.admin.updateUserById(userId, {
                    ban_duration: active ? 'none' : '876000h',
                });
                if (banError) return json({ error: banError.message }, 400);

                const { error } = await admin.from('profiles').update({ active }).eq('id', userId);
                if (error) return json({ error: error.message }, 400);

                await audit(active ? 'activate' : 'deactivate', userId, { active });
                return json({ ok: true });
            }

            default:
                return json({ error: 'Ação desconhecida.' }, 400);
        }
    } catch (err) {
        console.error(err);
        return json({ error: 'Erro inesperado no servidor.' }, 500);
    }
});

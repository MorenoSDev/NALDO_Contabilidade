// Testa schema.sql num Postgres embutido (PGlite) que imita o ambiente do Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const schemaPath = process.argv[2] || new URL('../schema.sql', import.meta.url);
const db = new PGlite();

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

let passed = 0;
let failed = 0;
function ok(cond, label) {
    if (cond) { passed++; console.log('  ✓', label); }
    else { failed++; console.log('  ✗ FALHOU:', label); }
}

async function as(userId, fn) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId || ''}', false);`);
    await db.exec(userId ? 'set role authenticated' : 'set role anon');
    try { return await fn(); } finally { await db.exec('reset role'); }
}
async function q(sql, params) {
    return (await db.query(sql, params)).rows;
}
async function fails(sql, params) {
    try { await db.query(sql, params); return null; } catch (e) { return e.message; }
}

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const BOB = '00000000-0000-0000-0000-00000000000b';   // cliente da empresa X
const CARL = '00000000-0000-0000-0000-00000000000c';  // cliente da empresa Y
const DORA = '00000000-0000-0000-0000-00000000000d';  // cliente de X, desativada
const EVE = '00000000-0000-0000-0000-00000000000e';   // usuário sem empresa
const X = '10000000-0000-0000-0000-000000000001';
const Y = '10000000-0000-0000-0000-000000000002';

await db.exec(SUPABASE_STUB);
const schema = readFileSync(schemaPath, 'utf8');
await db.exec(schema);
console.log('schema.sql executado.');
await db.exec(schema);
console.log('schema.sql executado de novo (idempotente).');

// Usuários entram pelo "Auth" → o gatilho cria o perfil
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
   ('${ADMIN}', 'admin@nrj.com', '{"full_name":"Admin"}'),
   ('${BOB}', 'bob@x.com', '{"full_name":"Bob"}'),
   ('${CARL}', 'carl@y.com', '{"full_name":"Carl"}'),
   ('${DORA}', 'dora@x.com', '{"full_name":"Dora"}'),
   ('${EVE}', 'eve@z.com', '{}');
  update public.profiles set role = 'admin' where email = 'admin@nrj.com';
`);

console.log('\nPerfis e gatilho de criação');
ok((await q('select count(*)::int c from public.profiles'))[0].c === 5, 'perfil criado para cada usuário do Auth');
ok((await q(`select role from public.profiles where id = '${BOB}'`))[0].role === 'client', 'novo usuário nasce como cliente');

console.log('\nAdministrador cadastra empresas, vínculos e documentos');
await as(ADMIN, async () => {
    await q(`insert into public.companies (id, name, cnpj) values ('${X}', 'Empresa X', '11222333000181'), ('${Y}', 'Empresa Y', null)`);
    await q(`insert into public.company_members (company_id, user_id) values ('${X}', '${BOB}'), ('${Y}', '${CARL}'), ('${X}', '${DORA}')`);
    const cat = (await q(`select id from public.categories where name = 'Balancete'`))[0].id;
    await q(`insert into public.documents (id, company_id, category_id, title, storage_path, file_name, mime_type, size_bytes)
             values ('20000000-0000-0000-0000-000000000001', '${X}', '${cat}', 'Balancete X', '${X}/d1/balancete.pdf', 'balancete.pdf', 'application/pdf', 1000),
                    ('20000000-0000-0000-0000-000000000002', '${Y}', '${cat}', 'Balancete Y', '${Y}/d2/balancete.pdf', 'balancete.pdf', 'application/pdf', 1000)`);
    await q(`insert into storage.objects (bucket_id, name) values ('documentos', '${X}/d1/balancete.pdf'), ('documentos', '${Y}/d2/balancete.pdf')`);
    ok(true, 'admin inseriu empresas, vínculos, documentos e arquivos');
    ok((await q('select count(*)::int c from public.documents'))[0].c === 2, 'admin vê todos os documentos');
    ok((await q('select count(*)::int c from storage.objects'))[0].c === 2, 'admin vê todos os arquivos');
    ok((await q('select count(*)::int c from public.profiles'))[0].c === 5, 'admin vê todos os perfis');
    ok(Boolean(await fails(`insert into public.documents (company_id, title, storage_path, file_name, mime_type, size_bytes)
        values ('${X}', 'Errado', '${Y}/x/a.pdf', 'a.pdf', 'application/pdf', 10)`)), 'caminho do arquivo precisa estar na pasta da empresa');
    ok(Boolean(await fails(`update public.documents set company_id = '${Y}' where id = '20000000-0000-0000-0000-000000000001'`)), 'documento não pode mudar de empresa');
    ok(Boolean(await fails(`update public.profiles set active = false where id = '${ADMIN}'`)), 'admin não pode se desativar');
    ok(Boolean(await fails(`insert into public.documents (company_id, title, storage_path, file_name, mime_type, size_bytes)
        values ('${X}', 'Grande', '${X}/g/a.pdf', 'a.pdf', 'application/pdf', 99999999)`)), 'limite de 25 MB no metadado');
    await q(`update public.profiles set active = false where id = '${DORA}'`);
    ok(true, 'admin desativou a cliente Dora');
    const up = (await q(`select uploaded_by from public.documents limit 1`))[0].uploaded_by;
    ok(up === ADMIN, 'uploaded_by preenchido automaticamente com o admin');
});

console.log('\nCliente Bob (empresa X)');
await as(BOB, async () => {
    const docs = await q('select title, company_id from public.documents');
    ok(docs.length === 1 && docs[0].company_id === X, 'vê só o documento da própria empresa');
    ok((await q(`select * from public.documents where id = '20000000-0000-0000-0000-000000000002'`)).length === 0, 'pedir o ID de outra empresa não retorna nada');
    ok((await q('select name from public.companies')).map((r) => r.name).join() === 'Empresa X', 'vê só a própria empresa');
    ok((await q('select id from public.profiles')).length === 1, 'vê só o próprio perfil');
    const objs = await q('select name from storage.objects');
    ok(objs.length === 1 && objs[0].name.startsWith(X), 'no Storage, enxerga só o arquivo da própria empresa');
    ok((await q('select * from public.audit_log')).length === 0, 'não lê o registro de auditoria');
    ok(Boolean(await fails(`insert into public.documents (company_id, title, storage_path, file_name, mime_type, size_bytes)
        values ('${X}', 'Hack', '${X}/h/a.pdf', 'a.pdf', 'application/pdf', 10)`)), 'não consegue criar documento');
    ok(Boolean(await fails(`insert into public.company_members (company_id, user_id) values ('${Y}', '${BOB}')`)), 'não consegue se vincular a outra empresa');
    const r1 = await db.query(`update public.profiles set role = 'admin' where id = '${BOB}'`);
    ok(r1.affectedRows === 0, 'não consegue se promover a administrador');
    const r2 = await db.query(`delete from public.documents`);
    ok(r2.affectedRows === 0, 'não consegue excluir documentos');
    ok(Boolean(await fails(`insert into storage.objects (bucket_id, name) values ('documentos', '${X}/novo/a.pdf')`)), 'não consegue enviar arquivo ao Storage');
    const r3 = await db.query(`delete from storage.objects`);
    ok(r3.affectedRows === 0, 'não consegue apagar arquivos do Storage');
    ok(Boolean(await fails(`insert into public.document_views (document_id, user_id) values ('20000000-0000-0000-0000-000000000002', '${BOB}')`)), 'não registra visualização de documento de outra empresa');
    await q(`insert into public.document_views (document_id, user_id) values ('20000000-0000-0000-0000-000000000001', '${BOB}')`);
    ok(true, 'registra a visualização do próprio documento');
    ok(Boolean(await fails(`insert into public.document_views (document_id, user_id) values ('20000000-0000-0000-0000-000000000001', '${CARL}')`)), 'não registra visualização em nome de outra pessoa');
    ok(Boolean(await fails(`insert into public.categories (name) values ('Hack')`)), 'não consegue criar categoria');
});

console.log('\nCliente Carl (empresa Y)');
await as(CARL, async () => {
    const docs = await q('select company_id from public.documents');
    ok(docs.length === 1 && docs[0].company_id === Y, 'vê só o documento da empresa Y');
});

console.log('\nCliente desativada e usuário sem empresa');
await as(DORA, async () => {
    ok((await q('select * from public.documents')).length === 0, 'cliente desativada não vê documentos');
    ok((await q('select * from storage.objects')).length === 0, 'cliente desativada não acessa arquivos');
});
await as(EVE, async () => {
    ok((await q('select * from public.documents')).length === 0, 'usuário sem empresa não vê documentos');
    ok((await q('select * from public.companies')).length === 0, 'usuário sem empresa não vê empresas');
});

console.log('\nEmpresa desativada');
await as(ADMIN, () => q(`update public.companies set active = false where id = '${X}'`));
await as(BOB, async () => {
    ok((await q('select * from public.documents')).length === 0, 'cliente de empresa desativada perde o acesso aos documentos');
});
await as(ADMIN, () => q(`update public.companies set active = true where id = '${X}'`));

console.log('\nVisitante sem login (anon)');
await as(null, async () => {
    ok(Boolean(await fails('select * from public.documents')), 'anon não lê documentos');
    ok(Boolean(await fails('select * from public.profiles')), 'anon não lê perfis');
    ok((await q('select * from storage.objects')).length === 0, 'anon não enxerga arquivos');
});

console.log('\nStorage com RETURNING (como a API do Supabase faz)');
await as(ADMIN, async () => {
    const up = await q(`insert into storage.objects (bucket_id, name) values ('documentos', '${X}/novo-id/arquivo.pdf') returning name`);
    ok(up.length === 1, 'admin envia arquivo antes de existir o registro do documento');
    const del = await q(`delete from storage.objects where name = '${X}/novo-id/arquivo.pdf' returning name`);
    ok(del.length === 1, 'admin apaga arquivo sem registro de documento (limpeza)');
});
await as(BOB, async () => {
    const del = await q(`delete from storage.objects where bucket_id = 'documentos' returning name`);
    ok(del.length === 0, 'cliente continua sem conseguir apagar arquivos');
    const objs = await q(`select name from storage.objects`);
    ok(objs.length === 1 && objs[0].name.startsWith(X), 'cliente segue vendo só o arquivo da própria empresa');
});

console.log('\nAuditoria');
const audit = await q(`select action, entity, actor_email from public.audit_log order by id`);
ok(audit.some((a) => a.entity === 'documents' && a.action === 'insert' && a.actor_email === 'admin@nrj.com'), 'envio de documento registrado com o e-mail do admin');
ok(audit.some((a) => a.entity === 'profiles' && a.action === 'update'), 'alteração de perfil registrada');
ok(audit.some((a) => a.entity === 'companies' && a.action === 'update'), 'alteração de empresa registrada');

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);

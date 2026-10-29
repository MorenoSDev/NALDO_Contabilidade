-- =====================================================================
--  Portal do Cliente — NRJ Contabilidade
--  Banco de dados, regras de acesso (RLS), armazenamento privado e auditoria.
--
--  Como usar: Supabase > SQL Editor > New query > cole este arquivo > Run.
--  O script pode ser executado mais de uma vez (é idempotente).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
    create type public.user_role as enum ('admin', 'client');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

-- Um perfil para cada usuário do Supabase Auth (criado automaticamente)
create table if not exists public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    full_name   text not null default '',
    email       text not null,
    role        public.user_role not null default 'client',
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Empresas atendidas pelo escritório
create table if not exists public.companies (
    id          uuid primary key default gen_random_uuid(),
    name        text not null check (length(btrim(name)) > 0),
    cnpj        text unique check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Quais usuários podem ver os documentos de quais empresas
create table if not exists public.company_members (
    company_id  uuid not null references public.companies (id) on delete cascade,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (company_id, user_id)
);
create index if not exists company_members_user_idx on public.company_members (user_id);

-- Categorias configuráveis pelo escritório
create table if not exists public.categories (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique check (length(btrim(name)) > 0),
    description text,
    sort_order  integer not null default 0,
    active      boolean not null default true,
    created_at  timestamptz not null default now()
);

-- Metadados dos documentos. O arquivo fica no bucket privado "documentos"
-- no caminho  <company_id>/<document_id>/<nome-do-arquivo>
create table if not exists public.documents (
    id              uuid primary key default gen_random_uuid(),
    company_id      uuid not null references public.companies (id) on delete restrict,
    category_id     uuid references public.categories (id) on delete set null,
    title           text not null check (length(btrim(title)) > 0),
    description     text,
    reference_label text,                 -- ex.: "Setembro/2026", "3º trimestre/2026", "Exercício 2025"
    reference_date  date,                 -- primeiro dia do período, usado nos filtros
    storage_path    text not null unique,
    file_name       text not null,
    mime_type       text not null,
    size_bytes      bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
    uploaded_by     uuid references public.profiles (id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint documents_path_matches_company check (storage_path like company_id::text || '/%')
);
create index if not exists documents_company_idx on public.documents (company_id, created_at desc);
create index if not exists documents_category_idx on public.documents (category_id);

-- Marca quais documentos cada usuário já abriu (indicador de "Novo")
create table if not exists public.document_views (
    document_id     uuid not null references public.documents (id) on delete cascade,
    user_id         uuid not null references public.profiles (id) on delete cascade,
    first_viewed_at timestamptz not null default now(),
    primary key (document_id, user_id)
);

-- Registro das operações administrativas
create table if not exists public.audit_log (
    id          bigint generated always as identity primary key,
    actor_id    uuid,
    actor_email text,
    action      text not null,
    entity      text not null,
    entity_id   text,
    details     jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- Funções auxiliares de permissão
-- (security definer: consultam as tabelas sem cair em recursão de RLS)
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and active
    );
$$;

create or replace function public.is_member(target_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1
        from public.company_members m
        join public.profiles p  on p.id = m.user_id
        join public.companies c on c.id = m.company_id
        where m.user_id = auth.uid()
          and m.company_id = target_company
          and p.active
          and c.active
    );
$$;

-- Pode ver o documento? (usado também pela política do Storage)
create or replace function public.can_read_document_path(object_path text)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.documents d
        where d.storage_path = object_path
          and (public.is_admin() or public.is_member(d.company_id))
    );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_member(uuid) from public;
revoke all on function public.can_read_document_path(text) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.can_read_document_path(text) to authenticated;

-- ---------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------

-- Cria o perfil quando um usuário é convidado/cadastrado no Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
    for each row execute function public.touch_updated_at();
drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies
    for each row execute function public.touch_updated_at();
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
    for each row execute function public.touch_updated_at();

-- Proteções no perfil: e-mail e id não mudam pelo app; o administrador
-- não pode remover o próprio acesso de administrador nem se desativar.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    new.id := old.id;
    new.email := old.email;
    if old.id = auth.uid() and (new.role <> old.role or new.active is distinct from old.active) then
        raise exception 'Você não pode alterar o próprio perfil de acesso.';
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
    for each row execute function public.guard_profile_update();

-- O documento não pode trocar de empresa (o arquivo está na pasta da empresa)
create or replace function public.guard_document_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if new.company_id <> old.company_id then
        raise exception 'Um documento não pode ser movido para outra empresa. Exclua e envie novamente.';
    end if;
    new.uploaded_by := coalesce(new.uploaded_by, old.uploaded_by);
    return new;
end;
$$;

drop trigger if exists documents_guard on public.documents;
create trigger documents_guard before update on public.documents
    for each row execute function public.guard_document_update();

create or replace function public.set_uploaded_by()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    new.uploaded_by := auth.uid();
    return new;
end;
$$;

drop trigger if exists documents_uploaded_by on public.documents;
create trigger documents_uploaded_by before insert on public.documents
    for each row execute function public.set_uploaded_by();

-- Auditoria genérica: registra inserções, alterações e exclusões
create or replace function public.audit_changes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
    row_data  jsonb;
    entity_id text;
begin
    row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    entity_id := coalesce(row_data ->> 'id',
                          concat_ws(':', row_data ->> 'company_id', row_data ->> 'user_id'));
    insert into public.audit_log (actor_id, actor_email, action, entity, entity_id, details)
    values (
        auth.uid(),
        (select email from public.profiles where id = auth.uid()),
        lower(tg_op),
        tg_table_name,
        entity_id,
        case
            when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new))
            else row_data
        end
    );
    return null;
end;
$$;

do $$
declare t text;
begin
    foreach t in array array['companies', 'company_members', 'categories', 'documents', 'profiles'] loop
        execute format('drop trigger if exists %I_audit on public.%I', t, t);
        execute format(
            'create trigger %I_audit after insert or update or delete on public.%I
             for each row execute function public.audit_changes()', t, t);
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.companies       enable row level security;
alter table public.company_members enable row level security;
alter table public.categories      enable row level security;
alter table public.documents       enable row level security;
alter table public.document_views  enable row level security;
alter table public.audit_log       enable row level security;

-- Visitantes não autenticados não têm acesso a nada
revoke all on all tables in schema public from anon;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
    using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- companies
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
    using (public.is_admin() or public.is_member(id));
drop policy if exists companies_admin_all on public.companies;
create policy companies_admin_all on public.companies for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- company_members
drop policy if exists members_select on public.company_members;
create policy members_select on public.company_members for select to authenticated
    using (user_id = auth.uid() or public.is_admin());
drop policy if exists members_admin_all on public.company_members;
create policy members_admin_all on public.company_members for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- categories
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated
    using (active or public.is_admin());
drop policy if exists categories_admin_all on public.categories;
create policy categories_admin_all on public.categories for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- documents
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
    using (public.is_admin() or public.is_member(company_id));
drop policy if exists documents_admin_all on public.documents;
create policy documents_admin_all on public.documents for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- document_views: cada usuário registra apenas as próprias visualizações
drop policy if exists views_select on public.document_views;
create policy views_select on public.document_views for select to authenticated
    using (user_id = auth.uid() or public.is_admin());
drop policy if exists views_insert on public.document_views;
create policy views_insert on public.document_views for insert to authenticated
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.documents d
            where d.id = document_id and public.is_member(d.company_id)
        )
    );

-- audit_log: somente leitura para administradores (gravação só pelos gatilhos)
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
    using (public.is_admin());

-- ---------------------------------------------------------------------
-- Armazenamento privado
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'documentos', 'documentos', false, 26214400,
    array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/csv',
        'application/zip',
        'image/png',
        'image/jpeg'
    ]
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Leitura (inclui gerar links temporários de download): só quem pode ver o documento.
-- O administrador lê tudo: o Storage usa RETURNING ao enviar e apagar, o que também
-- passa por esta regra (ex.: o arquivo é enviado antes de o registro existir).
drop policy if exists documentos_read on storage.objects;
create policy documentos_read on storage.objects for select to authenticated
    using (bucket_id = 'documentos' and (public.is_admin() or public.can_read_document_path(name)));

-- Envio, substituição e exclusão: somente administradores
drop policy if exists documentos_admin_insert on storage.objects;
create policy documentos_admin_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'documentos' and public.is_admin());
drop policy if exists documentos_admin_update on storage.objects;
create policy documentos_admin_update on storage.objects for update to authenticated
    using (bucket_id = 'documentos' and public.is_admin())
    with check (bucket_id = 'documentos' and public.is_admin());
drop policy if exists documentos_admin_delete on storage.objects;
create policy documentos_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'documentos' and public.is_admin());

-- ---------------------------------------------------------------------
-- Categorias iniciais (edite ou remova pelo painel administrativo)
-- ---------------------------------------------------------------------
insert into public.categories (name, description, sort_order) values
    ('Balanço patrimonial',         'Balanços patrimoniais do exercício',            10),
    ('Demonstração do resultado',   'DRE mensal, trimestral ou anual',                20),
    ('Balancete',                   'Balancetes contábeis de verificação',            30),
    ('Relatórios contábeis',        'Relatórios e análises contábeis',                40),
    ('Documentos societários',      'Contrato social, alterações e atas',             50),
    ('Outros documentos',           'Demais documentos disponibilizados',             90)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- PRIMEIRO ADMINISTRADOR
-- 1) Crie o usuário em Authentication > Users > Add user (com senha).
-- 2) Rode o comando abaixo trocando o e-mail:
--
--    update public.profiles set role = 'admin', full_name = 'Seu nome'
--    where email = 'seu-email@exemplo.com';
-- ---------------------------------------------------------------------

# Portal do Cliente: guia de configuração

O portal (pasta `portal/`) usa o **Supabase** para login, banco de dados e armazenamento
privado dos arquivos. O site continua estático (GitHub Pages); a segurança fica no Supabase.

> Tempo estimado: 20–30 minutos. Plano gratuito do Supabase é suficiente para começar.

---

## Como a segurança funciona

| Camada | O que protege |
|---|---|
| **Supabase Auth** | Login com e-mail e senha (senhas guardadas com hash pelo Supabase), recuperação de senha por e-mail, limite de tentativas. |
| **RLS no banco** (`supabase/schema.sql`) | Cada consulta é filtrada no servidor: o cliente só recebe documentos das empresas às quais está vinculado. Somente administradores criam, alteram ou excluem. |
| **Storage privado** | O bucket `documentos` não é público. Download e visualização usam **links temporários** (60 s / 5 min) gerados apenas para quem pode ler aquele arquivo. Tipo e tamanho (25 MB) são validados pelo próprio bucket. |
| **Edge Function** `admin-users` | Convidar clientes e ativar/desativar acessos exige a chave secreta, que fica **somente** no servidor do Supabase. A função confere se quem chama é administrador ativo. |
| **Auditoria** | Gatilhos registram em `audit_log` envios, alterações e exclusões, com o e-mail de quem fez. |

Esconder botões no navegador **não** é a proteção: mesmo que alguém altere o JavaScript,
o banco recusa o que a pessoa não tem permissão de ver ou fazer.

As regras foram testadas com 44 cenários (cliente vendo outra empresa, tentando se promover a
admin, enviar/apagar arquivos, cliente desativado, empresa desativada, visitante sem login etc.).
Veja `supabase/tests/`.

---

## Passo 1: Criar o projeto

1. Acesse <https://supabase.com>, crie uma conta e clique em **New project**.
2. Escolha um nome (ex.: `nrj-portal`), uma senha forte para o banco e a região **South America (São Paulo)**.

## Passo 2: Criar as tabelas e regras

1. No projeto, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Confira em **Storage** que existe o bucket `documentos` marcado como **Private**.

O script pode ser executado de novo sem problemas (por exemplo, depois de uma atualização).

## Passo 3: Configurar a autenticação

Em **Authentication → URL Configuration**:

- **Site URL:** `https://morenosdev.github.io/NALDO_Contabilidade`
- **Redirect URLs:** adicione `https://morenosdev.github.io/NALDO_Contabilidade/portal/definir-senha.html`
  (e, para testes locais, `http://localhost:5500/portal/definir-senha.html`)

Em **Authentication → Providers → Email**:

- Deixe **Enable Email provider** ligado.
- Desligue **Allow new users to sign up** (somente o escritório cadastra clientes).

Em **Authentication → Policies / Passwords** (se disponível): exija no mínimo 8 caracteres.

Recomendado para produção: em **Authentication → Emails → SMTP Settings**, configure um SMTP
próprio (ex.: o e-mail do escritório). O SMTP de testes do Supabase tem limite baixo de envios.
Os textos dos e-mails de convite e recuperação podem ser traduzidos em **Email Templates**.

## Passo 4: Publicar a função de convites

Instale o [Supabase CLI](https://supabase.com/docs/guides/cli) e, na pasta do projeto:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase secrets set SITE_URL=https://morenosdev.github.io/NALDO_Contabilidade
supabase functions deploy admin-users
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já ficam disponíveis automaticamente para a função.
Alternativa sem CLI: **Edge Functions → Deploy a new function → Via Editor**, nome `admin-users`,
cole o conteúdo de `supabase/functions/admin-users/index.ts` e crie o secret `SITE_URL` em
**Edge Functions → Secrets**.

## Passo 5: Criar o primeiro administrador

1. **Authentication → Users → Add user → Create new user**: informe e-mail e senha do escritório
   e marque **Auto Confirm User**.
2. No **SQL Editor**, rode (trocando o e-mail e o nome):

```sql
update public.profiles set role = 'admin', full_name = 'Nome do contador'
where email = 'email-do-escritorio@exemplo.com';
```

## Passo 6: Ligar o site ao Supabase

Em **Project Settings → API**, copie **Project URL** e a chave **anon public** e cole em
`portal/config.js`:

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

A chave *anon* é pública por natureza; quem protege os dados são as regras do Passo 2.
**Nunca** coloque a chave `service_role` em nenhum arquivo do site.

Faça commit e push. Em 1–2 minutos o GitHub Pages publica a nova versão.

## Passo 7: Uso no dia a dia

1. Entre em `…/portal/login.html` com o usuário administrador → você cai no **Painel do escritório**.
2. **Empresas → Nova empresa** (nome e CNPJ).
3. **Clientes → Novo cliente**: nome, e-mail e empresas vinculadas. O cliente recebe um e-mail
   para criar a senha.
4. **Enviar documento**: escolha a empresa (obrigatório), categoria, título, período e o arquivo.
   Antes de publicar, o painel mostra para quem o documento ficará visível e pede confirmação.
5. O cliente entra em `…/portal/login.html` e vê somente os documentos das empresas dele.

Para tirar o acesso de alguém: **Clientes → botão de desligar**. A pessoa é bloqueada no login e
perde o acesso aos documentos imediatamente (os arquivos não são apagados).

---

## O que está pronto e o que depende de você

| Item | Situação |
|---|---|
| Telas de login, recuperação e definição de senha | Prontas |
| Painel do cliente (resumo, recentes, categorias, pesquisa, filtros, ordenação, visualização de PDF, download) | Pronto |
| Painel do escritório (clientes, empresas, categorias, envio/substituição/exclusão de documentos, registros) | Pronto |
| Banco, regras de acesso, storage privado e auditoria (`schema.sql`) | Pronto e testado (44 cenários) |
| Função de convites e bloqueio (`admin-users`) | Pronta, **precisa ser publicada** (Passo 4) |
| Projeto Supabase, chaves em `config.js`, primeiro admin | **Depende de você** (Passos 1–6) |
| SMTP próprio para os e-mails | Recomendado antes de usar com clientes |

## Testar as regras de segurança localmente (opcional)

```bash
cd supabase/tests
npm install
npm test
```

O teste roda o `schema.sql` num Postgres embutido (PGlite) que imita o Supabase e verifica,
papel por papel, o que cada usuário consegue ver e fazer.

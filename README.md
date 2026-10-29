# NRJ Contabilidade Consultiva: site e portal do cliente

Site institucional (HTML, CSS e JavaScript puros) com **Área do cliente** para disponibilizar
documentos contábeis com segurança (Supabase).

- Site publicado: <https://morenosdev.github.io/NALDO_Contabilidade/>
- Configuração do portal: veja **[PORTAL.md](PORTAL.md)**

## Como abrir localmente

O site institucional abre com dois cliques em `index.html`. Para o portal (que usa módulos
JavaScript e login), rode um servidor local na pasta do projeto:

```bash
python -m http.server 5500
```

e acesse <http://localhost:5500> (site) ou <http://localhost:5500/portal/login.html> (portal).

## Estrutura

```
index.html                  Página principal
obrigado.html               Confirmação do formulário de contato
politica-de-privacidade.html
assets/
  css/tokens.css            Cores, tipografia, espaçamentos, sombras (variáveis)
  css/base.css              Reset, tipografia base e utilitários
  css/components.css        Botões, cards, formulários, avisos, modais (site e portal)
  css/site.css              Seções do site institucional e responsividade
  css/pages.css             Páginas de obrigado e privacidade
  css/portal.css            Login, painel do cliente e painel do escritório
  js/core.js                Configuração (WhatsApp, StaticForms) e utilitários
  js/header.js              Cabeçalho fixo, menu mobile, link ativo
  js/reveal.js              Animações ao rolar, contadores, linha do "Como funciona"
  js/interactions.js        Brilho nos cards e profundidade na hero
  js/accordion.js           Perguntas frequentes
  js/forms.js               Validação e máscara de telefone
  js/whatsapp.js            Formulário rápido antes do WhatsApp
  js/chatbot.js             Assistente virtual guiado
  img/icons.svg             Ícones do portal
  img/equipe/               Foto do contador
portal/
  login.html                Entrar / recuperar senha
  definir-senha.html        Criar senha (convite) ou redefinir
  index.html                Painel do cliente
  admin.html                Painel do escritório
  config.js                 URL e chave pública do Supabase  ← preencher
  js/                       Módulos do portal
supabase/
  schema.sql                Tabelas, regras de acesso (RLS), storage privado, auditoria
  functions/admin-users/    Edge Function: convidar clientes e bloquear acessos
  tests/                    Testes das regras de acesso (PGlite)
```

## Integrações

| Integração | Uso | Configuração |
|---|---|---|
| WhatsApp (`wa.me`) | Botões, formulário rápido e chatbot | Número em `assets/js/core.js` |
| StaticForms | Aviso por e-mail dos contatos | Chave em `assets/js/core.js` e no formulário de `index.html`. O e-mail de destino é o da conta StaticForms dona da chave. |
| Supabase | Login, banco, arquivos do portal | Siga [PORTAL.md](PORTAL.md) |
| Google Fonts | Fonte Plus Jakarta Sans | — |

## Antes de usar com clientes

- Trocar os **dados ilustrativos** (marcados com a etiqueta amarela e com `DEMO` no código):
  números, depoimentos, CRC e CNPJ.
- Informar o nome e o CRC do contador na seção "Quem somos".
- Colocar os links reais das redes sociais (`TODO` no rodapé).
- Revisar a Política de Privacidade.
- Configurar o Supabase (portal).

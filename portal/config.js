// Configuração do Portal do Cliente.
// Preencha com os dados do seu projeto Supabase (Project Settings > API).
//
// A "anon key" (chave pública) pode ficar no navegador: quem protege os dados
// são as regras de acesso (RLS) definidas em supabase/schema.sql.
// NUNCA coloque aqui a chave "service_role".

export const SUPABASE_URL = '';        // ex.: 'https://abcdefghijkl.supabase.co'
export const SUPABASE_ANON_KEY = '';   // ex.: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

// Endereço público do site (usado nos links de convite e de recuperação de senha)
export const SITE_URL = 'https://morenosdev.github.io/NALDO_Contabilidade';

export const STORAGE_BUCKET = 'documentos';
export const MAX_FILE_MB = 25;

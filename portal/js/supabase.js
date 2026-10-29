// Cliente do Supabase compartilhado pelas páginas do portal.
// A biblioteca vem do CDN definido no "importmap" de cada página.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const isConfigured = /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

export const supabase = isConfigured
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    : null;

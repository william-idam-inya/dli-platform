import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

// The URL and publishable key are public, but service/secret keys must NEVER be used here.
export const supabaseConfigured = Boolean(
  url && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) &&
  publishableKey && publishableKey.startsWith('sb_publishable_') &&
  !publishableKey.includes('REPLACE_ME'),
);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
      },
    })
  : null;

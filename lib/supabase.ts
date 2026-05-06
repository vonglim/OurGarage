import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * Prefer `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`)
 * so dev builds target the same Supabase project as your applied migrations.
 */
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || 'https://sbipcsxlldfjbfdykict.supabase.co';
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  'sb_publishable_v25Ca9T_IILrWDSxxLCYUA_AXiWFCnQ';

let client: SupabaseClient | null = null;
let loggedProjectInDev = false;

/** Resolved API URL (after env fallback). Useful for debugging env mismatch. */
export function getSupabaseProjectUrl(): string {
  return supabaseUrl;
}

/**
 * Lazily creates the Supabase client on first use so `createClient` does not run at module
 * import time (avoids early `window` / environment issues, especially on web/SSR).
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  if (__DEV__ && !loggedProjectInDev) {
    loggedProjectInDev = true;
    const usingEnvUrl = Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim());
    const usingEnvKey = Boolean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim());
    console.log('[supabase] Active project URL:', supabaseUrl);
    console.log('[supabase] Credentials source:', {
      url: usingEnvUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : 'built-in fallback',
      anonKey: usingEnvKey ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY' : 'built-in fallback',
    });
    const k = supabaseKey;
    if (k.length > 16) {
      console.log('[supabase] Anon key fingerprint:', `${k.slice(0, 10)}…${k.slice(-6)} (len ${k.length})`);
    }
  }

  const isWeb = Platform.OS === 'web';
  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      storage: isWeb ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Web: read magic-link / OAuth params from the URL on load.
      detectSessionInUrl: true,
    },
  });
  return client;
}

/**
 * Same client as {@link getSupabase} — supports `import { supabase } from '…/supabase'`
 * without triggering `createClient` until first property access.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, p, r) {
    return Reflect.get(getSupabase() as object, p, r);
  },
});

export function isSupabaseConfigured(): boolean {
  return true;
}

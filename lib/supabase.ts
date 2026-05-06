import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * Project URL must be the Supabase host only (no `/rest/v1/` — the client adds API paths).
 * Reference: https://sbipcsxlldfjbfdykict.supabase.co
 */
const supabaseUrl = 'https://sbipcsxlldfjbfdykict.supabase.co';
const supabaseKey = 'sb_publishable_v25Ca9T_IILrWDSxxLCYUA_AXiWFCnQ';

let client: SupabaseClient | null = null;

/**
 * Lazily creates the Supabase client on first use so `createClient` does not run at module
 * import time (avoids early `window` / environment issues, especially on web/SSR).
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

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

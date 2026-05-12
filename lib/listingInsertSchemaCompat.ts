import type { SupabaseClient } from '@supabase/supabase-js';

declare const __DEV__: boolean;

/** Postgres `undefined_column` — PostgREST often surfaces this on unknown insert keys. */
function isUndefinedColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '42703') return true;
  const m = String(err.message ?? '');
  return /column .+ does not exist/i.test(m) || /Could not find the '.+' column/i.test(m);
}

/** Extract `"column_name"` from common Postgres / PostgREST error messages. */
function parseMissingColumnName(message: string): string | null {
  const m1 = message.match(/column\s+"([^"]+)"\s+of\s+relation/i);
  if (m1?.[1]) return m1[1];
  const m2 = message.match(/Could not find the '([^']+)' column/i);
  if (m2?.[1]) return m2[1];
  return null;
}

/**
 * Inserts into `public.listings`, retrying with a slimmer payload when the DB reports an unknown column.
 * Keeps the wizard pipeline tolerant of production schema drift (no hard dependency on RentOut-era columns).
 */
export async function insertListingWithSchemaCompat(
  supabase: SupabaseClient,
  initialPayload: Record<string, unknown>
): Promise<{
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
  /** Payload that actually succeeded (for logging). */
  succeededPayload: Record<string, unknown> | null;
}> {
  let payload: Record<string, unknown> = { ...initialPayload };
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase.from('listings').insert(payload).select('id, created_at').maybeSingle();

    if (!error) {
      if (__DEV__) {
        console.log('[listing-publish] successful insert payload', JSON.stringify(payload));
      }
      return { data, error: null, succeededPayload: payload };
    }

    const err = error as { code?: string; message?: string; details?: string };
    if (!isUndefinedColumnError(err)) {
      return {
        data: null,
        error: { message: String(err.message ?? 'Could not save listing.'), code: err.code, details: err.details },
        succeededPayload: null,
      };
    }

    const col = parseMissingColumnName(String(err.message ?? ''));
    if (col && Object.prototype.hasOwnProperty.call(payload, col)) {
      const next = { ...payload };
      delete next[col];
      payload = next;
      if (__DEV__) {
        console.log('[listing-publish] schema compat: dropped unknown column, retrying', { column: col, attempt });
      }
      continue;
    }

    // Fallback strip order for messages we could not parse
    const fallbackStrip = ['listing_status', 'replacement_value', 'weekly_price'] as const;
    let stripped = false;
    for (const key of fallbackStrip) {
      if (key in payload) {
        const next = { ...payload };
        delete next[key];
        payload = next;
        stripped = true;
        if (__DEV__) {
          console.log('[listing-publish] schema compat: fallback strip', { key, attempt });
        }
        break;
      }
    }
    if (!stripped) {
      return {
        data: null,
        error: { message: String(err.message ?? 'Unknown column'), code: err.code, details: err.details },
        succeededPayload: null,
      };
    }
  }

  return {
    data: null,
    error: { message: 'Listing insert failed after schema compatibility retries.' },
    succeededPayload: null,
  };
}

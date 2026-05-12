import type { SupabaseClient } from '@supabase/supabase-js';

declare const __DEV__: boolean;

function isUndefinedColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '42703') return true;
  const m = String(err.message ?? '');
  return /column .+ does not exist/i.test(m) || /Could not find the '.+' column/i.test(m);
}

function parseMissingColumnName(message: string): string | null {
  const m1 = message.match(/column\s+"([^"]+)"\s+of\s+relation/i);
  if (m1?.[1]) return m1[1];
  const m2 = message.match(/Could not find the '([^']+)' column/i);
  if (m2?.[1]) return m2[1];
  return null;
}

/**
 * Inserts into `public.rental_requests`, dropping optional columns the live DB does not have yet.
 */
export async function insertRentalRequestWithSchemaCompat(
  supabase: SupabaseClient,
  initialPayload: Record<string, unknown>
): Promise<{
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
  succeededPayload: Record<string, unknown> | null;
}> {
  let payload: Record<string, unknown> = { ...initialPayload };
  const maxAttempts = 12;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase.from('rental_requests').insert(payload).select('id').maybeSingle();

    if (!error) {
      if (__DEV__) {
        console.log('[listing-rental-intent] successful insert payload', JSON.stringify(payload));
      }
      return { data, error: null, succeededPayload: payload };
    }

    const err = error as { code?: string; message?: string; details?: string };
    if (!isUndefinedColumnError(err)) {
      return {
        data: null,
        error: { message: String(err.message ?? 'Could not save rental request.'), code: err.code, details: err.details },
        succeededPayload: null,
      };
    }

    const col = parseMissingColumnName(String(err.message ?? ''));
    if (col && Object.prototype.hasOwnProperty.call(payload, col)) {
      const next = { ...payload };
      delete next[col];
      payload = next;
      if (__DEV__) {
        console.log('[listing-rental-intent] schema compat: dropped column, retry', { column: col, attempt });
      }
      continue;
    }

    const fallbackStrip = [
      'renter_message',
      'handoff_preference',
      'requested_end_date',
      'requested_start_date',
      'listing_snapshot',
    ] as const;
    let stripped = false;
    for (const key of fallbackStrip) {
      if (key in payload) {
        const next = { ...payload };
        delete next[key];
        payload = next;
        stripped = true;
        if (__DEV__) {
          console.log('[listing-rental-intent] schema compat: fallback strip', { key, attempt });
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
    error: { message: 'Rental request insert failed after schema compatibility retries.' },
    succeededPayload: null,
  };
}

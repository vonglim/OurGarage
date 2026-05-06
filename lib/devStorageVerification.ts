import { getSupabase } from '@/lib/supabase';
import { BUCKET } from '@/lib/rentalVerification';

/**
 * Dev-only: list storage buckets and probe `rental_verification_photos` so local env matches Supabase.
 * Call once at app startup (see RootLayout).
 */
export async function logRentalEvidenceStorageHealthInDev(): Promise<void> {
  if (!__DEV__) return;

  const supabase = getSupabase();

  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.warn('[storage] listBuckets failed — check anon key / network:', listErr.message);
    return;
  }

  const names = buckets?.map((b) => b.name) ?? [];
  if (names.includes(BUCKET)) {
    console.log(`[storage] ${BUCKET} bucket found`);
  } else {
    console.warn(
      `[storage] ${BUCKET} bucket missing — buckets in project:`,
      names.length ? names.join(', ') : '(none listed)'
    );
  }

  const { error: tableErr } = await supabase.from('rental_verification_photos').select('id').limit(1);
  if (tableErr) {
    if (/relation|does not exist|schema cache/i.test(tableErr.message)) {
      console.warn(
        '[storage] rental_verification_photos missing — apply supabase/migrations/028_rental_verification_evidence.sql to this project'
      );
    } else {
      console.warn('[storage] rental_verification_photos probe:', tableErr.message, tableErr.code ?? '');
    }
  } else {
    console.log('[storage] rental_verification_photos table exists');
  }
}

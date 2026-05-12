import type { BuiltListingRow } from '@/components/listingFlow/listingCalculations';
import { insertListingWithSchemaCompat } from '@/lib/listingInsertSchemaCompat';
import { sanitizeListingImagesForPersistence } from '@/lib/listingImageUrls';
import { getSupabase } from '@/lib/supabase';

export type InsertPublishedListingResult =
  | { ok: true; id: string; createdAtMs: number }
  | { ok: false; message: string };

/**
 * Persists a listing from the Listing Wizard to Supabase (`public.listings`).
 * Canonical insert keys only (no RentOut-only financial columns unless the live table exposes them —
 * unknown columns are dropped via {@link insertListingWithSchemaCompat}).
 *
 * Expected production shape (minimal): `user_id`, `title`, `description`, `images`, `daily_price`,
 * `weekly_price`, `replacement_value`, `listing_status` (optional). `id`, `created_at`, `updated_at` are DB-managed.
 */
export async function insertPublishedListingFromBuiltRow(
  built: BuiltListingRow,
  ownerUserId: string
): Promise<InsertPublishedListingResult> {
  const uid = ownerUserId.trim();
  if (!uid) {
    return { ok: false, message: 'Sign in to publish a listing.' };
  }

  const supabase = getSupabase();
  const daily = built.price;
  const weekly = Number.isFinite(daily) ? Math.round(daily * 7 * 100) / 100 : null;
  const rv = built.meta.marketValue;
  const images = sanitizeListingImagesForPersistence(built.images);
  if (images.length === 0) {
    return {
      ok: false,
      message: 'Photos must finish uploading to the server before publishing (no valid image URLs).',
    };
  }

  const initialPayload: Record<string, unknown> = {
    user_id: uid,
    title: built.name,
    description: built.description,
    images,
    daily_price: daily,
    weekly_price: weekly,
    replacement_value: rv != null && rv >= 0 ? rv : null,
    listing_status: 'active',
  };

  const { data, error } = await insertListingWithSchemaCompat(supabase, initialPayload);

  if (error) {
    return { ok: false, message: error.message || 'Could not save listing.' };
  }

  const row = data as { id?: string; created_at?: string } | null;
  const id = row?.id?.trim();
  if (!id) {
    return {
      ok: false,
      message:
        'Listing may have been saved but could not be confirmed. Check your connection and RLS policies for listings select after insert.',
    };
  }

  const createdMs = row?.created_at != null ? Date.parse(String(row.created_at)) : NaN;
  return { ok: true, id, createdAtMs: Number.isFinite(createdMs) ? createdMs : Date.now() };
}

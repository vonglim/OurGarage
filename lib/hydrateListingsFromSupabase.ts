import { normalizeListingImages } from '@/lib/normalizeListingImages';
import { getSupabase } from '@/lib/supabase';
import { useListingsStore, type ToolListing } from '@/store/listingsStore';

declare const __DEV__: boolean;

/** Maps a Supabase `listings` row to `ToolListing` (browse / store shape). */
function mapListingRow(item: Record<string, unknown>): ToolListing {
  const createdRaw = item.created_at;
  const createdMs = createdRaw != null ? Date.parse(String(createdRaw)) : NaN;
  const daily = Number(item.daily_price);
  const week = Number(item.weekly_price);
  const replacementValue = Number(item.replacement_value);
  const dailyLateFee = Number((item as { daily_late_fee?: unknown }).daily_late_fee);
  const maxLateFeeCap = Number(item.max_late_fee_cap);
  const uidRaw = item.user_id;
  const ownerUserId = typeof uidRaw === 'string' && uidRaw.trim() !== '' ? uidRaw.trim() : undefined;
  const stRaw = item.listing_status;
  const listingStatus =
    typeof stRaw === 'string' && stRaw.trim() !== '' ? stRaw.trim() : 'active';

  return {
    id: String(item.id ?? ''),
    name: String(item.title ?? ''),
    price: Number.isFinite(daily) ? daily : 0,
    priceUnit: 'day',
    distance: 0,
    description: String(item.description ?? ''),
    ownerName: '',
    rating: 0,
    createdAt: Number.isFinite(createdMs) ? createdMs : 0,
    ...(Number.isFinite(week) ? { weeklyPrice: week } : {}),
    ...(Number.isFinite(replacementValue) ? { replacementValue } : {}),
    ...(Number.isFinite(dailyLateFee) ? { dailyLateFee } : {}),
    ...(Number.isFinite(maxLateFeeCap) ? { maxLateFeeCap } : {}),
    images: normalizeListingImages(item.images),
    ...(ownerUserId ? { ownerUserId } : {}),
    listingStatus,
  };
}

/**
 * Fetches `public.listings` from Supabase and replaces `useListingsStore` listings (canonical server truth).
 * Select clauses try lean production first (`daily_late_fee` / `max_late_fee_cap` optional), then fall back for older DBs.
 */
export async function hydrateListingsFromSupabase(): Promise<{ ok: boolean; count: number }> {
  const supabase = getSupabase();

  const selectVariants: string[] = [
    'id, title, description, daily_price, weekly_price, images, replacement_value, created_at, user_id, listing_status',
    'id, title, description, daily_price, weekly_price, images, replacement_value, created_at, user_id',
    'id, title, description, daily_price, weekly_price, images, replacement_value, created_at',
    'id, title, description, daily_price, weekly_price, images, created_at',
    'id, title, description, daily_price, weekly_price, images, replacement_value, daily_late_fee, max_late_fee_cap, created_at, user_id, listing_status',
    'id, title, description, daily_price, weekly_price, images, replacement_value, daily_late_fee, max_late_fee_cap, created_at, user_id',
    'id, title, description, daily_price, weekly_price, images, replacement_value, daily_late_fee, max_late_fee_cap, created_at',
    'id, title, description, daily_price, weekly_price, images, replacement_value, daily_late_fee, created_at',
    'id, title, description, daily_price, weekly_price, images, replacement_value, max_late_fee_cap, created_at',
  ];

  let data: Array<Record<string, unknown>> | null = null;
  let error: { code?: string | null; message?: string } | null = null;

  for (const selectClause of selectVariants) {
    const res = await supabase.from('listings').select(selectClause).order('created_at', { ascending: false });
    if (!res.error) {
      data = (res.data as unknown as Array<Record<string, unknown>> | null) ?? null;
      error = null;
      break;
    }
    error = res.error as { code?: string | null; message?: string };
    if (res.error.code !== '42703') break;
  }

  if (error) {
    if (__DEV__) {
      console.log('[listings hydrate] query failed — store not updated', {
        code: error.code,
        message: error.message,
      });
    }
    return { ok: false, count: 0 };
  }

  const mapped = (data || []).map((item) => mapListingRow(item));

  if (__DEV__) {
    console.log('[listings hydrate]', {
      rawRows: (data || []).length,
      mappedRows: mapped.length,
      idsSample: mapped.slice(0, 5).map((m) => m.id),
    });
  }

  useListingsStore.getState().setListings(mapped);
  return { ok: true, count: mapped.length };
}

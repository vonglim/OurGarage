import { getSupabase } from '@/lib/supabase';

export type ApprovedListingRentalRow = {
  id: string;
  listing_id: string;
  renter_user_id: string;
  owner_user_id: string | null;
  duration_type: string;
  price: number;
  status: string;
  created_at: string;
  listings:
    | {
        title?: string | null;
        /** Listing creator / owner (`listings.user_id` in DB — not `owner_user_id`). */
        user_id?: string | null;
      }
    | null;
};

/** Owner id from denormalized `rental_requests.owner_user_id`, else embedded listing `user_id`. */
export function listingOwnerUserId(row: ApprovedListingRentalRow): string | null {
  const denorm = row.owner_user_id?.trim();
  if (denorm) return denorm;
  const L = row.listings;
  if (!L || typeof L !== 'object') return null;
  const fromListing = L.user_id;
  return typeof fromListing === 'string' && fromListing.trim() !== ''
    ? fromListing.trim()
    : null;
}

export function listingTitle(row: {
  listing_id: string;
  listings?: { title?: string | null } | null;
}): string {
  const t = row.listings?.title;
  const name = typeof t === 'string' ? t.trim() : '';
  return name || row.listing_id;
}

/**
 * Approved listing rental_requests involving the user as renter or owner (matches server-side OR filter when possible).
 */
export async function fetchApprovedRentalRequestsForUser(
  userId: string
): Promise<ApprovedListingRentalRow[]> {
  const uid = userId.trim();
  if (!uid) return [];

  const supabase = getSupabase();
  const select =
    'id, listing_id, renter_user_id, owner_user_id, duration_type, price, status, created_at, listings ( title, user_id )';

  const { data: asRenter, error: e1 } = await supabase
    .from('rental_requests')
    .select(select)
    .eq('status', 'approved')
    .eq('renter_user_id', uid)
    .order('created_at', { ascending: false });

  if (e1) {
    console.warn('[rental_requests] fetch approved (renter)', e1.message);
  }

  const { data: asOwnerColumn, error: e2 } = await supabase
    .from('rental_requests')
    .select(select)
    .eq('status', 'approved')
    .eq('owner_user_id', uid)
    .order('created_at', { ascending: false });

  if (e2) {
    console.warn('[rental_requests] fetch approved (owner column)', e2.message);
  }

  const byId = new Map<string, ApprovedListingRentalRow>();
  for (const row of [...(asRenter ?? []), ...(asOwnerColumn ?? [])] as ApprovedListingRentalRow[]) {
    byId.set(row.id, row);
  }

  const { data: ownedListings, error: el } = await supabase.from('listings').select('id').eq('user_id', uid);
  if (el) {
    console.warn('[rental_requests] fetch owned listing ids', el.message);
  }
  const listingIds = (ownedListings ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id: string) => typeof id === 'string' && id.length > 0);

  const chunkSize = 40;
  for (let i = 0; i < listingIds.length; i += chunkSize) {
    const chunk = listingIds.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const { data: byListing, error: e3 } = await supabase
      .from('rental_requests')
      .select(select)
      .eq('status', 'approved')
      .in('listing_id', chunk);
    if (e3) {
      console.warn('[rental_requests] fetch approved by listing_id', e3.message);
      continue;
    }
    for (const row of (byListing ?? []) as ApprovedListingRentalRow[]) {
      byId.set(row.id, row);
    }
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

import { getSupabase } from '@/lib/supabase';

export type PendingListingRentalRow = {
  id: string;
  listing_id: string;
  renter_user_id: string;
  owner_user_id: string | null;
  duration_type: string;
  price: number;
  status: string;
  created_at: string;
  listings: { title?: string | null } | null;
};

export async function fetchPendingRentalRequestsForOwner(
  ownerUserId: string
): Promise<PendingListingRentalRow[]> {
  const uid = ownerUserId.trim();
  if (!uid) return [];

  const supabase = getSupabase();
  const select =
    'id, listing_id, renter_user_id, owner_user_id, duration_type, price, status, created_at, listings ( title )';

  const { data: byOwnerColumn, error } = await supabase
    .from('rental_requests')
    .select(select)
    .eq('status', 'pending')
    .eq('owner_user_id', uid)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[rental_requests] fetch pending for owner', error.message);
  }

  const byId = new Map<string, PendingListingRentalRow>();
  for (const row of (byOwnerColumn ?? []) as PendingListingRentalRow[]) {
    byId.set(row.id, row);
  }

  const { data: ownedListings, error: el } = await supabase.from('listings').select('id').eq('user_id', uid);
  if (el) {
    console.warn('[rental_requests] fetch owned listing ids (pending)', el.message);
  }
  const listingIds = (ownedListings ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id: string) => typeof id === 'string' && id.length > 0);

  const chunkSize = 40;
  for (let i = 0; i < listingIds.length; i += chunkSize) {
    const chunk = listingIds.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const { data: byListing, error: e2 } = await supabase
      .from('rental_requests')
      .select(select)
      .eq('status', 'pending')
      .in('listing_id', chunk)
      .order('created_at', { ascending: false });
    if (e2) {
      console.warn('[rental_requests] fetch pending by listing_id', e2.message);
      continue;
    }
    for (const row of (byListing ?? []) as PendingListingRentalRow[]) {
      byId.set(row.id, row);
    }
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

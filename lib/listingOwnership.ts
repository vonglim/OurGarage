import { getSupabase } from '@/lib/supabase';
import type { ToolListing } from '@/store/listingsStore';

/** When browse rows omit `ownerUserId`, resolve from Supabase for listing-linked flows. */
export async function fetchListingOwnerUserId(listingId: string): Promise<string | null> {
  const id = listingId.trim();
  if (!id) return null;
  const sb = getSupabase();
  const { data, error } = await sb.from('listings').select('user_id').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const u = (data as { user_id?: unknown }).user_id;
  return typeof u === 'string' && u.trim() !== '' ? u.trim() : null;
}

/** True when `viewerUserId` is the listing owner (`ownerUserId` from Supabase `user_id`). */
export function isToolListingOwner(listing: ToolListing | undefined, viewerUserId: string | undefined): boolean {
  const uid = viewerUserId?.trim() ?? '';
  const owner = listing?.ownerUserId?.trim() ?? '';
  return Boolean(uid && owner && owner === uid);
}

/** Visible on public browse “tools” feed: active for everyone; paused/draft only for owner; archived hidden. */
export function isToolListingVisibleOnBrowseFeed(listing: ToolListing, viewerUserId: string | undefined): boolean {
  const st = (listing.listingStatus ?? 'active').toLowerCase();
  if (st === 'archived') return false;
  if (st === 'paused' || st === 'draft') return isToolListingOwner(listing, viewerUserId);
  return true;
}

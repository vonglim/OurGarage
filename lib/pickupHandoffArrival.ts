import type { SupabaseClient } from '@supabase/supabase-js';

/** Persist renter meetup arrival on rentals (authoritative for owner realtime). */
export async function markRenterPickupArrived(
  client: SupabaseClient,
  rentalId: string,
  at = new Date().toISOString()
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client
    .from('rentals')
    .update({ renter_arrived_at: at })
    .eq('id', rentalId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Persist owner meetup arrival on rentals. */
export async function markOwnerPickupArrived(
  client: SupabaseClient,
  rentalId: string,
  at = new Date().toISOString()
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client
    .from('rentals')
    .update({ owner_arrived_at: at })
    .eq('id', rentalId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type RenterWizardHandoffProgress = {
  renterPickupImHereAt: string | null;
  renterApprovedPickupPhotosAt: string | null;
};

/** Renter wizard timestamps used for owner workspace presence (until rentals row is synced). */
export async function fetchRenterWizardHandoffProgress(
  client: SupabaseClient,
  rentalId: string,
  renterUserId: string
): Promise<RenterWizardHandoffProgress> {
  const empty: RenterWizardHandoffProgress = {
    renterPickupImHereAt: null,
    renterApprovedPickupPhotosAt: null,
  };
  const { data, error } = await client
    .from('rental_wizard_state')
    .select('wizard_progress')
    .eq('rental_id', rentalId)
    .eq('user_id', renterUserId)
    .maybeSingle();
  if (error || !data?.wizard_progress) return empty;
  const wp = data.wizard_progress as {
    renter_pickup_im_here_at?: string | null;
    renter_approved_pickup_photos_at?: string | null;
  };
  const imHere = wp.renter_pickup_im_here_at?.trim();
  const approved = wp.renter_approved_pickup_photos_at?.trim();
  return {
    renterPickupImHereAt: imHere || null,
    renterApprovedPickupPhotosAt: approved || null,
  };
}

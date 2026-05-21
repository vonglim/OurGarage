import type { SupabaseClient } from '@supabase/supabase-js';

import { updateWizardProgress } from '@/lib/rentalWizard/rentalWizardSeenState';
import {
  deriveDualConfirmation,
  ensureVerificationRows,
  fetchVerificationRows,
  persistConfirmation,
} from '@/lib/rentalVerification';

export type PersistPickupMilestoneResult =
  | { ok: true; at: string; pickupAck: { owner: boolean; renter: boolean } }
  | { ok: false; error: string };

/** Record bilateral physical possession — does NOT legally activate the rental. */
export async function finalizePickupPhysicalPossession(
  client: SupabaseClient,
  rentalId: string,
  pickupAck: { owner: boolean; renter: boolean },
  at = new Date().toISOString()
): Promise<void> {
  if (!pickupAck.owner || !pickupAck.renter) return;
  await client
    .from('rentals')
    .update({
      physical_possession_confirmed_at: at,
      possession_transferred_at: at,
    })
    .eq('id', rentalId);
}

/** Legal rental activation after agreement + preauth + signature. */
export async function finalizeRentalActivation(
  client: SupabaseClient,
  rentalId: string,
  at = new Date().toISOString()
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client
    .from('rentals')
    .update({
      status: 'handed_off',
      rental_activated_at: at,
      pickup_handoff_completed_at: at,
    })
    .eq('id', rentalId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** @deprecated Use {@link finalizePickupPhysicalPossession} + {@link finalizeRentalActivation}. */
export async function finalizePickupPossessionTransfer(
  client: SupabaseClient,
  rentalId: string,
  pickupAck: { owner: boolean; renter: boolean },
  at = new Date().toISOString()
): Promise<void> {
  await finalizePickupPhysicalPossession(client, rentalId, pickupAck, at);
}

/** Renter confirms physical receipt at meetup. */
export async function persistRenterConfirmedPickupReceipt(
  client: SupabaseClient,
  rentalId: string,
  ownerUserId: string,
  renterUserId: string,
  at = new Date().toISOString()
): Promise<PersistPickupMilestoneResult> {
  await ensureVerificationRows(client, rentalId, ownerUserId, renterUserId, 'pickup');
  const confirmed = await persistConfirmation(client, rentalId, 'pickup', renterUserId, true);
  if (!confirmed) return { ok: false, error: 'Could not save pickup confirmation.' };

  await updateWizardProgress(rentalId, renterUserId, {
    renter_confirmed_pickup_receipt_at: at,
  });

  const { error } = await client
    .from('rentals')
    .update({ renter_confirmed_receipt_at: at })
    .eq('id', rentalId);
  if (error) return { ok: false, error: error.message };

  const rows = await fetchVerificationRows(client, rentalId);
  const pickupAck = deriveDualConfirmation(rows, 'pickup');
  await finalizePickupPhysicalPossession(client, rentalId, pickupAck, at);
  return { ok: true, at, pickupAck };
}

/** Owner confirms physical handoff at meetup. */
export async function persistOwnerConfirmedPickupHandoff(
  client: SupabaseClient,
  rentalId: string,
  ownerUserId: string,
  renterUserId: string,
  at = new Date().toISOString()
): Promise<PersistPickupMilestoneResult> {
  await ensureVerificationRows(client, rentalId, ownerUserId, renterUserId, 'pickup');
  const confirmed = await persistConfirmation(client, rentalId, 'pickup', ownerUserId, true);
  if (!confirmed) return { ok: false, error: 'Could not save pickup confirmation.' };

  const { error } = await client
    .from('rentals')
    .update({ owner_confirmed_handoff_at: at })
    .eq('id', rentalId);
  if (error) return { ok: false, error: error.message };

  const rows = await fetchVerificationRows(client, rentalId);
  const pickupAck = deriveDualConfirmation(rows, 'pickup');
  await finalizePickupPhysicalPossession(client, rentalId, pickupAck, at);
  return { ok: true, at, pickupAck };
}

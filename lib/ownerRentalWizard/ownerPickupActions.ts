import type { SupabaseClient } from '@supabase/supabase-js';

import { markOwnerPickupArrived } from '@/lib/pickupHandoffArrival';
import { persistOwnerConfirmedPickupHandoff } from '@/lib/pickupHandoffMilestones';
import { calculatePreauthAmount } from '@/lib/rentalProtection';
import type { RentalWizardRentalRow } from '@/lib/rentalWizard/types';

export async function confirmOwnerItemReady(
  client: SupabaseClient,
  rental: RentalWizardRentalRow,
  input: {
    ownerPickupPrepComplete: boolean;
    finalPrice: number;
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!input.ownerPickupPrepComplete) {
    return { ok: false, error: 'Finish pickup photos and checklist before confirming ready.' };
  }
  const row = rental as RentalWizardRentalRow & {
    replacement_value?: number | null;
    daily_late_fee?: number | null;
    max_late_fee_cap?: number | null;
    grace_period_hours?: number | null;
  };
  const holdReplacementValue =
    typeof row.replacement_value === 'number'
      ? row.replacement_value
      : Math.max(input.finalPrice * 3, 150);
  const holdPreauthAmount = calculatePreauthAmount(holdReplacementValue);
  const holdLateFee = row.daily_late_fee ?? Math.max(10, Math.round(input.finalPrice * 0.1));
  const holdMaxLateFeeCap = row.max_late_fee_cap ?? Math.max(holdLateFee, holdLateFee * 7);

  const { error } = await client
    .from('rentals')
    .update({
      owner_pickup_ready: true,
      handoff_approved_by_owner: true,
      handoff_approval_started_at: new Date().toISOString(),
      replacement_value: holdReplacementValue,
      preauth_amount: holdPreauthAmount,
      preauth_status: 'pending',
      daily_late_fee: holdLateFee,
      max_late_fee_cap: holdMaxLateFeeCap,
      grace_period_hours: row.grace_period_hours ?? 2,
    })
    .eq('id', rental.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markOwnerAtMeetup(
  client: SupabaseClient,
  rentalId: string
): Promise<{ ok: boolean; error?: string }> {
  return markOwnerPickupArrived(client, rentalId);
}

export async function confirmOwnerHandoff(
  client: SupabaseClient,
  rental: RentalWizardRentalRow
): Promise<{ ok: boolean; error?: string; pickupAck?: { owner: boolean; renter: boolean } }> {
  const result = await persistOwnerConfirmedPickupHandoff(
    client,
    rental.id,
    rental.owner_user_id,
    rental.renter_user_id
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, pickupAck: result.pickupAck };
}

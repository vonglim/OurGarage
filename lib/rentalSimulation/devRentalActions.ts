import { assertDevToolsEnabled } from '@/lib/devTools/gates';
import {
  devForceCancellationAccepted,
  devForceCancellationDeclined,
  devForceCancellationRequested,
  devForceRentalCancelled,
  resetRentalCancellationState,
} from '@/lib/rentalCancellation/rentalCancellationActions';
import { getEffectiveNowIso } from '@/lib/rentalSimulation/simulationClock';
import { acceptRentalMeetupProposal } from '@/lib/rentalMeetupProposalLifecycle';
import {
  ensureVerificationRows,
  persistConfirmation,
  insertVerificationPhotoRow,
} from '@/lib/rentalVerification';
import {
  fetchRentalWizardState,
  updateWizardProgress,
} from '@/lib/rentalWizard/rentalWizardSeenState';
import type { RentalWizardRentalRow } from '@/lib/rentalWizard/types';
import { getSupabase } from '@/lib/supabase';
import { useRentalSimulationStore } from '@/store/rentalSimulationStore';

export type DevRentalActionResult = { ok: boolean; message?: string };

function shouldWriteDb(): boolean {
  return useRentalSimulationStore.getState().writeToDatabase;
}

async function loadRental(rentalId: string): Promise<RentalWizardRentalRow | null> {
  const { data, error } = await getSupabase().from('rentals').select('*').eq('id', rentalId).maybeSingle();
  if (error || !data) return null;
  return data as RentalWizardRentalRow;
}

async function afterMutation(rentalId: string): Promise<void> {
  const reg = useRentalSimulationStore.getState().registered;
  if (reg?.rentalId === rentalId && reg.refresh) {
    await reg.refresh();
  }
}

export async function devResetWizardStateOnly(
  rentalId: string,
  userId: string
): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devResetWizardStateOnly');
  useRentalSimulationStore.getState().clearSimulation();
  if (!shouldWriteDb()) return { ok: true, message: 'Local wizard simulation cleared' };

  const supabase = getSupabase();
  await supabase
    .from('rental_wizard_state')
    .update({
      seen_transition_keys: [],
      wizard_progress: {},
      last_seen_step: null,
      updated_at: getEffectiveNowIso(),
    })
    .eq('rental_id', rentalId)
    .eq('user_id', userId);
  await afterMutation(rentalId);
  return { ok: true, message: 'Wizard state reset (transitions + drafts)' };
}

export async function devResetOperationalStateOnly(rentalId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devResetOperationalStateOnly');
  if (!shouldWriteDb()) return { ok: true, message: 'Enable DB write for operational reset' };

  const supabase = getSupabase();
  await supabase
    .from('rentals')
    .update({
      pickup_operational_state: null,
      return_operational_state: null,
      handoff_approval_started_at: null,
      handoff_approved_by_owner: false,
      handoff_approved_by_renter: false,
      last_proposed_by: null,
    })
    .eq('id', rentalId);
  await afterMutation(rentalId);
  return { ok: true, message: 'Operational flags reset on rental row' };
}

export async function devResetRentalSimulation(rentalId: string, userId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devResetRentalSimulation');
  useRentalSimulationStore.getState().clearSimulation();
  if (!shouldWriteDb()) return { ok: true, message: 'Local simulation cleared' };

  const supabase = getSupabase();
  await supabase.from('rental_wizard_state').delete().eq('rental_id', rentalId).eq('user_id', userId);
  await supabase
    .from('rentals')
    .update({
      pickup_operational_state: null,
      return_operational_state: null,
      handoff_approval_started_at: null,
      handoff_approved_by_owner: false,
      handoff_approved_by_renter: false,
    })
    .eq('id', rentalId);
  await afterMutation(rentalId);
  return { ok: true, message: 'Wizard + operational flags reset' };
}

export async function devSimulatePickupScheduleConfirmed(
  rentalId: string,
  actorUserId: string
): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devSimulatePickupScheduleConfirmed');
  const now = getEffectiveNowIso();
  const pickup = new Date(useRentalSimulationStore.getState().getNowMs() + 2 * 60 * 60 * 1000).toISOString();
  const ret = new Date(useRentalSimulationStore.getState().getNowMs() + 3 * 24 * 60 * 60 * 1000).toISOString();

  if (shouldWriteDb()) {
    const rental = await loadRental(rentalId);
    if (!rental) return { ok: false, message: 'Rental not found' };
    const supabase = getSupabase();
    await supabase
      .from('rentals')
      .update({
        agreement_status: 'confirmed',
        confirmed_by_owner: true,
        confirmed_by_renter: true,
        owner_confirmed: true,
        renter_confirmed: true,
        agreed_pickup_datetime: pickup,
        agreed_return_datetime: ret,
        meetup_time: pickup,
        pickup_datetime: pickup,
        return_time: ret,
        return_datetime: ret,
        last_proposed_by: null,
        confirmed_at: now,
      })
      .eq('id', rentalId);
    await afterMutation(rentalId);
  }

  useRentalSimulationStore.getState().applySimulationJump('pickup_confirmed');
  return { ok: true, message: 'Pickup schedule simulated' };
}

export async function devSimulateOwnerPickupPhotos(
  rentalId: string
): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devSimulateOwnerPickupPhotos');
  const rental = await loadRental(rentalId);
  if (!rental) return { ok: false, message: 'Rental not found' };

  if (shouldWriteDb()) {
    const supabase = getSupabase();
    await ensureVerificationRows(supabase, rentalId, rental.owner_user_id, rental.renter_user_id, 'pickup');
    const placeholder = 'https://placehold.co/400x300/png?text=DEV+Pickup';
    for (const cat of ['item', 'serial', 'timestamp_proof']) {
      await insertVerificationPhotoRow(supabase, {
        rental_id: rentalId,
        phase: 'pickup',
        uploaded_by: rental.owner_user_id,
        role: 'owner',
        storage_path: `dev/${rentalId}/pickup/${cat}.jpg`,
        pickup_photo_category: cat,
        public_url: placeholder,
      });
    }
    await afterMutation(rentalId);
  }

  useRentalSimulationStore.getState().applySimulationJump('waiting_for_photos');
  return { ok: true, message: 'Owner pickup photos simulated' };
}

export async function devSimulateRenterApprovePhotos(rentalId: string, userId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devSimulateRenterApprovePhotos');
  const at = getEffectiveNowIso();
  if (shouldWriteDb()) {
    await updateWizardProgress(rentalId, userId, { renter_approved_pickup_photos_at: at });
    await afterMutation(rentalId);
  }
  useRentalSimulationStore.getState().patchLocalWizardProgress({ renter_approved_pickup_photos_at: at });
  useRentalSimulationStore.getState().applySimulationJump('meetup_day');
  return { ok: true, message: 'Renter approved photos' };
}

export async function devSimulateImHerePickup(rentalId: string, userId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devSimulateImHerePickup');
  const at = getEffectiveNowIso();
  if (shouldWriteDb()) {
    await updateWizardProgress(rentalId, userId, { renter_pickup_im_here_at: at });
    const supabase = getSupabase();
    await supabase
      .from('rentals')
      .update({
        handoff_approval_started_at: at,
        handoff_approved_by_owner: false,
        handoff_approved_by_renter: false,
      })
      .eq('id', rentalId);
    await afterMutation(rentalId);
  }
  useRentalSimulationStore.getState().patchLocalWizardProgress({ renter_pickup_im_here_at: at });
  return { ok: true, message: "Renter tapped I'm here (pickup)" };
}

export async function devSimulateOwnerConfirmArrival(rentalId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devSimulateOwnerConfirmArrival');
  if (shouldWriteDb()) {
    const supabase = getSupabase();
    await supabase
      .from('rentals')
      .update({
        handoff_approved_by_owner: true,
        handoff_approved_by_renter: false,
      })
      .eq('id', rentalId);
    await afterMutation(rentalId);
  }
  return { ok: true, message: 'Owner confirmed arrival' };
}

export async function devSimulateSignAgreement(rentalId: string, renterUserId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devSimulateSignAgreement');
  const at = getEffectiveNowIso();
  if (shouldWriteDb()) {
    const supabase = getSupabase();
    await supabase
      .from('rentals')
      .update({
        signed_at: at,
        signed_name: 'Dev Tester',
        handoff_approved_by_renter: true,
      })
      .eq('id', rentalId);
    const rental = await loadRental(rentalId);
    if (rental) {
      await persistConfirmation(supabase, rentalId, 'pickup', renterUserId, true);
    }
    await afterMutation(rentalId);
  }
  return { ok: true, message: 'Agreement signed (dev)' };
}

export async function devSimulateActivateRental(rentalId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devSimulateActivateRental');
  if (shouldWriteDb()) {
    const supabase = getSupabase();
    await supabase.from('rentals').update({ status: 'active' }).eq('id', rentalId);
    await afterMutation(rentalId);
  }
  useRentalSimulationStore.getState().applySimulationJump('active_rental');
  return { ok: true, message: 'Rental active' };
}

export async function devSimulateReturnFlow(rentalId: string, userId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devSimulateReturnFlow');
  if (shouldWriteDb()) {
    const supabase = getSupabase();
    await supabase.from('rentals').update({ status: 'return_pending' }).eq('id', rentalId);
    await updateWizardProgress(rentalId, userId, {
      renter_return_im_here_at: getEffectiveNowIso(),
    });
    await afterMutation(rentalId);
  }
  useRentalSimulationStore.getState().applySimulationJump('return_meetup');
  return { ok: true, message: 'Return meetup simulated' };
}

export async function devSimulateCompleteReturn(rentalId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devSimulateCompleteReturn');
  const rental = await loadRental(rentalId);
  if (!rental) return { ok: false, message: 'Rental not found' };

  if (shouldWriteDb()) {
    const supabase = getSupabase();
    await ensureVerificationRows(supabase, rentalId, rental.owner_user_id, rental.renter_user_id, 'return');
    await persistConfirmation(supabase, rentalId, 'pickup', rental.owner_user_id, true);
    await persistConfirmation(supabase, rentalId, 'pickup', rental.renter_user_id, true);
    await persistConfirmation(supabase, rentalId, 'return', rental.owner_user_id, true);
    await persistConfirmation(supabase, rentalId, 'return', rental.renter_user_id, true);
    await supabase.from('rentals').update({ status: 'returned' }).eq('id', rentalId);
    await afterMutation(rentalId);
  }
  useRentalSimulationStore.getState().applySimulationJump('review_stage');
  return { ok: true, message: 'Return complete' };
}

export async function devAutofillRenterJourney(rentalId: string, userId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devAutofillRenterJourney');
  const steps: Array<() => Promise<DevRentalActionResult>> = [
    () => devSimulatePickupScheduleConfirmed(rentalId, userId),
    () => devSimulateOwnerPickupPhotos(rentalId),
    () => devSimulateRenterApprovePhotos(rentalId, userId),
    () => devSimulateImHerePickup(rentalId, userId),
    () => devSimulateOwnerConfirmArrival(rentalId),
    () => devSimulateSignAgreement(rentalId, userId),
    () => devSimulateActivateRental(rentalId),
    () => devSimulateReturnFlow(rentalId, userId),
    () => devSimulateCompleteReturn(rentalId),
  ];
  for (const step of steps) {
    const res = await step();
    if (!res.ok) return res;
  }
  return { ok: true, message: 'Autofill renter journey complete' };
}

export async function devApproveMeetupProposal(rentalId: string, userId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devApproveMeetupProposal');
  const rental = await loadRental(rentalId);
  if (!rental) return { ok: false, message: 'Rental not found' };
  if (!shouldWriteDb()) {
    useRentalSimulationStore.getState().applySimulationJump('pickup_confirmed');
    return { ok: true, message: 'Local: meetup approved' };
  }
  const res = await acceptRentalMeetupProposal(getSupabase(), rental, userId);
  if (res.ok) await afterMutation(rentalId);
  return res;
}

export async function devClearWizardTransitions(rentalId: string, userId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devClearWizardTransitions');
  if (shouldWriteDb()) {
    const supabase = getSupabase();
    const current = await fetchRentalWizardState(supabase, rentalId, userId);
    await supabase.from('rental_wizard_state').upsert(
      {
        rental_id: rentalId,
        user_id: userId,
        seen_transition_keys: [],
        wizard_progress: {},
        last_seen_step: current.lastSeenStep,
        updated_at: getEffectiveNowIso(),
      },
      { onConflict: 'rental_id,user_id' }
    );
    await afterMutation(rentalId);
  }
  useRentalSimulationStore.getState().patchLocalWizardProgress({});
  return { ok: true, message: 'Wizard transitions cleared' };
}

export async function devForceCancelledRental(
  rentalId: string,
  actorUserId: string
): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devForceCancelledRental');
  if (!shouldWriteDb()) {
    return { ok: true, message: 'Enable “Write simulation to Supabase” to force cancel' };
  }
  const res = await devForceRentalCancelled(getSupabase(), rentalId, actorUserId);
  if (res.ok) await afterMutation(rentalId);
  return res.ok ? { ok: true, message: 'Rental forced to cancelled' } : res;
}

export async function devResetCancellationState(rentalId: string): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devResetCancellationState');
  if (!shouldWriteDb()) {
    return { ok: true, message: 'Enable “Write simulation to Supabase” to reset cancellation' };
  }
  const res = await resetRentalCancellationState(getSupabase(), rentalId);
  if (res.ok) await afterMutation(rentalId);
  return res.ok ? { ok: true, message: 'Cancellation state reset' } : res;
}

export async function devForceCancellationRequestedRental(
  rentalId: string,
  actorUserId: string
): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devForceCancellationRequestedRental');
  if (!shouldWriteDb()) {
    return { ok: true, message: 'Enable “Write simulation to Supabase” for cancellation DEV states' };
  }
  const res = await devForceCancellationRequested(getSupabase(), rentalId, actorUserId);
  if (res.ok) await afterMutation(rentalId);
  return res.ok ? { ok: true, message: 'Cancellation requested (DEV)' } : res;
}

export async function devForceCancellationAcceptedRental(
  rentalId: string,
  actorUserId: string
): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devForceCancellationAcceptedRental');
  if (!shouldWriteDb()) {
    return { ok: true, message: 'Enable “Write simulation to Supabase” for cancellation DEV states' };
  }
  const res = await devForceCancellationAccepted(getSupabase(), rentalId, actorUserId);
  if (res.ok) await afterMutation(rentalId);
  return res.ok ? { ok: true, message: 'Cancellation accepted (DEV)' } : res;
}

export async function devForceCancellationDeclinedRental(
  rentalId: string,
  actorUserId: string
): Promise<DevRentalActionResult> {
  assertDevToolsEnabled('devForceCancellationDeclinedRental');
  if (!shouldWriteDb()) {
    return { ok: true, message: 'Enable “Write simulation to Supabase” for cancellation DEV states' };
  }
  const res = await devForceCancellationDeclined(getSupabase(), rentalId, actorUserId);
  if (res.ok) await afterMutation(rentalId);
  return res.ok ? { ok: true, message: 'Cancellation declined (DEV)' } : res;
}

/** DEV: show pickup-accepted lifecycle overlay in wizard (no realtime). */
export function devSimulatePickupAcceptedOverlay(): DevRentalActionResult {
  assertDevToolsEnabled('devSimulatePickupAcceptedOverlay');
  const reg = useRentalSimulationStore.getState().registered;
  if (!reg?.simulatePickupAcceptedOverlay) {
    return {
      ok: false,
      message: 'Open rental wizard first (coordinate pickup screen preferred)',
    };
  }
  reg.simulatePickupAcceptedOverlay();
  return { ok: true, message: 'Pickup accepted overlay shown' };
}

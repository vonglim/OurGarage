import type { SupabaseClient } from '@supabase/supabase-js';

import { getProfileNameForUserId, prefetchProfileNamesForUserIds } from '@/lib/profileDisplayName';
import {
  insertServerNotificationToRecipientAsync,
  type ServerNotificationType,
} from '@/lib/insertServerNotification';
import { mergeRecentNotificationsFromServer } from '@/lib/notificationsServerSync';
import { insertRentalCancellationSystemMessage } from '@/lib/rentalCancellation/rentalCancellationChat';
import { purgeTransientRentalStateOnCancellationAccepted } from '@/lib/rentalCancellation/rentalCancellationCleanup';
import { logRentalCancellation } from '@/lib/rentalCancellation/rentalCancellationDebug';
import { evaluateCancellationRequestEligibility } from '@/lib/rentalCancellation/rentalCancellationGates';
import {
  isCancellationRequested,
  isRentalCancelled,
  normalizeCancellationStatus,
} from '@/lib/rentalCancellation/rentalCancellationState';
import type { RentalCancellationReasonKey } from '@/lib/rentalCancellation/types';
import { RENTAL_CANCELLATION_REASONS } from '@/lib/rentalCancellation/types';
import { isUuidString } from '@/lib/requestOwnership';
import type { RentalWizardRentalRow } from '@/lib/rentalWizard/types';

export type RentalCancellationActionResult =
  | { ok: true }
  | { ok: false; message: string };

function reasonLabel(key: RentalCancellationReasonKey): string {
  return RENTAL_CANCELLATION_REASONS.find((r) => r.key === key)?.label ?? key;
}

async function fetchRentalRow(
  supabase: SupabaseClient,
  rentalId: string
): Promise<RentalWizardRentalRow | null> {
  const { data, error } = await supabase.from('rentals').select('*').eq('id', rentalId).maybeSingle();
  if (error || !data) return null;
  return data as RentalWizardRentalRow;
}

async function notifyCancellation(
  rental: RentalWizardRentalRow,
  actorId: string,
  recipientId: string,
  type: ServerNotificationType,
  title: string,
  body: string
): Promise<boolean> {
  if (!recipientId || recipientId === actorId) return false;
  await prefetchProfileNamesForUserIds([actorId, recipientId]);
  const offerId =
    rental.offer_id != null && isUuidString(String(rental.offer_id))
      ? String(rental.offer_id)
      : null;
  const requestId =
    rental.request_id != null && isUuidString(String(rental.request_id))
      ? String(rental.request_id)
      : null;
  return insertServerNotificationToRecipientAsync({
    actorId,
    recipientUserId: recipientId,
    type,
    title,
    body,
    offerId,
    requestId,
    rentalId: rental.id,
  });
}

export async function requestRentalCancellation(
  supabase: SupabaseClient,
  rentalId: string,
  requesterUserId: string,
  reason: RentalCancellationReasonKey,
  options?: { rentalTitle?: string | null }
): Promise<RentalCancellationActionResult> {
  const rental = await fetchRentalRow(supabase, rentalId);
  if (!rental) return { ok: false, message: 'Rental not found.' };

  const eligibility = evaluateCancellationRequestEligibility(rental, {
    viewerUserId: requesterUserId,
  });
  if (!eligibility.allowed) {
    return { ok: false, message: eligibility.message };
  }

  const isOwner = rental.owner_user_id === requesterUserId;
  const isRenter = rental.renter_user_id === requesterUserId;
  if (!isOwner && !isRenter) {
    return { ok: false, message: 'You are not a party on this rental.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('rentals')
    .update({
      cancellation_status: 'requested',
      cancellation_requested_by: requesterUserId,
      cancellation_requested_at: now,
      cancellation_reason: reason,
      cancellation_resolved_at: null,
      cancellation_resolved_by: null,
    })
    .eq('id', rentalId);

  if (error) {
    logRentalCancellation('request failed', { rentalId, error: error.message });
    return { ok: false, message: error.message || 'Could not send cancellation request.' };
  }

  const recipientId = isOwner ? rental.renter_user_id : rental.owner_user_id;
  const actorName = getProfileNameForUserId(requesterUserId);
  const titleLabel = options?.rentalTitle?.trim() || 'this rental';
  const notified = await notifyCancellation(
    rental,
    requesterUserId,
    recipientId,
    'rental_cancellation_requested',
    'Cancellation requested',
    `${actorName} requested to cancel ${titleLabel}. Review and respond in the rental — it stays active until you accept or decline.`
  );
  if (!notified && __DEV__) {
    logRentalCancellation('request notification skipped or failed', { rentalId, recipientId });
  }
  mergeRecentNotificationsFromServer();
  await insertRentalCancellationSystemMessage(supabase, rental, requesterUserId, 'requested');

  logRentalCancellation('request created', {
    rentalId,
    requesterUserId,
    reason,
  });

  return { ok: true };
}

export async function acceptRentalCancellation(
  supabase: SupabaseClient,
  rentalId: string,
  responderUserId: string,
  options?: { rentalTitle?: string | null }
): Promise<RentalCancellationActionResult> {
  const rental = await fetchRentalRow(supabase, rentalId);
  if (!rental) return { ok: false, message: 'Rental not found.' };

  if (!isCancellationRequested(rental)) {
    return { ok: false, message: 'No pending cancellation request.' };
  }

  const requester = String(rental.cancellation_requested_by ?? '').trim();
  if (!requester || requester === responderUserId) {
    return { ok: false, message: 'You cannot accept your own cancellation request.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('rentals')
    .update({
      cancellation_status: 'cancelled',
      status: 'cancelled',
      cancellation_resolved_at: now,
      cancellation_resolved_by: responderUserId,
      last_proposed_by: null,
      agreement_status: 'confirmed',
    })
    .eq('id', rentalId);

  if (error) {
    return { ok: false, message: error.message || 'Could not accept cancellation.' };
  }

  await purgeTransientRentalStateOnCancellationAccepted(supabase, rentalId);

  const fresh = (await fetchRentalRow(supabase, rentalId)) ?? rental;
  const titleSuffix = options?.rentalTitle?.trim() ? ` for ${options.rentalTitle.trim()}` : '';
  const notified = await notifyCancellation(
    fresh,
    responderUserId,
    requester,
    'rental_cancellation_accepted',
    'Cancellation approved',
    `Your cancellation request was approved${titleSuffix}. The rental is now cancelled.`
  );
  if (!notified && __DEV__) {
    logRentalCancellation('accept notification skipped or failed', { rentalId, requester });
  }
  mergeRecentNotificationsFromServer();
  await insertRentalCancellationSystemMessage(supabase, fresh, responderUserId, 'accepted');

  logRentalCancellation('request accepted', { rentalId, responderUserId, requester });

  return { ok: true };
}

export async function declineRentalCancellation(
  supabase: SupabaseClient,
  rentalId: string,
  responderUserId: string,
  options?: { rentalTitle?: string | null }
): Promise<RentalCancellationActionResult> {
  const rental = await fetchRentalRow(supabase, rentalId);
  if (!rental) return { ok: false, message: 'Rental not found.' };

  if (!isCancellationRequested(rental)) {
    return { ok: false, message: 'No pending cancellation request.' };
  }

  const requester = String(rental.cancellation_requested_by ?? '').trim();
  if (!requester || requester === responderUserId) {
    return { ok: false, message: 'You cannot decline your own cancellation request.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('rentals')
    .update({
      cancellation_status: 'declined',
      cancellation_resolved_at: now,
      cancellation_resolved_by: responderUserId,
    })
    .eq('id', rentalId);

  if (error) {
    return { ok: false, message: error.message || 'Could not decline cancellation.' };
  }

  const titleSuffix = options?.rentalTitle?.trim() ? ` for ${options.rentalTitle.trim()}` : '';
  const notified = await notifyCancellation(
    rental,
    responderUserId,
    requester,
    'rental_cancellation_declined',
    'Cancellation declined',
    `Your cancellation request was declined${titleSuffix}. You can keep coordinating or message to discuss next steps.`
  );
  if (!notified && __DEV__) {
    logRentalCancellation('decline notification skipped or failed', { rentalId, requester });
  }
  mergeRecentNotificationsFromServer();
  await insertRentalCancellationSystemMessage(supabase, rental, responderUserId, 'declined');

  logRentalCancellation('request declined', { rentalId, responderUserId, requester });

  return { ok: true };
}

/** DEV / audit: reset cancellation workflow without deleting rental. */
export async function resetRentalCancellationState(
  supabase: SupabaseClient,
  rentalId: string
): Promise<RentalCancellationActionResult> {
  const rental = await fetchRentalRow(supabase, rentalId);
  if (!rental) return { ok: false, message: 'Rental not found.' };

  const wasCancelled = isRentalCancelled(rental);
  const patch: Record<string, unknown> = {
    cancellation_status: 'none',
    cancellation_requested_by: null,
    cancellation_requested_at: null,
    cancellation_reason: null,
    cancellation_resolved_at: null,
    cancellation_resolved_by: null,
  };
  if (wasCancelled) {
    patch.status = 'pending';
  }

  const { error } = await supabase.from('rentals').update(patch).eq('id', rentalId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function devForceRentalCancelled(
  supabase: SupabaseClient,
  rentalId: string,
  actorUserId: string
): Promise<RentalCancellationActionResult> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('rentals')
    .update({
      cancellation_status: 'cancelled',
      cancellation_requested_by: actorUserId,
      cancellation_requested_at: now,
      cancellation_reason: 'other',
      cancellation_resolved_at: now,
      cancellation_resolved_by: actorUserId,
      status: 'cancelled',
    })
    .eq('id', rentalId);
  if (error) return { ok: false, message: error.message };
  await purgeTransientRentalStateOnCancellationAccepted(supabase, rentalId);
  logRentalCancellation('dev force cancelled', { rentalId, actorUserId });
  return { ok: true };
}

export async function devForceCancellationRequested(
  supabase: SupabaseClient,
  rentalId: string,
  actorUserId: string
): Promise<RentalCancellationActionResult> {
  const rental = await fetchRentalRow(supabase, rentalId);
  if (!rental) return { ok: false, message: 'Rental not found.' };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('rentals')
    .update({
      cancellation_status: 'requested',
      cancellation_requested_by: actorUserId,
      cancellation_requested_at: now,
      cancellation_reason: 'other',
      cancellation_resolved_at: null,
      cancellation_resolved_by: null,
    })
    .eq('id', rentalId);
  if (error) return { ok: false, message: error.message };
  const recipientId =
    rental.owner_user_id === actorUserId ? rental.renter_user_id : rental.owner_user_id;
  await notifyCancellation(
    rental,
    actorUserId,
    recipientId,
    'rental_cancellation_requested',
    'Cancellation requested',
    `${getProfileNameForUserId(actorUserId)} requested to cancel this rental. Review and respond in the rental.`
  );
  mergeRecentNotificationsFromServer();
  await insertRentalCancellationSystemMessage(supabase, rental, actorUserId, 'requested');
  logRentalCancellation('dev force requested', { rentalId, actorUserId });
  return { ok: true };
}

export async function devForceCancellationAccepted(
  supabase: SupabaseClient,
  rentalId: string,
  actorUserId: string
): Promise<RentalCancellationActionResult> {
  const rental = await fetchRentalRow(supabase, rentalId);
  if (!rental) return { ok: false, message: 'Rental not found.' };
  if (!isCancellationRequested(rental)) {
    await devForceCancellationRequested(supabase, rentalId, rental.renter_user_id);
  }
  return acceptRentalCancellation(supabase, rentalId, actorUserId);
}

export async function devForceCancellationDeclined(
  supabase: SupabaseClient,
  rentalId: string,
  actorUserId: string
): Promise<RentalCancellationActionResult> {
  const rental = await fetchRentalRow(supabase, rentalId);
  if (!rental) return { ok: false, message: 'Rental not found.' };
  if (!isCancellationRequested(rental)) {
    await devForceCancellationRequested(supabase, rentalId, rental.renter_user_id);
  }
  return declineRentalCancellation(supabase, rentalId, actorUserId);
}

export function describeCancellationBlockReason(row: RentalWizardRentalRow): string | null {
  if (isRentalCancelled(row)) return 'rental is cancelled';
  if (normalizeCancellationStatus(row.cancellation_status) === 'requested') {
    return 'cancellation request pending';
  }
  return null;
}

import { insertMeetupProposalOfferMessage } from '@/lib/meetupProposalThreadEvent';
import { extendBookedAvailabilityEndForOffer } from '@/lib/listingAvailability';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { resolveRentalReturnIso } from '@/lib/rentalExtensionProposal';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import { logRentalRowAfterAccept } from '@/lib/rentalWizard/pickupCoordinationDiagnostics';
import {
  resolveProposedMeetupLocation,
  resolveProposedPickupIso,
  resolveProposedReturnIso,
} from '@/lib/rentalWizard/proposedMeetupSchedule';
import { clearWizardCoordinateDraftsForRental } from '@/lib/rentalWizard/rentalWizardSeenState';
import { isUuidString } from '@/lib/requestOwnership';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RentalMeetupRow = {
  id: string;
  request_id?: string | null;
  offer_id?: string | null;
  listing_id?: string | null;
  owner_user_id: string;
  renter_user_id: string;
  meetup_time?: string | null;
  pickup_datetime?: string | null;
  return_time?: string | null;
  return_datetime?: string | null;
  meetup_location?: string | null;
  return_location?: string | null;
  agreed_pickup_datetime?: string | null;
  agreed_return_datetime?: string | null;
  agreement_status?: string | null;
  last_proposed_by?: string | null;
  status?: string | null;
};

function hasCol(row: RentalMeetupRow, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, k);
}

function notifyMeetupProposalAccepted(
  rental: RentalMeetupRow,
  accepterId: string,
  itemTitle?: string | null
): void {
  const recipientId =
    accepterId === rental.owner_user_id
      ? rental.renter_user_id
      : accepterId === rental.renter_user_id
        ? rental.owner_user_id
        : null;
  if (!recipientId || recipientId === accepterId) return;

  const accepterName = getProfileNameForUserId(accepterId);
  const title =
    accepterId === rental.owner_user_id
      ? 'Pickup details confirmed'
      : `${accepterName} accepted your meetup proposal`;
  const body =
    typeof itemTitle === 'string' && itemTitle.trim() !== ''
      ? `${itemTitle.trim()} — open your rental guide to continue.`
      : 'Your meetup proposal was accepted. Open your rental guide to continue.';

  insertServerNotificationToRecipient({
    actorId: accepterId,
    recipientUserId: recipientId,
    type: 'rental_confirmed',
    title,
    body,
    requestId:
      rental.request_id != null && isUuidString(String(rental.request_id))
        ? String(rental.request_id)
        : null,
    offerId:
      rental.offer_id != null && isUuidString(String(rental.offer_id)) ? String(rental.offer_id) : null,
    rentalId: rental.id,
    listingId:
      rental.listing_id != null && isUuidString(String(rental.listing_id))
        ? String(rental.listing_id)
        : null,
  });
}

/** Accept pending meetup/extension — promotes agreed schedule and clears pending proposal state. */
export async function acceptRentalMeetupProposal(
  supabase: SupabaseClient,
  rental: RentalMeetupRow,
  meId: string,
  options?: { itemTitle?: string | null }
): Promise<{ ok: boolean; message?: string }> {
  const { data: freshRow, error: fetchError } = await supabase
    .from('rentals')
    .select('*')
    .eq('id', rental.id)
    .maybeSingle();

  if (fetchError || !freshRow) {
    return { ok: false, message: fetchError?.message ?? 'Could not load rental before accept.' };
  }

  const row = freshRow as RentalMeetupRow;

  if (__DEV__) {
    console.log('[rental-wizard][acceptRentalMeetupProposal] rental row BEFORE accept', {
      rentalId: row.id,
      agreement_status: row.agreement_status ?? null,
      last_proposed_by: row.last_proposed_by ?? null,
      meetup_location: row.meetup_location ?? null,
      agreed_pickup_datetime: row.agreed_pickup_datetime ?? null,
      meetup_time: row.meetup_time ?? null,
      pickup_datetime: row.pickup_datetime ?? null,
      proposedPickupIso: resolveProposedPickupIso(row),
      proposedReturnIso: resolveProposedReturnIso(row),
    });
  }

  const lifecycle = String(row.status ?? '').trim().toLowerCase();
  const isActiveRental = lifecycle === 'handed_off' || lifecycle === 'active' || lifecycle === 'return_pending';
  const proposedPickup = resolveProposedPickupIso(row);
  const proposedReturn = resolveProposedReturnIso(row);
  const agreedReturn = row.agreed_return_datetime?.trim() || null;
  const proposedAfterAgreed =
    proposedReturn &&
    agreedReturn &&
    Number.isFinite(Date.parse(proposedReturn)) &&
    Number.isFinite(Date.parse(agreedReturn)) &&
    Date.parse(proposedReturn) > Date.parse(agreedReturn);

  const location = resolveProposedMeetupLocation(row);

  const patch: Record<string, unknown> = {
    confirmed_by_owner: true,
    confirmed_by_renter: true,
    owner_confirmed: true,
    renter_confirmed: true,
    agreement_status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    last_proposed_by: null,
    latest_proposal_message_id: null,
  };

  if (proposedPickup) {
    patch.agreed_pickup_datetime = proposedPickup;
    patch.pickup_datetime = proposedPickup;
    patch.meetup_time = proposedPickup;
  }
  if (proposedReturn) {
    patch.agreed_return_datetime = proposedReturn;
    patch.return_datetime = proposedReturn;
    patch.return_time = proposedReturn;
  }
  if (location) {
    patch.meetup_location = location;
    patch.return_location = location;
  }

  if (isActiveRental && proposedAfterAgreed && proposedReturn) {
    patch.agreed_return_datetime = proposedReturn;
    const offerId = row.offer_id != null ? String(row.offer_id).trim() : '';
    if (offerId) {
      await extendBookedAvailabilityEndForOffer(offerId, proposedReturn);
    }
  }

  if (__DEV__) {
    console.log('[rental-wizard][acceptRentalMeetupProposal] patch to persist', patch);
  }

  const { error } = await supabase.from('rentals').update(patch).eq('id', row.id);
  if (error) return { ok: false, message: error.message };

  const { data: afterRow } = await supabase.from('rentals').select('*').eq('id', row.id).maybeSingle();
  if (afterRow) {
    logRentalRowAfterAccept(afterRow as RentalMeetupRow);
  }

  await clearWizardCoordinateDraftsForRental(supabase, row.id);
  notifyMeetupProposalAccepted(row, meId, options?.itemTitle);

  return { ok: true };
}

/** Decline pending proposal — restore operational schedule from agreed baseline. */
export async function declineRentalMeetupProposal(
  supabase: SupabaseClient,
  rental: RentalMeetupRow,
  meId: string,
  options?: { itemTitle?: string | null }
): Promise<{ ok: boolean; message?: string }> {
  const agreedPickup = rental.agreed_pickup_datetime?.trim() || resolveProposedPickupIso(rental);
  const agreedReturn = rental.agreed_return_datetime?.trim() || resolveRentalReturnIso(rental);
  const location = (rental.meetup_location || rental.return_location || '').trim();

  const patch: Record<string, unknown> = {
    confirmed_by_owner: true,
    confirmed_by_renter: true,
    owner_confirmed: true,
    renter_confirmed: true,
    agreement_status: 'confirmed',
    confirmed_at: new Date().toISOString(),
  };
  if (hasCol(rental, 'last_proposed_by')) patch.last_proposed_by = null;
  if (hasCol(rental, 'latest_proposal_message_id')) patch.latest_proposal_message_id = null;

  if (agreedPickup) {
    patch.meetup_time = agreedPickup;
    if (hasCol(rental, 'pickup_datetime')) patch.pickup_datetime = agreedPickup;
  }
  if (agreedReturn) {
    patch.return_time = agreedReturn;
    if (hasCol(rental, 'return_datetime')) patch.return_datetime = agreedReturn;
    if (hasCol(rental, 'return_location') && location) patch.return_location = location;
  }
  if (location) patch.meetup_location = location;

  const { error } = await supabase.from('rentals').update(patch).eq('id', rental.id);
  if (error) return { ok: false, message: error.message };

  const offerId = rental.offer_id != null && isUuidString(String(rental.offer_id)) ? String(rental.offer_id) : '';
  const proposerId = String(rental.last_proposed_by ?? '').trim();
  const receiverId = proposerId === rental.owner_user_id ? rental.renter_user_id : rental.owner_user_id;
  if (offerId && proposerId && receiverId && receiverId !== meId) {
    const title = getProfileNameForUserId(meId);
    const body =
      typeof options?.itemTitle === 'string' && options.itemTitle.trim() !== ''
        ? `Extension declined for ${options.itemTitle.trim()} — original return window stays in effect.`
        : 'Extension declined — original return window stays in effect.';
    await supabase.from('offer_messages').insert({
      offer_id: offerId,
      author_id: meId,
      receiver_id: receiverId,
      body,
      price: null,
      kind: 'user_chat',
      ...(rental.request_id && isUuidString(String(rental.request_id))
        ? { request_id: String(rental.request_id) }
        : {}),
      rental_id: rental.id,
    });
    insertServerNotificationToRecipient({
      actorId: meId,
      recipientUserId: receiverId,
      type: 'message',
      title: `${title} declined the extension`,
      body,
      offerId,
      requestId: rental.request_id != null ? String(rental.request_id) : null,
      rentalId: rental.id,
    });
  }

  return { ok: true };
}

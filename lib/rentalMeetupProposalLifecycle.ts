import { insertMeetupProposalOfferMessage } from '@/lib/meetupProposalThreadEvent';
import { extendBookedAvailabilityEndForOffer } from '@/lib/listingAvailability';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { resolveRentalPickupIso, resolveRentalReturnIso } from '@/lib/rentalExtensionProposal';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
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

function scheduleIso(row: RentalMeetupRow, kind: 'pickup' | 'return'): string | null {
  if (kind === 'pickup') return resolveRentalPickupIso(row);
  return resolveRentalReturnIso(row);
}

/** Accept pending meetup/extension — promotes agreed return when rental is active. */
export async function acceptRentalMeetupProposal(
  supabase: SupabaseClient,
  rental: RentalMeetupRow,
  meId: string
): Promise<{ ok: boolean; message?: string }> {
  const lifecycle = String(rental.status ?? '').trim().toLowerCase();
  const isActiveRental = lifecycle === 'handed_off' || lifecycle === 'active' || lifecycle === 'return_pending';
  const proposedReturn = scheduleIso(rental, 'return');
  const agreedReturn = rental.agreed_return_datetime?.trim() || null;
  const proposedAfterAgreed =
    proposedReturn &&
    agreedReturn &&
    Number.isFinite(Date.parse(proposedReturn)) &&
    Number.isFinite(Date.parse(agreedReturn)) &&
    Date.parse(proposedReturn) > Date.parse(agreedReturn);

  const patch: Record<string, unknown> = {
    confirmed_by_owner: true,
    confirmed_by_renter: true,
    owner_confirmed: true,
    renter_confirmed: true,
    agreement_status: 'confirmed',
    confirmed_at: new Date().toISOString(),
  };
  if (hasCol(rental, 'last_proposed_by')) patch.last_proposed_by = null;

  if (isActiveRental && proposedAfterAgreed && proposedReturn) {
    if (hasCol(rental, 'agreed_return_datetime')) patch.agreed_return_datetime = proposedReturn;
    const offerId = rental.offer_id != null ? String(rental.offer_id).trim() : '';
    if (offerId) {
      await extendBookedAvailabilityEndForOffer(offerId, proposedReturn);
    }
  }

  const { error } = await supabase.from('rentals').update(patch).eq('id', rental.id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Decline pending proposal — restore operational schedule from agreed baseline. */
export async function declineRentalMeetupProposal(
  supabase: SupabaseClient,
  rental: RentalMeetupRow,
  meId: string,
  options?: { itemTitle?: string | null }
): Promise<{ ok: boolean; message?: string }> {
  const agreedPickup = rental.agreed_pickup_datetime?.trim() || resolveRentalPickupIso(rental);
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

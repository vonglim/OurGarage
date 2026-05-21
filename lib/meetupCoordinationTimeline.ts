import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { getSupabase } from '@/lib/supabase';
import { isUuidString } from '@/lib/requestOwnership';

/** Immutable coordination journal rows in offer_messages (no accept/decline actions). */
export const OFFER_MEETUP_COORDINATION_KIND = 'meetup_coordination';

export type MeetupCoordinationTimelineEvent =
  | 'pickup_proposed'
  | 'pickup_approved'
  | 'return_proposed'
  | 'return_suggested'
  | 'return_approved'
  | 'extension_requested'
  | 'extension_approved'
  | 'extension_declined'
  | 'meetup_declined';

function formatTimelineInstant(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} at ${timePart}`;
}

export function buildMeetupCoordinationTimelineBody(input: {
  actorUserId: string;
  event: MeetupCoordinationTimelineEvent;
  pickupIso?: string | null;
  returnIso?: string | null;
  location?: string | null;
  note?: string | null;
}): string {
  const name = getProfileNameForUserId(input.actorUserId).trim() || 'Someone';
  const loc = String(input.location ?? '').trim();
  const pickup =
    typeof input.pickupIso === 'string' && input.pickupIso.trim()
      ? formatTimelineInstant(input.pickupIso.trim())
      : '';
  const ret =
    typeof input.returnIso === 'string' && input.returnIso.trim()
      ? formatTimelineInstant(input.returnIso.trim())
      : '';

  switch (input.event) {
    case 'pickup_proposed':
      return [
        `${name} proposed pickup details:`,
        ...(pickup ? [pickup] : []),
        ...(loc ? [loc] : []),
      ].join('\n');
    case 'pickup_approved':
      return `${name} approved pickup details.`;
    case 'return_proposed':
      return [
        `${name} proposed return details:`,
        ...(ret ? [ret] : []),
        ...(loc ? [loc] : []),
      ].join('\n');
    case 'return_suggested':
      return `${name} suggested updated return details.`;
    case 'return_approved':
      return `${name} approved return details.`;
    case 'extension_requested':
      return [
        `${name} requested a rental extension.`,
        ...(ret ? [`Return proposed: ${ret}`] : []),
        ...(input.note ? [`Note: ${input.note}`] : []),
      ].join('\n');
    case 'extension_approved':
      return `${name} approved the extension request.`;
    case 'extension_declined':
      return `${name} declined the extension request.`;
    case 'meetup_declined':
      return `${name} declined the meetup proposal.`;
    default:
      return `${name} updated meetup coordination.`;
  }
}

export async function insertMeetupCoordinationTimelineMessage(input: {
  offerId: string;
  requestRowId?: string | null;
  rentalId?: string | null;
  authorId: string;
  receiverId: string;
  event: MeetupCoordinationTimelineEvent;
  pickupIso?: string | null;
  returnIso?: string | null;
  location?: string | null;
  note?: string | null;
}): Promise<string | null> {
  const offerId = input.offerId.trim();
  const authorId = input.authorId.trim();
  const receiverId = input.receiverId.trim();
  if (!offerId || !authorId || !receiverId || authorId === receiverId) return null;

  const body = buildMeetupCoordinationTimelineBody({
    actorUserId: authorId,
    event: input.event,
    pickupIso: input.pickupIso,
    returnIso: input.returnIso,
    location: input.location,
    note: input.note,
  });

  const row: Record<string, unknown> = {
    offer_id: offerId,
    author_id: authorId,
    receiver_id: receiverId,
    body,
    price: null,
    kind: OFFER_MEETUP_COORDINATION_KIND,
  };

  const rid = input.requestRowId != null && String(input.requestRowId).trim() !== '' ? String(input.requestRowId).trim() : '';
  if (rid !== '') row.request_id = rid;

  const rentalId =
    input.rentalId != null && String(input.rentalId).trim() !== '' ? String(input.rentalId).trim() : '';
  if (rentalId !== '') row.rental_id = rentalId;

  const supabase = getSupabase();
  const { data, error } = await supabase.from('offer_messages').insert(row).select('id').single();
  if (error != null) {
    if (__DEV__) console.warn('[meetup_coordination] offer_messages insert failed', error.message);
    return null;
  }
  const id = (data as { id?: string } | null)?.id;
  return typeof id === 'string' ? id : null;
}

export function resolveMeetupCoordinationReceiverId(input: {
  authorId: string;
  ownerUserId: string;
  renterUserId: string;
}): string | null {
  if (input.authorId === input.ownerUserId) return input.renterUserId;
  if (input.authorId === input.renterUserId) return input.ownerUserId;
  return null;
}

export async function insertMeetupCoordinationTimelineForRental(input: {
  rental: {
    id: string;
    offer_id?: string | null;
    request_id?: string | null;
    owner_user_id: string;
    renter_user_id: string;
  };
  authorId: string;
  event: MeetupCoordinationTimelineEvent;
  pickupIso?: string | null;
  returnIso?: string | null;
  location?: string | null;
  note?: string | null;
}): Promise<string | null> {
  const offerId = input.rental.offer_id != null ? String(input.rental.offer_id).trim() : '';
  if (!offerId || !isUuidString(offerId)) return null;
  const receiverId = resolveMeetupCoordinationReceiverId({
    authorId: input.authorId,
    ownerUserId: input.rental.owner_user_id,
    renterUserId: input.rental.renter_user_id,
  });
  if (!receiverId || receiverId === input.authorId) return null;
  const requestRowId =
    input.rental.request_id != null && isUuidString(String(input.rental.request_id))
      ? String(input.rental.request_id)
      : null;
  return insertMeetupCoordinationTimelineMessage({
    offerId,
    requestRowId,
    rentalId: input.rental.id,
    authorId: input.authorId,
    receiverId,
    event: input.event,
    pickupIso: input.pickupIso,
    returnIso: input.returnIso,
    location: input.location,
    note: input.note,
  });
}

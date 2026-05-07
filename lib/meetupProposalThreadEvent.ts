import { getSupabase } from '@/lib/supabase';

/** `offer_messages.kind` for meetup pickup/return proposals (counts toward unread like user_chat). */
export const OFFER_MEETUP_PROPOSAL_KIND = 'meetup_proposal';

function formatProposalInstant(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} • ${timePart}`;
}

/** Stable body text for chat bubbles + optional parsers (legacy + new). */
export function buildMeetupProposalMessageBody(input: {
  meetupTimeIso: string;
  returnTimeIso: string;
  meetupLocation: string;
}): string {
  const pickup = formatProposalInstant(input.meetupTimeIso);
  const ret = formatProposalInstant(input.returnTimeIso);
  const loc = String(input.meetupLocation ?? '').trim();
  return [
    `Pickup time proposed: ${pickup}`,
    `Return time proposed: ${ret}`,
    ...(loc ? [`📍 ${loc}`] : []),
  ].join('\n');
}

export async function insertMeetupProposalOfferMessage(input: {
  offerId: string;
  requestRowId?: string | null;
  rentalId?: string | null;
  authorId: string;
  receiverId: string;
  meetupTimeIso: string;
  returnTimeIso: string;
  meetupLocation: string;
}): Promise<string | null> {
  const offerId = input.offerId.trim();
  const authorId = input.authorId.trim();
  const receiverId = input.receiverId.trim();
  if (!offerId || !authorId || !receiverId || authorId === receiverId) {
    return null;
  }

  const body = buildMeetupProposalMessageBody({
    meetupTimeIso: input.meetupTimeIso,
    returnTimeIso: input.returnTimeIso,
    meetupLocation: input.meetupLocation,
  });

  const row: Record<string, unknown> = {
    offer_id: offerId,
    author_id: authorId,
    receiver_id: receiverId,
    body,
    price: null,
    kind: OFFER_MEETUP_PROPOSAL_KIND,
  };

  const rid = input.requestRowId != null && String(input.requestRowId).trim() !== '' ? String(input.requestRowId).trim() : '';
  if (rid !== '') row.request_id = rid;

  const rentalId =
    input.rentalId != null && String(input.rentalId).trim() !== '' ? String(input.rentalId).trim() : '';
  if (rentalId !== '') row.rental_id = rentalId;

  const supabase = getSupabase();
  const { data, error } = await supabase.from('offer_messages').insert(row).select('id').single();
  if (error != null) {
    if (__DEV__) console.warn('[meetup_proposal] offer_messages insert failed', error.message);
    return null;
  }
  const id = (data as { id?: string } | null)?.id;
  return typeof id === 'string' ? id : null;
}

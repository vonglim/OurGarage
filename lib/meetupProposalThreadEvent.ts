import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { getSupabase } from '@/lib/supabase';

/** `offer_messages.kind` for meetup pickup/return proposals (counts toward unread like user_chat). */
export const OFFER_MEETUP_PROPOSAL_KIND = 'meetup_proposal';

export type MeetupProposalMessagePhase = 'pickup' | 'return' | 'extension' | 'general';

function formatProposalInstant(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} • ${timePart}`;
}

function formatTimelineInstant(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} at ${timePart}`;
}

/** Stable body text for chat bubbles + optional parsers (legacy + new). */
export function buildMeetupProposalMessageBody(input: {
  meetupTimeIso: string;
  returnTimeIso: string;
  meetupLocation: string;
  returnLocation?: string;
  durationWarningLine?: string | null;
  isExtension?: boolean;
  isReturnOnly?: boolean;
  extensionNote?: string | null;
  proposalPhase?: MeetupProposalMessagePhase;
  proposerUserId?: string | null;
}): string {
  const pickup = formatProposalInstant(input.meetupTimeIso);
  const ret = formatProposalInstant(input.returnTimeIso);
  const pickupHuman = formatTimelineInstant(input.meetupTimeIso);
  const pickupLoc = String(input.meetupLocation ?? '').trim();
  const returnLoc = String(input.returnLocation ?? input.meetupLocation ?? '').trim();
  const note = String(input.extensionNote ?? '').trim();
  const proposerName = input.proposerUserId
    ? getProfileNameForUserId(input.proposerUserId).trim() || 'Someone'
    : 'Someone';
  const phase = input.proposalPhase ?? (input.isReturnOnly ? 'return' : input.isExtension ? 'extension' : 'general');

  if (input.isReturnOnly || phase === 'return') {
    return [
      `${proposerName} proposed return details:`,
      ...(ret ? [ret] : []),
      ...(returnLoc ? [returnLoc] : []),
      `Pickup (unchanged): ${pickupHuman}`,
      ...(pickupLoc && pickupLoc !== returnLoc ? [`Pickup location: ${pickupLoc}`] : []),
      ...(input.durationWarningLine ? [input.durationWarningLine] : []),
    ].join('\n');
  }

  if (input.isExtension || phase === 'extension') {
    return [
      'Extension requested',
      `Return time proposed: ${ret}`,
      `Pickup (unchanged): ${pickup}`,
      ...(pickupLoc ? [`📍 ${pickupLoc}`] : []),
      ...(note ? [`Note: ${note}`] : []),
      'Extensions must be approved by the owner to avoid late return fees.',
      ...(input.durationWarningLine ? [input.durationWarningLine] : []),
    ].join('\n');
  }

  if (phase === 'pickup') {
    return [
      `${proposerName} proposed pickup details:`,
      pickupHuman,
      ...(pickupLoc ? [pickupLoc] : []),
      ...(input.durationWarningLine ? [input.durationWarningLine] : []),
    ].join('\n');
  }

  return [
    `Pickup time proposed: ${pickup}`,
    `Return time proposed: ${ret}`,
    ...(pickupLoc ? [`📍 ${pickupLoc}`] : []),
    ...(input.durationWarningLine ? [input.durationWarningLine, 'Final price may require adjustment.'] : []),
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
  returnLocation?: string;
  durationWarningLine?: string | null;
  isExtension?: boolean;
  isReturnOnly?: boolean;
  extensionNote?: string | null;
  proposalPhase?: MeetupProposalMessagePhase;
  proposerUserId?: string | null;
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
    returnLocation: input.returnLocation,
    durationWarningLine: input.durationWarningLine,
    isExtension: input.isExtension,
    isReturnOnly: input.isReturnOnly,
    extensionNote: input.extensionNote,
    proposalPhase: input.proposalPhase,
    proposerUserId: input.proposerUserId,
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

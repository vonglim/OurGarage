import type { Offer } from '@/lib/negotiationOfferTypes';
import type { RentalStatus } from '@/store/requestsStore';

export type PosterThreadNegotiationFlags = {
  lastMoverIsMe: boolean;
  negotiationLocked: boolean;
  isTerminal: boolean;
  showIncoming: boolean;
  showOutgoing: boolean;
  posterCanConfirmRental: boolean;
  canAcceptIncoming: boolean;
};

/** Per-thread flags for the request owner comparing or acting on one lender offer. */
export function getPosterThreadNegotiationFlags(
  o: Offer,
  opts: { matched: boolean; rentalStatus: RentalStatus; meTrim: string }
): PosterThreadNegotiationFlags {
  const { matched, rentalStatus, meTrim } = opts;
  const negotiationLocked = o.negotiationLocked === true;
  const lastMoverIsMe = meTrim.length > 0 && String(o.lastUpdatedBy ?? '').trim() === meTrim;
  const isTerminal =
    !matched &&
    rentalStatus === 'pending' &&
    (o.status === 'declined' || o.status === 'closed');

  const isPendingOffer =
    !matched && rentalStatus === 'pending' && o.status === 'pending';

  const renterIdTrim = String(o.renterId ?? '').trim();
  const lastByTrim = String(o.lastUpdatedBy ?? '').trim();

  const showIncoming = isPendingOffer && !lastMoverIsMe;
  const showOutgoing = isPendingOffer && lastMoverIsMe;

  const posterCanConfirmRental =
    !matched && rentalStatus === 'pending' && o.status === 'pending_confirmation';

  const canAcceptIncoming =
    !matched &&
    o.status === 'pending' &&
    rentalStatus === 'pending' &&
    lastByTrim === renterIdTrim;

  return {
    lastMoverIsMe,
    negotiationLocked,
    isTerminal,
    showIncoming,
    showOutgoing,
    posterCanConfirmRental,
    canAcceptIncoming,
  };
}

export function posterShouldShowCounterButton(
  o: Offer,
  flags: PosterThreadNegotiationFlags,
  opts: { matched: boolean; rentalStatus: RentalStatus; posterCounterRemaining: number }
): boolean {
  if (opts.matched || opts.rentalStatus !== 'pending') return false;
  if (flags.negotiationLocked || flags.isTerminal) return false;
  if (opts.posterCounterRemaining <= 0) return false;
  if (o.status !== 'pending') return false;
  return flags.showIncoming || flags.showOutgoing || flags.canAcceptIncoming;
}

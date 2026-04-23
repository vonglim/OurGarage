import { getRequestOwnerId } from '@/lib/requestOwnership';
import { getOfferById } from '@/store/offersStore';
import { getEffectiveRentalStatus } from '@/store/requestsStore';

export { getRequestOwnerId } from '@/lib/requestOwnership';

function userIsAcceptedRenter(
  req: Record<string, unknown>,
  requestTimestamp: number,
  me: string
): boolean {
  if (req.matched !== true) return false;
  const accId = req.acceptedOfferId;
  if (typeof accId !== 'string' || accId.trim() === '') return false;
  const offer = getOfferById(accId.trim());
  return typeof offer?.renterId === 'string' && offer.renterId === me;
}

/**
 * Requests that belong on Activity (not global): you own the request, or you are the
 * accepted renter (so Rentals tab can show your side of the pipeline). Browse lists everyone.
 */
export function activityRequestInvolvesUser(
  req: Record<string, unknown>,
  me: string
): boolean {
  const owner = getRequestOwnerId(req);
  const ts = req.timestamp;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false;
  if (owner != null && owner === me) return true;
  if (userIsAcceptedRenter(req, ts, me)) return true;
  return false;
}

/** Rentals tab: matched / active / completed where user is poster or accepted offerer. */
export function rentalRequestInvolvesUser(req: Record<string, unknown>, me: string): boolean {
  const st = getEffectiveRentalStatus(req);
  if (st !== 'matched' && st !== 'active' && st !== 'completed') return false;
  const owner = getRequestOwnerId(req);
  const ts = req.timestamp;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false;
  if (owner != null && owner === me) return true;
  return userIsAcceptedRenter(req, ts, me);
}

/** Offer counts for Activity: your offers, or offers on your requests (`user_id` / `offerUserId`, owner). */
export function offerCountsForActivityRow(
  o: { requestId: number; renterId?: string; status?: string },
  req: Record<string, unknown>,
  me: string
): boolean {
  if (o.status === 'declined' || o.status === 'closed') return false;
  const owner = getRequestOwnerId(req);
  if (typeof o.renterId === 'string' && o.renterId === me) return true;
  if (owner != null && owner === me) return true;
  return false;
}

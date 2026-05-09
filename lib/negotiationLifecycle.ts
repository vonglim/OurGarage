import type { Offer } from '@/lib/negotiationOfferTypes';

import {
  NEGOTIATION_MAX_DECLINES_BEFORE_LOCK,
  NEGOTIATION_MAX_WITHDRAW_CYCLES,
  NEGOTIATION_REOFFER_COOLDOWN_MS,
} from '@/lib/negotiationLifecycleConstants';

export {
  NEGOTIATION_MAX_DECLINES_BEFORE_LOCK,
  NEGOTIATION_MAX_WITHDRAW_CYCLES,
  NEGOTIATION_REOFFER_COOLDOWN_MS,
} from '@/lib/negotiationLifecycleConstants';

export function isNegotiationPermanentlyLocked(offer: Offer | undefined | null): boolean {
  return offer?.negotiationLocked === true;
}

/** Active = at most one row per pair; these statuses mean bargaining is open. */
export function isNegotiationOfferActiveStatus(status: Offer['status']): boolean {
  return status === 'pending' || status === 'pending_confirmation';
}

export function cooldownRemainingAfterWithdrawMs(
  offer: Offer | undefined | null,
  nowMs: number
): number {
  if (offer?.status !== 'closed') return 0;
  const last = offer.lastWithdrawalAt;
  if (last == null || !Number.isFinite(last)) return 0;
  const elapsed = nowMs - last;
  return Math.max(0, NEGOTIATION_REOFFER_COOLDOWN_MS - elapsed);
}

export function remainingDeclinesBeforeLock(offer: Offer | undefined | null): number {
  const n = offer?.negotiationDeclineTotal ?? 0;
  return Math.max(0, NEGOTIATION_MAX_DECLINES_BEFORE_LOCK - n);
}

/** Next proposal decline will hit the limit and permanently lock the thread. */
export function isFinalDeclineRoundBeforeAction(offer: Offer | undefined | null): boolean {
  return remainingDeclinesBeforeLock(offer) === 1;
}

export function formatNegotiationCooldownRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return '';
  const m = Math.ceil(remainingMs / 60000);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
  }
  return `${m}m`;
}

/** Optional reason line from `offer_messages.body` for `proposal_declined` rows. */
export function parseProposalDeclinedReason(body: string | null | undefined): string | null {
  const t = String(body ?? '').trim();
  if (!t) return null;
  const m = t.match(/\bReason:\s*([\s\S]+)/i);
  const rest = m?.[1]?.trim() ?? '';
  return rest.length > 0 ? rest : null;
}

export type CanCreateNewOfferThreadResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'locked' | 'cooldown' | 'max_threads' | 'pending_confirmation';
    };

/**
 * Renter may open a new thread after withdraw (same DB row): cooldown + thread cap + not locked.
 */
export function canCreateNewOfferThreadAfterWithdraw(
  offer: Offer | undefined | null,
  nowMs: number
): CanCreateNewOfferThreadResult {
  if (!offer) return { ok: true };
  if (offer.negotiationLocked) return { ok: false, reason: 'locked' };
  if (offer.status !== 'closed') return { ok: true };
  const wc = offer.withdrawCycleCount ?? 0;
  const last = offer.lastWithdrawalAt;
  if (wc < 1 && (last == null || !Number.isFinite(last))) {
    return { ok: false, reason: 'locked' };
  }
  if (wc >= NEGOTIATION_MAX_WITHDRAW_CYCLES) return { ok: false, reason: 'max_threads' };
  const cool = cooldownRemainingAfterWithdrawMs(offer, nowMs);
  if (cool > 0) return { ok: false, reason: 'cooldown' };
  return { ok: true };
}

/** Whether renter may use make-offer / addOffer at all on this thread (not locked). */
export function canRenterStartOrRefreshOffer(offer: Offer | undefined | null): boolean {
  if (!offer) return true;
  if (offer.negotiationLocked) return false;
  return true;
}

export type RenterBrowseNegotiationCardState =
  | { kind: 'none' }
  | { kind: 'locked' }
  | { kind: 'active_pending'; awaitingTheirMove: boolean }
  | { kind: 'active_pending_confirmation' }
  | { kind: 'declined' }
  | { kind: 'withdrawn_cooldown'; remainingMs: number }
  | { kind: 'withdrawn_can_reoffer' }
  | { kind: 'closed_other' }; // fallback

export function getRenterBrowseNegotiationCardState(
  offer: Offer | undefined,
  viewerUserId: string,
  nowMs: number
): RenterBrowseNegotiationCardState {
  const me = viewerUserId.trim();
  if (!offer || offer.renterId.trim() !== me) return { kind: 'none' };
  if (offer.negotiationLocked) return { kind: 'locked' };

  if (offer.status === 'pending_confirmation') return { kind: 'active_pending_confirmation' };
  if (offer.status === 'pending') {
    const last = String(offer.lastUpdatedBy ?? '').trim();
    return { kind: 'active_pending', awaitingTheirMove: last !== me };
  }
  if (offer.status === 'declined') return { kind: 'declined' };
  if (offer.status === 'closed') {
    const wc = offer.withdrawCycleCount ?? 0;
    const last = offer.lastWithdrawalAt;
    if (wc >= NEGOTIATION_MAX_WITHDRAW_CYCLES) return { kind: 'locked' };
    if (wc < 1 && (last == null || !Number.isFinite(last))) return { kind: 'closed_other' };
    const rem = cooldownRemainingAfterWithdrawMs(offer, nowMs);
    if (rem > 0) return { kind: 'withdrawn_cooldown', remainingMs: rem };
    return { kind: 'withdrawn_can_reoffer' };
  }
  return { kind: 'closed_other' };
}

/** @alias {@link isNegotiationPermanentlyLocked} */
export const isNegotiationLocked = isNegotiationPermanentlyLocked;

/** @alias {@link canCreateNewOfferThreadAfterWithdraw} */
export const canCreateNewOfferThread = canCreateNewOfferThreadAfterWithdraw;

export type ActiveNegotiationThreadState =
  | 'none'
  | 'pending'
  | 'pending_confirmation'
  | 'declined'
  | 'closed'
  | 'accepted'
  | 'locked';

/** Normalized high-level state for a single offer row (one renter + request). */
export function activeThreadState(offer: Offer | undefined | null): ActiveNegotiationThreadState {
  if (!offer) return 'none';
  if (offer.negotiationLocked) return 'locked';
  const s = offer.status;
  if (s === 'pending') return 'pending';
  if (s === 'pending_confirmation') return 'pending_confirmation';
  if (s === 'declined') return 'declined';
  if (s === 'closed') return 'closed';
  if (s === 'accepted') return 'accepted';
  return 'none';
}

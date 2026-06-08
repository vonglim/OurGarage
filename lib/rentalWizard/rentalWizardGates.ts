import type { RentalLifecyclePhase } from '@/lib/rentalLifecyclePhase';
import { rentalRowHasReturnSchedule } from '@/lib/rentalMeetupCoordinationState';
import {
  hasCanonicalAgreedPickupDatetime,
  hasCanonicalAgreedReturnDatetime,
  hasCanonicalMeetupLocation,
  isAgreementConfirmedOnRental,
  isPickupCoordinationComplete,
} from '@/lib/rentalWizard/pickupCoordinationDiagnostics';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export { isPickupCoordinationComplete };

/** Canonical accepted pickup time — `agreed_pickup_datetime` on rentals only. */
export function hasPickupSchedule(ctx: RentalWizardContext): boolean {
  return hasCanonicalAgreedPickupDatetime(ctx.rental);
}

/** Canonical accepted handoff location — `meetup_location` on rentals only. */
export function hasPickupLocation(ctx: RentalWizardContext): boolean {
  return hasCanonicalMeetupLocation(ctx.rental);
}

/**
 * Contractual/operational return hint exists (for display hints only).
 * Not equivalent to bilateral return coordination acceptance.
 */
export function hasReturnSchedule(ctx: RentalWizardContext): boolean {
  return rentalRowHasReturnSchedule(
    ctx.rental,
    ctx.requestSchedulingMeta,
    ctx.hasPendingProposal
  );
}

/** Return coordination bilaterally accepted — `agreed_return_datetime` on rentals only. */
export function hasReturnCoordinationAgreed(ctx: RentalWizardContext): boolean {
  return hasCanonicalAgreedReturnDatetime(ctx.rental);
}

function isReturnCoordinationAcknowledged(ctx: RentalWizardContext): boolean {
  return Boolean(ctx.wizardProgress.pickup_return_coordination_ack_at?.trim());
}

/**
 * Pickup + return bilaterally confirmed on the rental row (owner/renter workspace accept).
 * When true, renter should not remain stuck on `coordinate_return` waiting for wizard-only acks.
 */
export function isBilateralMeetupCoordinationConfirmedOnRow(ctx: RentalWizardContext): boolean {
  const { rental } = ctx;
  if (!isAgreementConfirmedOnRental(rental)) return false;
  return (
    hasCanonicalAgreedPickupDatetime(rental) && hasCanonicalAgreedReturnDatetime(rental)
  );
}

/**
 * Full meetup coordination finished for wizard routing.
 * - Bilateral row confirmation (agreed pickup/return + agreement_status confirmed) advances to pickup/handoff.
 * - Otherwise renter must complete coordinate_return ack + pickup_confirmed transition.
 */
export function isMeetupCoordinationComplete(ctx: RentalWizardContext): boolean {
  if (!isPickupCoordinationComplete(ctx) || !hasReturnCoordinationAgreed(ctx)) {
    return false;
  }
  if (isBilateralMeetupCoordinationConfirmedOnRow(ctx)) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[rental-wizard][isMeetupCoordinationComplete] bilateral_row_confirmed', {
        rentalId: ctx.rentalId,
        agreed_pickup_datetime: ctx.rental.agreed_pickup_datetime ?? null,
        agreed_return_datetime: ctx.rental.agreed_return_datetime ?? null,
      });
    }
    return true;
  }
  return (
    ctx.seenTransitions.has('pickup_confirmed_seen') &&
    isReturnCoordinationAcknowledged(ctx)
  );
}

/**
 * Wizard return segment — not driven by `rentals.status = active` on booking approval.
 */
export function isWizardReturnPhase(ctx: RentalWizardContext): boolean {
  const st = String(ctx.rental.status ?? '').trim().toLowerCase();
  if (st === 'return_pending') return true;
  return false;
}

/**
 * Screen 5 (active rental) — only after legal rental activation (agreement, preauth, signatures).
 * `rentals.status` may be `active` immediately after owner approves a request; that is not
 * equipment-out.
 */
export function canShowWizardActiveRental(ctx: RentalWizardContext): boolean {
  return ctx.pickupHandoffComplete && isMeetupCoordinationComplete(ctx);
}

/** Lifecycle phase for wizard UI — stricter than {@link deriveLifecyclePhaseFromRentalStatus}. */
export function deriveWizardLifecyclePhase(ctx: RentalWizardContext): RentalLifecyclePhase {
  const st = String(ctx.rental.status ?? 'pending').trim().toLowerCase();
  if (st === 'returned' || st === 'completed' || st === 'cancelled') return 'completed';
  if (isWizardReturnPhase(ctx)) return 'return';
  if (ctx.returnHandoffComplete) return 'completed';
  if (canShowWizardActiveRental(ctx)) return 'active';
  return 'pickup';
}

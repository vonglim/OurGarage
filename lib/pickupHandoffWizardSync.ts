import { resolvePickupHandoffPresenceState } from '@/lib/pickupHandoffLive';
import { resolveRentalWizardDestination } from '@/lib/rentalWizard/rentalWizardStepResolver';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';
import { wizardStepFromSlug } from '@/lib/rentalWizard/wizardStepMeta';

const RENTER_AWAITING_INSPECTION_STEPS: readonly RentalWizardStep[] = [
  'meetup_day',
  'transition_pickup_ready',
];

export function wizardStepFromPathname(pathname: string): RentalWizardStep | null {
  const match = pathname.match(/\/s\/([^/?]+)/);
  if (!match?.[1]) return null;
  return wizardStepFromSlug(match[1]);
}

/**
 * When the owner marks arrival, the renter may already be on Meetup Day.
 * Advance to inspection without requiring a second "I'm here" tap.
 */
export function resolveRenterPickupInspectionAutoNavigatePath(
  ctx: RentalWizardContext,
  pathname: string
): string | null {
  const currentStep = wizardStepFromPathname(pathname);
  if (!currentStep || !RENTER_AWAITING_INSPECTION_STEPS.includes(currentStep)) {
    return null;
  }

  const presence = resolvePickupHandoffPresenceState({
    rental: ctx.rental,
    renterPickupImHereAt: ctx.wizardProgress.renter_pickup_im_here_at,
    renterApprovedPickupPhotosAt: ctx.wizardProgress.renter_approved_pickup_photos_at,
    pickupAck: ctx.pickupAck,
    ownerPickupPrepComplete: false,
    handoffApprovalStarted: Boolean(
      ctx.rental.handoff_approval_started_at?.trim() || ctx.rental.handoff_approved_by_owner
    ),
    handoffCompleted: ctx.pickupHandoffComplete,
    viewerRole: 'renter',
  });

  if (!presence.bothPresent) return null;

  const dest = resolveRentalWizardDestination(ctx);
  if (dest.step !== 'owner_confirmed_arrival' || !dest.path) return null;
  if (pathname.includes(dest.path)) return null;

  return dest.path;
}

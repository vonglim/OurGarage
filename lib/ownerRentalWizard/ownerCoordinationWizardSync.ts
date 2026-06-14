import { isPickupCoordinationComplete } from '@/lib/rentalWizard/rentalWizardGates';

import { resolveOwnerRentalWizardDestination } from '@/lib/ownerRentalWizard/ownerRentalWizardStepResolver';
import { ownerWizardStepFromPathname } from '@/lib/ownerRentalWizard/ownerHandoffWizardSync';
import type { OwnerRentalWizardContext, OwnerRentalWizardStep } from '@/lib/ownerRentalWizard/types';

const COORDINATION_TRANSITION_STEPS: readonly OwnerRentalWizardStep[] = [
  'transition_rental_confirmed',
  'transition_pickup_confirmed',
  'transition_return_confirmed',
  'transition_all_set',
  'transition_pickup_ready',
];

/**
 * When counterparty accepts pickup/return coordination, advance the owner off the stale
 * coordinate screen to the resolved transition milestone without a manual refresh.
 */
export function resolveOwnerCoordinationTransitionAutoNavigatePath(
  ctx: OwnerRentalWizardContext,
  pathname: string
): string | null {
  const currentStep = ownerWizardStepFromPathname(pathname);
  if (currentStep !== 'coordinate_pickup' && currentStep !== 'coordinate_return') {
    return null;
  }

  const dest = resolveOwnerRentalWizardDestination(ctx);
  if (!dest.path || pathname.includes(dest.path)) return null;

  if (!COORDINATION_TRANSITION_STEPS.includes(dest.step)) return null;

  if (dest.step === 'transition_pickup_confirmed') {
    if (!isPickupCoordinationComplete(ctx)) return null;
    if (ctx.seenTransitions.has('pickup_confirmed_seen')) return null;
  }

  return dest.path;
}

import { resolveMeetupLifecyclePhase } from '@/lib/rentalLifecycle/meetupLifecycle';
import { resolveOwnerRentalWizardDestination } from '@/lib/ownerRentalWizard/ownerRentalWizardStepResolver';
import { ownerWizardStepFromSlug } from '@/lib/ownerRentalWizard/ownerWizardStepMeta';
import type { OwnerRentalWizardContext } from '@/lib/ownerRentalWizard/types';

export function ownerWizardStepFromPathname(pathname: string) {
  const match = pathname.match(/\/s\/([^/?]+)/);
  if (!match?.[1]) return null;
  return ownerWizardStepFromSlug(match[1]);
}

/**
 * When the renter confirms receipt, advance the owner from meetup handoff to authorization observe
 * without requiring a manual refresh or navigation tap.
 */
export function resolveOwnerAuthorizationObserveAutoNavigatePath(
  ctx: OwnerRentalWizardContext,
  pathname: string
): string | null {
  const currentStep = ownerWizardStepFromPathname(pathname);
  if (currentStep !== 'owner_meetup_handoff') return null;

  const phase = resolveMeetupLifecyclePhase(ctx);
  if (phase !== 'rental_authorization') return null;

  const dest = resolveOwnerRentalWizardDestination(ctx);
  if (dest.step !== 'owner_authorization_observe' || !dest.path) return null;
  if (pathname.includes(dest.path)) return null;

  return dest.path;
}

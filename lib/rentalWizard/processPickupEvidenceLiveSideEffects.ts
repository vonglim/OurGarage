import type { WizardLifecyclePromptId } from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

function isOnPreparePickupPath(pathname: string): boolean {
  return pathname.includes('/s/prepare-pickup') || pathname.includes('/prepare-pickup');
}

/** Arm renter overlay when owner completes required pickup evidence package. */
export function detectPickupEvidenceReadyArming(input: {
  prev: RentalWizardContext | null;
  next: RentalWizardContext;
  pathname: string;
}): WizardLifecyclePromptId | null {
  if (!input.prev) return null;
  if (input.next.viewerRole !== 'renter') return null;
  if (!isOnPreparePickupPath(input.pathname)) return null;
  if (input.next.wizardProgress.renter_approved_pickup_photos_at?.trim()) return null;

  const wasReady = input.prev?.pickupEvidenceReadiness.renterEvidenceReady ?? false;
  const nowReady = input.next.pickupEvidenceReadiness.renterEvidenceReady;
  if (!wasReady && nowReady) {
    return 'pickup_evidence_ready';
  }
  return null;
}

export function processPickupEvidenceLiveSideEffects(input: {
  prev: RentalWizardContext | null;
  next: RentalWizardContext;
  pathname: string;
  armLifecyclePrompt: (id: WizardLifecyclePromptId) => void;
}): void {
  const armed = detectPickupEvidenceReadyArming({
    prev: input.prev,
    next: input.next,
    pathname: input.pathname,
  });
  if (armed) {
    input.armLifecyclePrompt(armed);
  }
}

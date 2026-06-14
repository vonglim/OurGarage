import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { safeResolveRentalWizardDestination } from '@/lib/rentalWizard/rentalWizardStepResolver';
import type { RentalWizardDestination, RentalWizardStep } from '@/lib/rentalWizard/types';

/** Transient in-wizard gates that block resolver redirects until acknowledged. */
export type WizardLifecyclePromptId =
  | 'pickup_coordination_accepted'
  | 'return_coordination_accepted'
  | 'return_coordination_confirm_requested'
  | 'pickup_evidence_ready';

export const PICKUP_EVIDENCE_READY_SUSPENDED_STEP: RentalWizardStep = 'prepare_pickup';

export const PICKUP_COORDINATION_ACCEPTED_SUSPENDED_STEP: RentalWizardStep = 'coordinate_pickup';
export const RETURN_COORDINATION_ACCEPTED_SUSPENDED_STEP: RentalWizardStep = 'coordinate_return';

export type WizardLifecyclePromptGateState = {
  id: WizardLifecyclePromptId | null;
  /** Step kept mounted in the URL while the prompt is active. */
  suspendedStep: RentalWizardStep | null;
};

export type WizardLifecyclePromptGateEvent =
  | 'prompt_armed'
  | 'prompt_rendered'
  | 'redirect_blocked_by_prompt'
  | 'prompt_acknowledged'
  | 'redirect_resumed';

export function logWizardLifecyclePromptGate(
  rentalId: string,
  event: WizardLifecyclePromptGateEvent,
  extra?: Record<string, unknown>
): void {
  logScenario('transition', {
    event,
    rentalId,
    source: 'wizard_lifecycle_gate',
    ...extra,
  });
}

export function createLifecyclePromptGateState(
  id: WizardLifecyclePromptId | null
): WizardLifecyclePromptGateState {
  if (!id) {
    return { id: null, suspendedStep: null };
  }
  return {
    id,
    suspendedStep:
      id === 'pickup_coordination_accepted'
        ? PICKUP_COORDINATION_ACCEPTED_SUSPENDED_STEP
        : id === 'return_coordination_accepted' || id === 'return_coordination_confirm_requested'
          ? RETURN_COORDINATION_ACCEPTED_SUSPENDED_STEP
          : id === 'pickup_evidence_ready'
            ? PICKUP_EVIDENCE_READY_SUSPENDED_STEP
            : null,
  };
}

export function hasPendingWizardLifecyclePrompt(
  gate: WizardLifecyclePromptGateState | null | undefined
): boolean {
  return Boolean(gate?.id);
}

/**
 * Resolver + redirect policy while a lifecycle prompt gate is active.
 * Step auto-correction and transition redirects must defer to acknowledgment.
 */
export function evaluateWizardNavigationWithLifecycleGate(input: {
  ctx: Parameters<typeof safeResolveRentalWizardDestination>[0];
  urlStep: RentalWizardStep;
  gate: WizardLifecyclePromptGateState | null | undefined;
}): {
  dest: RentalWizardDestination;
  shouldRedirect: boolean;
  redirectBlockedByPrompt: boolean;
  frozenUrlStep: RentalWizardStep | null;
} {
  const dest = safeResolveRentalWizardDestination(input.ctx);
  const pending = hasPendingWizardLifecyclePrompt(input.gate);

  if (pending) {
    const frozenUrlStep = input.gate?.suspendedStep ?? input.urlStep;
    const wouldRedirect = dest.step !== input.urlStep;
    return {
      dest,
      shouldRedirect: false,
      redirectBlockedByPrompt: wouldRedirect,
      frozenUrlStep,
    };
  }

  return {
    dest,
    shouldRedirect: dest.step !== input.urlStep,
    redirectBlockedByPrompt: false,
    frozenUrlStep: null,
  };
}

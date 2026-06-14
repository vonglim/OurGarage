import {
  hasPendingWizardLifecyclePrompt,
  type WizardLifecyclePromptGateState,
  type WizardLifecyclePromptId,
} from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import { resolveOwnerRentalWizardDestination } from '@/lib/ownerRentalWizard/ownerRentalWizardStepResolver';
import type {
  OwnerRentalWizardContext,
  OwnerRentalWizardDestination,
  OwnerRentalWizardStep,
} from '@/lib/ownerRentalWizard/types';

export function evaluateOwnerWizardNavigationWithLifecycleGate(input: {
  ctx: OwnerRentalWizardContext;
  urlStep: OwnerRentalWizardStep;
  gate: WizardLifecyclePromptGateState | null | undefined;
}): {
  dest: OwnerRentalWizardDestination;
  shouldRedirect: boolean;
  redirectBlockedByPrompt: boolean;
  frozenUrlStep: OwnerRentalWizardStep | null;
} {
  const dest = resolveOwnerRentalWizardDestination(input.ctx);
  const pending = hasPendingWizardLifecyclePrompt(input.gate);

  if (pending) {
    const suspended = input.gate?.suspendedStep as OwnerRentalWizardStep | null;
    const frozenUrlStep = suspended ?? input.urlStep;
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

/** Map owner lifecycle prompt ids to owner wizard steps kept mounted during overlays. */
export function ownerStepToLifecycleSuspendedStep(
  id: WizardLifecyclePromptId | null
): OwnerRentalWizardStep | null {
  if (id === 'pickup_coordination_accepted') return 'coordinate_pickup';
  if (id === 'return_coordination_accepted' || id === 'return_coordination_confirm_requested') {
    return 'coordinate_return';
  }
  return null;
}

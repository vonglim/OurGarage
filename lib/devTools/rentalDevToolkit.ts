import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { getSimulationJumpConfig } from '@/lib/rentalSimulation/simulationJumps';
import type { RentalSimulationJump } from '@/lib/rentalSimulation/types';
import { resolveLogicalWizardStep, resolveRentalWizardDestination } from '@/lib/rentalWizard/rentalWizardStepResolver';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import { getDevLocalWizardProgress, getDevWizardStepOverride } from '@/store/rentalSimulationStore';

export type RentalWizardDebugInfo = {
  logicalStep: string;
  effectiveStep: string;
  lifecyclePhase: string;
  blocker: string | null;
  seenTransitions: string[];
  nextRoute: string | null;
  hasStepOverride: boolean;
  hasLifecycleOverride: boolean;
};

/** Dev-only wizard debug snapshot for the toolkit panel. */
export function buildRentalWizardDebugInfo(
  ctx: RentalWizardContext,
  simulationJump: RentalSimulationJump | null
): RentalWizardDebugInfo {
  if (!DEV_TOOLS_ENABLED) {
    return {
      logicalStep: '—',
      effectiveStep: '—',
      lifecyclePhase: ctx.lifecyclePhase,
      blocker: null,
      seenTransitions: [],
      nextRoute: null,
      hasStepOverride: false,
      hasLifecycleOverride: false,
    };
  }

  const logical = resolveLogicalWizardStep(ctx);
  const dest = resolveRentalWizardDestination(ctx);
  const override = getDevWizardStepOverride();
  const localProgress = getDevLocalWizardProgress();
  const mergedCtx: RentalWizardContext = {
    ...ctx,
    wizardProgress: { ...ctx.wizardProgress, ...localProgress },
  };
  const effective = override ?? dest.step;
  const blocker = simulationJump ? getSimulationJumpConfig(simulationJump).blockerHint ?? null : null;

  return {
    logicalStep: logical,
    effectiveStep: effective,
    lifecyclePhase: ctx.lifecyclePhase,
    blocker,
    seenTransitions: [...mergedCtx.seenTransitions],
    nextRoute: dest.path,
    hasStepOverride: override != null,
    hasLifecycleOverride: false,
  };
}

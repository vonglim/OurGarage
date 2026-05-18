import { buildLifecycleInspectorSnapshot } from '@/lib/rentalLifecycle/resolveLifecycleReasoning';
import { validateRentalLifecycle } from '@/lib/rentalLifecycle/lifecycleTransitionValidator';
import { detectPhaseRegression } from '@/lib/rentalLifecycle/operationalIntegrity';
import { estimateCanonicalPhaseFromRentalRow } from '@/lib/rentalLifecycle/estimatePhaseFromRentalRow';
import type { ScenarioSuite, ScenarioStep } from '@/lib/rentalLifecycle/scenarioSuites';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type ScenarioStepValidation = {
  step: ScenarioStep;
  pass: boolean;
  notes: string[];
};

export function validateScenarioStepAgainstContext(
  ctx: RentalWizardContext,
  step: ScenarioStep
): ScenarioStepValidation {
  const notes: string[] = [];
  const snapshot = buildLifecycleInspectorSnapshot(ctx);
  const issues = validateRentalLifecycle(ctx);
  const regression = detectPhaseRegression(ctx);

  if (step.validate.includes('wizard')) {
    if (snapshot.canonical_phase !== step.canonicalPhase && step.canonicalPhase !== 'request_pending') {
      notes.push(
        `Phase mismatch: expected ${step.canonicalPhase}, wizard ${snapshot.canonical_phase} (effective ${snapshot.effective_wizard_step})`
      );
    }
  }

  if (step.validate.includes('transitions') && step.canonicalPhase.includes('transition')) {
    if (!snapshot.transition_step && snapshot.effective_wizard_step !== step.canonicalPhase) {
      notes.push('Expected transition overlay not active');
    }
  }

  if (step.validate.includes('operational')) {
    if (step.canonicalPhase === 'cancelled' && snapshot.rental_status !== 'cancelled') {
      notes.push('Cancelled phase but status not cancelled');
    }
  }

  if (issues.length > 0) {
    notes.push(`${issues.length} integrity issue(s) — see console`);
  }
  if (regression.regressed) {
    notes.push(regression.message ?? 'Phase regression');
  }

  return {
    step,
    pass: notes.length === 0,
    notes,
  };
}

export function validateSuiteAgainstContext(
  ctx: RentalWizardContext,
  suite: ScenarioSuite
): { suiteId: string; results: ScenarioStepValidation[]; passCount: number; total: number } {
  const results = suite.steps.map((s) => validateScenarioStepAgainstContext(ctx, s));
  const passCount = results.filter((r) => r.pass).length;
  return { suiteId: suite.id, results, passCount, total: results.length };
}

/** Lightweight card vs wizard check for activity list estimates. */
export function validateCardWizardAlignment(ctx: RentalWizardContext): {
  aligned: boolean;
  cardPhase: string;
  wizardPhase: string;
} {
  const cardPhase = estimateCanonicalPhaseFromRentalRow(ctx.rental);
  const wizardPhase = buildLifecycleInspectorSnapshot(ctx).canonical_phase;
  return {
    aligned: cardPhase === wizardPhase,
    cardPhase,
    wizardPhase,
  };
}

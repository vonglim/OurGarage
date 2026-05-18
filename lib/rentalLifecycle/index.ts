export {
  CANONICAL_LIFECYCLE_MAP,
  RESOLVER_PRIORITY,
  WIZARD_STEP_TO_CANONICAL,
  canonicalPhaseFromWizardStep,
  type CanonicalRentalPhase,
  type LifecyclePhaseDefinition,
} from '@/lib/rentalLifecycle/canonicalPhases';
export {
  estimateCanonicalPhaseFromRentalRow,
  type RentalRowLifecycleEstimateInput,
} from '@/lib/rentalLifecycle/estimatePhaseFromRentalRow';
export {
  estimateActivityCtaFromRentalRow,
  estimateActivityCtaFromWizardStep,
  resolveRentalCardStatusBadge,
  resolveRentalCardStatusBadgeFromPhase,
  type RentalCardStatusBadge,
} from '@/lib/rentalLifecycle/resolveActivityPresentation';
export {
  buildLifecycleInspectorSnapshot,
  formatLifecycleInspectorText,
  type LifecycleInspectorSnapshot,
} from '@/lib/rentalLifecycle/resolveLifecycleReasoning';
export {
  assertRentalLifecycleIntegrity,
  validateRentalLifecycle,
  validateRentalRowLight,
  type LifecycleValidationIssue,
} from '@/lib/rentalLifecycle/lifecycleTransitionValidator';
export { LIFECYCLE_NOTIFICATION_MATRIX } from '@/lib/rentalLifecycle/lifecycleNotificationMatrix';
export { CONFLICT_RESOLUTION_RULES } from '@/lib/rentalLifecycle/conflictResolution';
export {
  ALL_SCENARIO_SUITES,
  HAPPY_PATH_SUITE,
  type ScenarioSuite,
  type ScenarioStep,
} from '@/lib/rentalLifecycle/scenarioSuites';
export {
  validateCardWizardAlignment,
  validateScenarioStepAgainstContext,
  validateSuiteAgainstContext,
} from '@/lib/rentalLifecycle/scenarioAudit';
export { logScenario, type ScenarioLogChannel } from '@/lib/rentalLifecycle/scenarioDevLog';
export {
  getActiveRealtimeSubscriptionCount,
  registerRentalRealtimeSubscription,
  unregisterRentalRealtimeSubscription,
} from '@/lib/rentalLifecycle/realtimeSubscriptionRegistry';
export { useRentalWizardRealtimeSync } from '@/lib/rentalLifecycle/useRentalWizardRealtimeSync';
export {
  assertNoPhaseRegression,
  assertOperationalQueues,
  isOperationalQueueEligible,
} from '@/lib/rentalLifecycle/operationalIntegrity';

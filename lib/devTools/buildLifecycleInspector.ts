import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import {
  buildLifecycleInspectorSnapshot,
  formatLifecycleInspectorText,
  type LifecycleInspectorSnapshot,
} from '@/lib/rentalLifecycle/resolveLifecycleReasoning';
import { assertRentalLifecycleIntegrity } from '@/lib/rentalLifecycle/lifecycleTransitionValidator';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type LifecycleInspectorBundle = {
  snapshot: LifecycleInspectorSnapshot;
  validationIssueCount: number;
  text: string;
};

export function buildLifecycleInspectorBundle(ctx: RentalWizardContext): LifecycleInspectorBundle {
  const snapshot = buildLifecycleInspectorSnapshot(ctx);
  const issues = DEV_TOOLS_ENABLED ? assertRentalLifecycleIntegrity(ctx, 'dev-toolkit') : [];
  return {
    snapshot,
    validationIssueCount: issues.length,
    text: formatLifecycleInspectorText(snapshot),
  };
}

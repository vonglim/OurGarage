import { useEffect, useRef } from 'react';

import {
  buildReturnCoordinationSnapshot,
  evaluateReturnCoordinationAcceptedPrompt,
  logReturnCoordinationPromptDetection,
  type WizardReturnCoordinationSnapshot,
} from '@/lib/rentalWizard/wizardLifecyclePromptDetection';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

/**
 * DEV snapshot tracing on Coordinate Return — overlay is armed from realtime `accepted`
 * notifications (`wizardLifecyclePromptFromNotification`). This hook only logs snapshot deltas.
 */
export function useReturnCoordinationAcceptedPromptSnapshotTrace(
  ctx: RentalWizardContext,
  enabled: boolean
): void {
  const initializedRef = useRef(false);
  const prevRef = useRef<WizardReturnCoordinationSnapshot | null>(null);

  useEffect(() => {
    initializedRef.current = false;
    prevRef.current = null;
  }, [ctx.rentalId]);

  useEffect(() => {
    if (!enabled) return;

    const snap = buildReturnCoordinationSnapshot(ctx);

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevRef.current = snap;
      logReturnCoordinationPromptDetection(ctx.rentalId, 'coordinate_return_step_init', null, snap, {
        show: false,
        relaxed: false,
        reasons: ['initial_snapshot'],
      });
      return;
    }

    const prev = prevRef.current;
    const evaluation = evaluateReturnCoordinationAcceptedPrompt(prev, snap, ctx.viewerUserId);
    logReturnCoordinationPromptDetection(
      ctx.rentalId,
      'coordinate_return_step_ctx_change',
      prev,
      snap,
      evaluation,
      { note: 'step_hook_trace_only_layout_owns_trigger' }
    );

    prevRef.current = snap;
  }, [ctx, enabled]);
}

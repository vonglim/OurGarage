import { useEffect, useRef } from 'react';

import {
  buildCoordinationSnapshot,
  evaluatePickupCoordinationAcceptedPrompt,
  logPickupCoordinationPromptDetection,
  type WizardCoordinationSnapshot,
} from '@/lib/rentalWizard/wizardLifecyclePromptDetection';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

/**
 * DEV snapshot tracing on Coordinate Pickup — overlay is armed from realtime `accepted`
 * notifications (`wizardLifecyclePromptFromNotification`). This hook only logs snapshot deltas.
 */
export function usePickupCoordinationAcceptedPromptSnapshotTrace(
  ctx: RentalWizardContext,
  enabled: boolean
): void {
  const initializedRef = useRef(false);
  const prevRef = useRef<WizardCoordinationSnapshot | null>(null);

  useEffect(() => {
    initializedRef.current = false;
    prevRef.current = null;
  }, [ctx.rentalId]);

  useEffect(() => {
    if (!enabled) return;

    const snap = buildCoordinationSnapshot(ctx);

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevRef.current = snap;
      logPickupCoordinationPromptDetection(ctx.rentalId, 'coordinate_pickup_step_init', null, snap, {
        show: false,
        relaxed: false,
        reasons: ['initial_snapshot'],
      });
      return;
    }

    const prev = prevRef.current;
    const evaluation = evaluatePickupCoordinationAcceptedPrompt(prev, snap, ctx.viewerUserId);
    logPickupCoordinationPromptDetection(
      ctx.rentalId,
      'coordinate_pickup_step_ctx_change',
      prev,
      snap,
      evaluation,
      { note: 'step_hook_trace_only_layout_owns_trigger' }
    );

    prevRef.current = snap;
  }, [ctx, enabled]);
}

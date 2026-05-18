import type { SupabaseClient } from '@supabase/supabase-js';

import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { logRentalCancellation } from '@/lib/rentalCancellation/rentalCancellationDebug';
import { useDevToolsStore } from '@/store/devToolsStore';
import { useRentalSimulationStore } from '@/store/rentalSimulationStore';

/**
 * After cancellation is accepted: drop transient wizard/coordination state so the rental
 * cannot reopen into stale pickup/return screens. Preserves chat, agreement, meetup history.
 */
export async function purgeTransientRentalStateOnCancellationAccepted(
  supabase: SupabaseClient,
  rentalId: string
): Promise<void> {
  const id = rentalId.trim();
  if (!id) return;

  const { error: rentalErr } = await supabase
    .from('rentals')
    .update({
      last_proposed_by: null,
      pickup_operational_state: null,
      return_operational_state: null,
      handoff_approval_started_at: null,
    })
    .eq('id', id);

  if (rentalErr) {
    logRentalCancellation('rental transient clear failed', { rentalId: id, error: rentalErr.message });
  }

  const { error: wizardErr } = await supabase
    .from('rental_wizard_state')
    .update({
      seen_transition_keys: [],
      wizard_progress: {},
      last_seen_step: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('rental_id', id);

  if (wizardErr) {
    logRentalCancellation('wizard_state purge failed', { rentalId: id, error: wizardErr.message });
  }

  if (DEV_TOOLS_ENABLED) {
    useRentalSimulationStore.getState().clearSimulation();
    useDevToolsStore.getState().setRentalLifecycleOverride(null);
  }

  logRentalCancellation('transient state purged after accept', { rentalId: id });
}

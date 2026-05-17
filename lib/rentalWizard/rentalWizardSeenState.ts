import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';
import type {
  RentalWizardProgress,
  RentalWizardStep,
  RentalWizardTransitionKey,
} from '@/lib/rentalWizard/types';
import { transitionKeyForStep } from '@/lib/rentalWizard/rentalWizardTransitionResolver';

export type RentalWizardStateRow = {
  rental_id: string;
  user_id: string;
  last_seen_step: string | null;
  seen_transition_keys: string[] | null;
  wizard_progress: RentalWizardProgress | null;
  updated_at: string;
};

function parseSeenKeys(raw: unknown): Set<RentalWizardTransitionKey> {
  const out = new Set<RentalWizardTransitionKey>();
  if (!Array.isArray(raw)) return out;
  for (const k of raw) {
    if (typeof k === 'string' && k.trim()) out.add(k.trim() as RentalWizardTransitionKey);
  }
  return out;
}

function parseProgress(raw: unknown): RentalWizardProgress {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...(raw as RentalWizardProgress) };
}

export async function fetchRentalWizardState(
  supabase: SupabaseClient,
  rentalId: string,
  userId: string
): Promise<{
  seenTransitions: Set<RentalWizardTransitionKey>;
  wizardProgress: RentalWizardProgress;
  lastSeenStep: string | null;
}> {
  const { data, error } = await supabase
    .from('rental_wizard_state')
    .select('seen_transition_keys, wizard_progress, last_seen_step')
    .eq('rental_id', rentalId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error && __DEV__) {
    console.warn('[rental_wizard_state] fetch', error.message);
  }

  return {
    seenTransitions: parseSeenKeys(data?.seen_transition_keys),
    wizardProgress: parseProgress(data?.wizard_progress),
    lastSeenStep: typeof data?.last_seen_step === 'string' ? data.last_seen_step : null,
  };
}

export async function markWizardTransitionSeen(
  rentalId: string,
  userId: string,
  step: RentalWizardStep
): Promise<void> {
  const key = transitionKeyForStep(step);
  if (!key) return;
  await upsertWizardState(rentalId, userId, {
    appendSeenKey: key,
    lastSeenStep: step,
  });
}

export async function updateWizardProgress(
  rentalId: string,
  userId: string,
  patch: Partial<RentalWizardProgress>
): Promise<void> {
  const supabase = getSupabase();
  const current = await fetchRentalWizardState(supabase, rentalId, userId);
  await upsertWizardState(rentalId, userId, {
    wizardProgress: { ...current.wizardProgress, ...patch },
  });
}

export async function recordWizardStepSeen(
  rentalId: string,
  userId: string,
  step: RentalWizardStep
): Promise<void> {
  const key = transitionKeyForStep(step);
  await upsertWizardState(rentalId, userId, {
    lastSeenStep: step,
    appendSeenKey: key ?? undefined,
  });
}

async function upsertWizardState(
  rentalId: string,
  userId: string,
  input: {
    lastSeenStep?: RentalWizardStep;
    appendSeenKey?: RentalWizardTransitionKey;
    wizardProgress?: RentalWizardProgress;
  }
): Promise<void> {
  const supabase = getSupabase();
  const current = await fetchRentalWizardState(supabase, rentalId, userId);
  const seen = new Set(current.seenTransitions);
  if (input.appendSeenKey) seen.add(input.appendSeenKey);

  const row = {
    rental_id: rentalId,
    user_id: userId,
    last_seen_step: input.lastSeenStep ?? current.lastSeenStep,
    seen_transition_keys: [...seen],
    wizard_progress: input.wizardProgress ?? current.wizardProgress,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('rental_wizard_state').upsert(row, {
    onConflict: 'rental_id,user_id',
  });
  if (error && __DEV__) {
    console.warn('[rental_wizard_state] upsert', error.message);
  }
}

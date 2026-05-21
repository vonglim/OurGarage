import type { SupabaseClient } from '@supabase/supabase-js';

import { getEffectiveNowMs } from '@/lib/rentalSimulation/simulationClock';
import { getSupabase } from '@/lib/supabase';

export type RentalOperationalState = 'missed_confirmation' | 'running_late' | 'no_show_reported';

export type OperationalReportType = 'pickup_no_show' | 'return_no_show' | 'missed_meetup' | 'operational_issue';

const MEETUP_GRACE_MS = 30 * 60 * 1000;

export function parseScheduleMs(iso: string | null | undefined): number | null {
  if (iso == null || String(iso).trim() === '') return null;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : null;
}

export function isSchedulePastWithGrace(iso: string | null | undefined, nowMs = getEffectiveNowMs()): boolean {
  const t = parseScheduleMs(iso);
  if (t == null) return false;
  return nowMs > t + MEETUP_GRACE_MS;
}

/** True only when both parties confirmed pickup verification (or renter sign-off recorded). */
export function isPickupHandoffBilaterallyComplete(input: {
  pickupAck: { owner: boolean; renter: boolean };
  signedAt?: string | null;
}): boolean {
  if (input.pickupAck.owner && input.pickupAck.renter) return true;
  return Boolean(input.signedAt && String(input.signedAt).trim() !== '');
}

export function isReturnBilaterallyComplete(returnAck: { owner: boolean; renter: boolean }): boolean {
  return returnAck.owner && returnAck.renter;
}

export function isRentalPastPickupPhase(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return ['handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled'].includes(s);
}

export function shouldFlagPickupMissedConfirmation(input: {
  meetupCoordinationComplete: boolean;
  lifecyclePhase: 'pickup' | 'active' | 'return' | 'completed';
  pickupHandoffComplete: boolean;
  pickupIso: string | null | undefined;
  pickupOperationalState: string | null | undefined;
  nowMs?: number;
}): boolean {
  if (!input.meetupCoordinationComplete) return false;
  if (input.lifecyclePhase !== 'pickup') return false;
  if (input.pickupHandoffComplete) return false;
  if (input.pickupOperationalState === 'running_late' || input.pickupOperationalState === 'no_show_reported') {
    return false;
  }
  return isSchedulePastWithGrace(input.pickupIso, input.nowMs);
}

export function shouldFlagReturnMissedConfirmation(input: {
  handoffComplete: boolean;
  lifecyclePhase: 'pickup' | 'active' | 'return' | 'completed';
  returnHandoffComplete: boolean;
  returnIso: string | null | undefined;
  returnOperationalState: string | null | undefined;
  nowMs?: number;
}): boolean {
  if (!input.handoffComplete) return false;
  if (input.lifecyclePhase !== 'active' && input.lifecyclePhase !== 'return') return false;
  if (input.returnHandoffComplete) return false;
  if (input.returnOperationalState === 'running_late' || input.returnOperationalState === 'no_show_reported') {
    return false;
  }
  return isSchedulePastWithGrace(input.returnIso, input.nowMs);
}

export async function setRentalOperationalState(
  supabase: SupabaseClient,
  rentalId: string,
  phase: 'pickup' | 'return',
  state: RentalOperationalState | null
): Promise<{ ok: boolean; message?: string }> {
  const col = phase === 'pickup' ? 'pickup_operational_state' : 'return_operational_state';
  const { error } = await supabase.from('rentals').update({ [col]: state }).eq('id', rentalId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function insertOperationalReport(input: {
  rentalId: string;
  reporterId: string;
  targetUserId: string;
  reportType: OperationalReportType;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = getSupabase();
  const { error } = await supabase.from('user_operational_reports').insert({
    rental_id: input.rentalId,
    reporter_id: input.reporterId,
    target_user_id: input.targetUserId,
    report_type: input.reportType,
  });
  if (error) return { ok: false, message: error.message };

  const { data: prof } = await supabase
    .from('profiles')
    .select('operational_report_count')
    .eq('id', input.targetUserId)
    .maybeSingle();
  const prev =
    typeof prof?.operational_report_count === 'number' && Number.isFinite(prof.operational_report_count)
      ? prof.operational_report_count
      : 0;
  await supabase
    .from('profiles')
    .update({ operational_report_count: prev + 1 })
    .eq('id', input.targetUserId);

  return { ok: true };
}

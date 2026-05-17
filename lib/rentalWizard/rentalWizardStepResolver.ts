import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { deriveLifecyclePhaseFromRentalStatus } from '@/lib/rentalLifecyclePhase';
import { getEffectiveNowMs } from '@/lib/rentalSimulation/simulationClock';
import {
  isPickupHandoffBilaterallyComplete,
  isReturnBilaterallyComplete,
} from '@/lib/rentalOperationalAttention';
import { resolveWizardTransitionBefore } from '@/lib/rentalWizard/rentalWizardTransitionResolver';
import type { RentalWizardContext, RentalWizardDestination, RentalWizardStep } from '@/lib/rentalWizard/types';
import { WIZARD_STEP_META, wizardPathForStep } from '@/lib/rentalWizard/wizardStepMeta';
import { getDevLocalWizardProgress, getDevWizardStepOverride } from '@/store/rentalSimulationStore';

function hasReturnSchedule(ctx: RentalWizardContext): boolean {
  const r = ctx.rental;
  return Boolean(
    (r.agreed_return_datetime && String(r.agreed_return_datetime).trim()) ||
      (r.return_datetime && String(r.return_datetime).trim()) ||
      (r.return_time && String(r.return_time).trim())
  );
}

function hasPickupSchedule(ctx: RentalWizardContext): boolean {
  const r = ctx.rental;
  return Boolean(
    (r.agreed_pickup_datetime && String(r.agreed_pickup_datetime).trim()) ||
      (r.pickup_datetime && String(r.pickup_datetime).trim()) ||
      (r.meetup_time && String(r.meetup_time).trim())
  );
}

/** Core step from existing rental lifecycle (source of truth). */
export function resolveLogicalWizardStep(ctx: RentalWizardContext): RentalWizardStep {
  const st = String(ctx.rental.status ?? 'pending').trim().toLowerCase();
  const phase = ctx.lifecyclePhase;

  if (phase === 'completed' || st === 'returned' || st === 'completed') {
    return 'leave_review';
  }

  if (phase === 'return' || st === 'return_pending') {
    if (ctx.returnHandoffComplete) return 'leave_review';
    if (ctx.wizardProgress.renter_return_im_here_at) {
      if (ctx.returnAck.owner) return 'return_handoff';
      return 'owner_notified';
    }
    return 'prepare_return';
  }

  if (phase === 'active' || st === 'handed_off' || st === 'active') {
    return 'active_rental';
  }

  if (!ctx.meetingCompleted) {
    if (hasPickupSchedule(ctx) && !hasReturnSchedule(ctx)) return 'coordinate_return';
    return 'coordinate_pickup';
  }

  if (!ctx.pickupHandoffComplete) {
    const signed = Boolean(ctx.rental.signed_at && String(ctx.rental.signed_at).trim());
    if (signed || ctx.rental.handoff_approved_by_renter) return 'equipment_confirmation';
    if (ctx.rental.handoff_approval_started_at && ctx.wizardProgress.renter_pickup_im_here_at) {
      return 'owner_confirmed_arrival';
    }
    if (
      ctx.wizardProgress.renter_pickup_im_here_at &&
      (ctx.rental.handoff_approval_started_at || ctx.rental.handoff_approved_by_owner)
    ) {
      return 'owner_confirmed_arrival';
    }
    if (ctx.wizardProgress.renter_pickup_im_here_at) return 'owner_confirmed_arrival';
    if (ctx.ownerPickupPhotoCount > 0) {
      if (ctx.pickupAck.renter || ctx.wizardProgress.renter_approved_pickup_photos_at) {
        return 'meetup_day';
      }
      return 'prepare_pickup';
    }
    return 'prepare_pickup';
  }

  return 'active_rental';
}

function mergeDevWizardContext(ctx: RentalWizardContext): RentalWizardContext {
  if (!DEV_TOOLS_ENABLED) return ctx;
  const local = getDevLocalWizardProgress();
  if (Object.keys(local).length === 0) return ctx;
  return { ...ctx, wizardProgress: { ...ctx.wizardProgress, ...local } };
}

export function resolveRentalWizardDestination(
  ctx: RentalWizardContext,
  nowMs = getEffectiveNowMs()
): RentalWizardDestination {
  const merged = mergeDevWizardContext(ctx);
  const stepOverride = DEV_TOOLS_ENABLED ? getDevWizardStepOverride() : null;
  if (stepOverride) {
    const meta = WIZARD_STEP_META[stepOverride];
    return {
      step: stepOverride,
      ctaLabel: meta.ctaLabel,
      path: wizardPathForStep(ctx.rentalId, stepOverride),
    };
  }
  const logical = resolveLogicalWizardStep(merged);
  const transition = resolveWizardTransitionBefore(logical, merged, nowMs);
  const step = transition ?? logical;
  const meta = WIZARD_STEP_META[step];
  return {
    step,
    ctaLabel: meta.ctaLabel,
    path: wizardPathForStep(ctx.rentalId, step),
  };
}

/** Lightweight label for activity list cards (no wizard_state fetch). */
export function estimateWizardCtaLabelFromRentalRow(input: {
  status?: string | null;
  agreement_status?: string | null;
  last_proposed_by?: string | null;
  agreed_pickup_datetime?: string | null;
  agreed_return_datetime?: string | null;
  signed_at?: string | null;
}): string {
  const st = String(input.status ?? 'pending').trim().toLowerCase();
  const phase = deriveLifecyclePhaseFromRentalStatus(st);
  const pending =
    input.agreement_status === 'pending' && String(input.last_proposed_by ?? '').trim().length > 0;
  const meetingDone = input.agreement_status === 'confirmed' && !pending;

  if (phase === 'completed' || st === 'returned') return 'Leave review';
  if (phase === 'return' || st === 'return_pending') return 'Prepare for return';
  if (phase === 'active' || st === 'handed_off') {
    if (input.signed_at) return 'Enjoy your rental';
    return 'Meetup day';
  }
  if (!meetingDone) {
    if (input.agreed_pickup_datetime && !input.agreed_return_datetime) return 'Coordinate return';
    return 'Coordinate pickup';
  }
  return 'Prepare for pickup';
}

export function buildRentalWizardContextFlags(rental: RentalWizardContext['rental']) {
  const ownerConfirmed =
    typeof rental.owner_confirmed === 'boolean'
      ? rental.owner_confirmed
      : Boolean(rental.confirmed_by_owner);
  const renterConfirmed =
    typeof rental.renter_confirmed === 'boolean'
      ? rental.renter_confirmed
      : Boolean(rental.confirmed_by_renter);
  const agreementStatus =
    rental.agreement_status === 'confirmed'
      ? 'confirmed'
      : rental.agreement_status === 'pending'
        ? 'pending'
        : ownerConfirmed && renterConfirmed
          ? 'confirmed'
          : 'pending';
  const hasPendingProposal =
    agreementStatus === 'pending' && String(rental.last_proposed_by ?? '').trim().length > 0;
  const meetingCompleted = agreementStatus === 'confirmed' && !hasPendingProposal;
  return { agreementStatus, hasPendingProposal, meetingCompleted };
}

export { isPickupHandoffBilaterallyComplete, isReturnBilaterallyComplete };

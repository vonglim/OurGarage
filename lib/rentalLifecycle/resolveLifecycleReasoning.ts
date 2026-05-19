import { isRentalCancelled, isCancellationRequested } from '@/lib/rentalCancellation';
import {
  canonicalPhaseFromWizardStep,
  type CanonicalRentalPhase,
} from '@/lib/rentalLifecycle/canonicalPhases';
import { estimateCanonicalPhaseFromRentalRow } from '@/lib/rentalLifecycle/estimatePhaseFromRentalRow';
import {
  canShowWizardActiveRental,
  isMeetupCoordinationComplete,
  isPickupCoordinationComplete,
  isWizardReturnPhase,
} from '@/lib/rentalWizard/rentalWizardGates';
import {
  resolveLogicalWizardStep,
  resolveRentalWizardDestination,
} from '@/lib/rentalWizard/rentalWizardStepResolver';
import { resolveWizardTransitionBefore } from '@/lib/rentalWizard/rentalWizardTransitionResolver';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type LifecycleInspectorSnapshot = {
  rentalId: string;
  rental_status: string;
  agreement_status: string;
  cancellation_status: string;
  logical_wizard_step: string;
  transition_step: string | null;
  effective_wizard_step: string;
  canonical_phase: CanonicalRentalPhase;
  estimated_card_phase: CanonicalRentalPhase;
  card_wizard_phase_mismatch: boolean;
  last_proposed_by: string | null;
  agreed_pickup_datetime: string | null;
  meetup_location: string | null;
  pickup_return_coordination_ack_at: string | null;
  pickup_handoff_complete: boolean;
  return_handoff_complete: boolean;
  seen_transitions: string[];
  reasoning: string[];
};

function buildReasoningLines(ctx: RentalWizardContext, logical: string, transition: string | null): string[] {
  const lines: string[] = [];
  const r = ctx.rental;

  if (isRentalCancelled(r)) {
    lines.push('PRIORITY: rental is cancelled → cancelled_summary (overrides DEV overrides).');
    return lines;
  }
  if (isCancellationRequested(r)) {
    lines.push('cancellation_status=requested — wizard continues; banner shown until accepted/declined.');
  }

  const st = String(r.status ?? '').trim().toLowerCase();
  if (st === 'returned' || st === 'completed') {
    lines.push(`rentals.status=${st} → leave_review.`);
    return lines;
  }

  if (isWizardReturnPhase(ctx)) {
    lines.push('status=return_pending → return phase steps.');
    if (ctx.returnHandoffComplete) lines.push('returnHandoffComplete → leave_review.');
    else if (ctx.wizardProgress.renter_return_im_here_at) {
      lines.push('renter_return_im_here_at set → owner_notified or return_handoff.');
    } else {
      lines.push('→ prepare_return.');
    }
    return lines;
  }

  if (canShowWizardActiveRental(ctx)) {
    lines.push('pickupHandoffComplete + meetup coordination complete → active_rental.');
    if (transition) lines.push(`transition overlay: ${transition}`);
    return lines;
  }

  if (!ctx.seenTransitions.has('rental_confirmed_seen') && !isPickupCoordinationComplete(ctx)) {
    lines.push('!rental_confirmed_seen → transition_rental_confirmed (before coordinate_pickup).');
    if (transition) lines.push(`transition overlay: ${transition}`);
    return lines;
  }

  if (!isPickupCoordinationComplete(ctx)) {
    lines.push('!isPickupCoordinationComplete → coordinate_pickup.');
    if (!r.agreed_pickup_datetime?.trim()) lines.push('  missing agreed_pickup_datetime.');
    if (!r.meetup_location?.trim()) lines.push('  missing meetup_location.');
    return lines;
  }

  if (!isMeetupCoordinationComplete(ctx)) {
    lines.push('pickup OK but !isMeetupCoordinationComplete → coordinate_return.');
    if (!ctx.wizardProgress.pickup_return_coordination_ack_at?.trim()) {
      lines.push('  missing pickup_return_coordination_ack_at.');
    }
    if (!ctx.seenTransitions.has('pickup_confirmed_seen')) {
      lines.push('  missing seen transition pickup_confirmed_seen.');
    }
    return lines;
  }

  if (!ctx.pickupHandoffComplete) {
    lines.push('coordination complete, pickup handoff incomplete → pickup prep branch.');
    if (ctx.ownerPickupPhotoCount > 0) {
      lines.push(`owner photos=${ctx.ownerPickupPhotoCount}.`);
    }
    if (ctx.wizardProgress.renter_pickup_im_here_at) {
      lines.push("renter_pickup_im_here_at → owner_confirmed_arrival path.");
    }
    if (r.signed_at?.trim()) lines.push('signed_at → equipment_confirmation.');
    lines.push(`resolved logical step: ${logical}.`);
    if (transition) lines.push(`transition overlay: ${transition}.`);
    return lines;
  }

  lines.push(`fallback logical step: ${logical}.`);
  if (transition) lines.push(`transition overlay: ${transition}.`);
  return lines;
}

export function buildLifecycleInspectorSnapshot(ctx: RentalWizardContext): LifecycleInspectorSnapshot {
  const logical = resolveLogicalWizardStep(ctx);
  const transition = resolveWizardTransitionBefore(logical, ctx);
  const dest = resolveRentalWizardDestination(ctx);
  const estimatedCard = estimateCanonicalPhaseFromRentalRow(ctx.rental);
  const canonical = canonicalPhaseFromWizardStep(dest.step);

  return {
    rentalId: ctx.rentalId,
    rental_status: String(ctx.rental.status ?? ''),
    agreement_status: String(ctx.rental.agreement_status ?? ''),
    cancellation_status: String(ctx.rental.cancellation_status ?? 'none'),
    logical_wizard_step: logical,
    transition_step: transition,
    effective_wizard_step: dest.step,
    canonical_phase: canonical,
    estimated_card_phase: estimatedCard,
    card_wizard_phase_mismatch: estimatedCard !== canonical,
    last_proposed_by: ctx.rental.last_proposed_by ?? null,
    agreed_pickup_datetime: ctx.rental.agreed_pickup_datetime ?? null,
    meetup_location: ctx.rental.meetup_location ?? null,
    pickup_return_coordination_ack_at: ctx.wizardProgress.pickup_return_coordination_ack_at ?? null,
    pickup_handoff_complete: ctx.pickupHandoffComplete,
    return_handoff_complete: ctx.returnHandoffComplete,
    seen_transitions: [...ctx.seenTransitions],
    reasoning: buildReasoningLines(ctx, logical, transition),
  };
}

export function formatLifecycleInspectorText(snapshot: LifecycleInspectorSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

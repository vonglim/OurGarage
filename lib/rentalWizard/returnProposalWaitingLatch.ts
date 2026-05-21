import {
  reconcileOperationalPickupIso,
  reconcileOperationalReturnIso,
} from '@/lib/rentalWizard/proposedMeetupSchedule';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type ReturnProposalWaitingLatch = {
  viewerUserId: string;
  /** Set when viewer enters waiting-on-return-proposal while on coordinate_return. */
  sinceMs: number;
};

const latches = new Map<string, ReturnProposalWaitingLatch>();

export function syncReturnProposalWaitingLatch(input: {
  rentalId: string;
  viewerUserId: string;
  onCoordinateReturn: boolean;
  hasPendingProposal: boolean;
  lastProposedBy: string | null;
  pickupConfirmedSeen: boolean;
  returnConfirmedSeen: boolean;
}): void {
  const rentalId = input.rentalId.trim();
  const viewer = input.viewerUserId.trim();
  if (!rentalId || !viewer) return;

  if (!input.onCoordinateReturn || input.returnConfirmedSeen || !input.pickupConfirmedSeen) {
    latches.delete(rentalId);
    return;
  }

  const activelyWaiting =
    input.hasPendingProposal && String(input.lastProposedBy ?? '').trim() === viewer;
  if (activelyWaiting) {
    if (!latches.has(rentalId)) {
      latches.set(rentalId, { viewerUserId: viewer, sinceMs: Date.now() });
    }
    return;
  }

  // Keep latch through accept race: rental refresh clears pending before notification arrives.
}

export function hasReturnProposalWaitingLatch(rentalId: string, viewerUserId: string): boolean {
  const latch = latches.get(rentalId.trim());
  return latch?.viewerUserId === viewerUserId.trim();
}

export function clearReturnProposalWaitingLatch(rentalId: string): void {
  latches.delete(rentalId.trim());
}

export function buildReturnPromptWaitingSnapshot(input: {
  ctx: RentalWizardContext | null;
  onCoordinateReturn: boolean;
  latchActive: boolean;
}): Record<string, unknown> {
  const ctx = input.ctx;
  if (!ctx) {
    return {
      hasCtx: false,
      onCoordinateReturn: input.onCoordinateReturn,
      returnWaitingLatchActive: input.latchActive,
    };
  }

  const returnReconciled = reconcileOperationalReturnIso(ctx.rental);
  const pickupReconciled = reconcileOperationalPickupIso(ctx.rental);

  return {
    hasCtx: true,
    rentalId: ctx.rentalId,
    viewerUserId: ctx.viewerUserId,
    onCoordinateReturn: input.onCoordinateReturn,
    currentWizardStep: input.onCoordinateReturn ? 'coordinate_return' : 'other',
    hasPendingProposal: ctx.hasPendingProposal,
    last_proposed_by: ctx.rental.last_proposed_by ?? null,
    agreement_status: ctx.rental.agreement_status ?? null,
    return_confirmed_seen: ctx.seenTransitions.has('return_confirmed_seen'),
    pickup_confirmed_seen: ctx.seenTransitions.has('pickup_confirmed_seen'),
    pendingReturnProposalIso: returnReconciled.iso,
    pendingPickupProposalIso: pickupReconciled.iso,
    renderedReturnIso: ctx.returnIso,
    renderedPickupIso: ctx.pickupIso,
    returnWaitingLatchActive: input.latchActive,
    meetingCompleted: ctx.meetingCompleted,
  };
}

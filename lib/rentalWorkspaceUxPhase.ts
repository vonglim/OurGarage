import type { RentalWorkspaceStage } from '@/lib/rentalLifecyclePhase';

/** User-facing lifecycle bucket for Rental Workspace copy and badges (UI only). */
export type RentalWorkspaceUxPhase =
  | 'REQUEST_PENDING'
  | 'APPROVED'
  | 'PICKUP_READY'
  | 'ACTIVE'
  | 'RETURN_PENDING'
  | 'COMPLETED'
  | 'DECLINED'
  | 'CANCELLED';

export function deriveRentalWorkspaceUxPhase(input: {
  rentalStatus: string;
  workspaceStage: RentalWorkspaceStage;
}): RentalWorkspaceUxPhase {
  const s = String(input.rentalStatus ?? 'pending').trim().toLowerCase();
  if (s === 'cancelled') return 'CANCELLED';
  if (s === 'declined') return 'DECLINED';
  if (s === 'pending') return 'REQUEST_PENDING';
  if (input.workspaceStage === 'completed') return 'COMPLETED';
  if (input.workspaceStage === 'return') return 'RETURN_PENDING';
  if (input.workspaceStage === 'active') return 'ACTIVE';
  if (input.workspaceStage === 'pickup_prep') return 'PICKUP_READY';
  return 'APPROVED';
}

export function rentalWorkspaceUxPhaseBadgeLabel(phase: RentalWorkspaceUxPhase): string {
  switch (phase) {
    case 'REQUEST_PENDING':
      return 'Pending';
    case 'APPROVED':
      return 'Approved';
    case 'PICKUP_READY':
      return 'Pickup ready';
    case 'ACTIVE':
      return 'Active';
    case 'RETURN_PENDING':
      return 'Return';
    case 'COMPLETED':
      return 'Complete';
    case 'DECLINED':
      return 'Declined';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return 'Rental';
  }
}

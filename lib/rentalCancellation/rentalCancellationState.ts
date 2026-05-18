import type { RentalCancellationFields, RentalCancellationStatus } from '@/lib/rentalCancellation/types';
import {
  cancellationRequestedByOther,
  cancellationRequestedByViewer,
  isCancellationDeclined,
  isCancellationRequested,
  isRentalCancelled,
} from '@/lib/rentalCancellation/rentalCancellationGates';

/** Map legacy DB values from earlier migrations. */
export function normalizeCancellationStatus(raw: unknown): RentalCancellationStatus {
  const s = String(raw ?? 'none').trim().toLowerCase();
  if (s === 'requested' || s === 'declined' || s === 'cancelled') return s;
  if (s === 'accepted' || s === 'completed') return 'cancelled';
  return 'none';
}

export { isRentalCancelled, isCancellationRequested, isCancellationDeclined };
export { cancellationRequestedByOther, cancellationRequestedByViewer };

export type CancellationBadge = {
  label: string;
  tone: 'neutral' | 'warning' | 'danger' | 'muted';
};

export function cancellationBadgeForRow(
  row: RentalCancellationFields,
  viewerUserId: string
): CancellationBadge | null {
  if (isRentalCancelled(row)) {
    return { label: 'Cancelled', tone: 'danger' };
  }
  if (isCancellationRequested(row)) {
    return { label: 'Cancellation requested', tone: 'warning' };
  }
  if (isCancellationDeclined(row)) {
    return { label: 'Cancellation declined', tone: 'muted' };
  }
  return null;
}

import { countOffersForRequest } from '@/store/offersStore';
import { getEffectiveRentalStatus, type RentalStatus } from '@/store/requestsStore';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function lifetimeMsForWhen(when: string | null | undefined): number {
  if (when === 'Today') return 1 * MS_PER_DAY;
  if (when === 'This Weekend') return 3 * MS_PER_DAY;
  if (when === 'Flexible') return 7 * MS_PER_DAY;
  return 7 * MS_PER_DAY;
}

function isRequestExpired(req: { timestamp?: number | null; when?: string | null }): boolean {
  if (req.timestamp == null) return true;
  return Date.now() >= req.timestamp + lifetimeMsForWhen(req.when);
}

export type RequestCardUiStatusKey =
  | 'open'
  | 'pending'
  | 'matched'
  | 'completed'
  | 'active'
  | 'archived';

export type RequestCardUiStatus = {
  key: RequestCardUiStatusKey;
  label: string;
  dotColor: string;
};

const STATUS: Record<
  RequestCardUiStatusKey,
  { label: string; dotColor: string }
> = {
  open: { label: 'Open', dotColor: '#2E7D32' },
  pending: { label: 'Pending', dotColor: '#F9A825' },
  matched: { label: 'Matched', dotColor: '#F9A825' },
  completed: { label: 'Completed', dotColor: '#C62828' },
  active: { label: 'Active', dotColor: '#1565C0' },
  archived: { label: 'Archived', dotColor: '#9E9E9E' },
};

/**
 * Maps stored request + offers + expiry to a compact card status.
 * Uses `rentalStatus` when set; otherwise infers from legacy fields.
 */
export function getRequestCardUiStatus(req: {
  matched?: boolean;
  rentalStart?: number | null;
  rentalStatus?: RentalStatus;
  fulfilled?: boolean;
  timestamp?: number | null;
  when?: string | null;
}): RequestCardUiStatus {
  const life = getEffectiveRentalStatus(req);
  if (life === 'completed') {
    return { key: 'completed', ...STATUS.completed };
  }
  if (life === 'active') {
    return { key: 'active', ...STATUS.active };
  }
  if (life === 'matched') {
    return { key: 'matched', ...STATUS.matched };
  }
  if (isRequestExpired(req)) {
    return { key: 'archived', ...STATUS.archived };
  }
  const ts = req.timestamp;
  if (ts != null && countOffersForRequest(ts) > 0) {
    return { key: 'pending', ...STATUS.pending };
  }
  return { key: 'open', ...STATUS.open };
}

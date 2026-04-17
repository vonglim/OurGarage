import { countOffersForRequest } from '../store/offersStore';

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

export type RequestCardUiStatusKey = 'open' | 'pending' | 'completed' | 'archived';

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
  completed: { label: 'Completed', dotColor: '#C62828' },
  archived: { label: 'Archived', dotColor: '#9E9E9E' },
};

/**
 * Maps stored request + offers + expiry to a compact card status.
 * - Completed (red): matched
 * - Archived (gray): not matched and past listing lifetime
 * - Pending (yellow): active listing with at least one offer
 * - Open (green): active listing, no offers yet
 */
export function getRequestCardUiStatus(req: {
  matched?: boolean;
  timestamp?: number | null;
  when?: string | null;
}): RequestCardUiStatus {
  if (req.matched) {
    return { key: 'completed', ...STATUS.completed };
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

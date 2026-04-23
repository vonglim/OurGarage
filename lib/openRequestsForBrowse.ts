import { milesFromViewerToRequest } from './requestDistance';
import { getEffectiveRentalStatus } from '@/store/requestsStore';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function lifetimeMsForWhen(when: string | null | undefined): number {
  if (when === 'Today') return 1 * MS_PER_DAY;
  if (when === 'This Weekend') return 3 * MS_PER_DAY;
  if (when === 'Flexible') return 7 * MS_PER_DAY;
  return 7 * MS_PER_DAY;
}

function isRequestExpired(req: {
  timestamp?: number | null;
  when?: string | null;
  expiresAt?: number | null;
}): boolean {
  const rawExp = req.expiresAt;
  if (rawExp != null) {
    const exp = typeof rawExp === 'number' ? rawExp : Number(String(rawExp).trim());
    if (Number.isFinite(exp) && exp > 0 && Date.now() >= exp) {
      return true;
    }
  }
  if (req.timestamp == null) return true;
  const ts = Number(req.timestamp);
  if (!Number.isFinite(ts)) return true;
  return Date.now() >= ts + lifetimeMsForWhen(req.when);
}

/** Open requests visible on Browse (pending, not expired, optional listing `status`). */
export function isRequestActiveForBrowse(req: unknown): boolean {
  if (!req || typeof req !== 'object') return false;
  const r = req as {
    matched?: boolean;
    timestamp?: number;
    when?: string | null;
    expiresAt?: number | null;
    status?: string | null | number;
  };
  const rawSt = r.status;
  if (rawSt != null && String(rawSt).trim() !== '') {
    const st = String(rawSt).toLowerCase();
    if (st !== 'active' && st !== 'open' && st !== 'pending') return false;
  }
  if (isRequestExpired(r)) return false;
  return getEffectiveRentalStatus(r as Parameters<typeof getEffectiveRentalStatus>[0]) === 'pending';
}

export function distanceSortKeyRequest(req: unknown): number {
  const mi = milesFromViewerToRequest(req as Parameters<typeof milesFromViewerToRequest>[0]);
  return mi != null && Number.isFinite(mi) ? mi : Number.POSITIVE_INFINITY;
}

/** Nearest-first among open browse requests. */
export function listOpenRequestsSortedByDistance(requests: unknown[]): unknown[] {
  const active = requests.filter(isRequestActiveForBrowse);
  return [...active].sort((a, b) => distanceSortKeyRequest(a) - distanceSortKeyRequest(b));
}

import type { UnifiedRentalRow } from '@/lib/fetchUnifiedRentalsForUser';
import { unifiedRentalTitle } from '@/lib/fetchUnifiedRentalsForUser';

const DAY_MS = 24 * 60 * 60 * 1000;

type PriorityBucket = 1 | 2 | 3 | 4;

export type HomeActiveRentalCardModel = {
  rentalId: string;
  sectionLabel: 'Active rental' | 'Rental in progress';
  equipmentTitle: string;
  primaryLine: string;
  detailLine: string | null;
};

function normStatus(row: UnifiedRentalRow): string {
  return String(row.status ?? '').trim().toLowerCase();
}

function isTerminalRentalRow(row: UnifiedRentalRow): boolean {
  const s = normStatus(row);
  return s === 'returned' || s === 'completed' || s === 'cancelled' || s === 'canceled';
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function allConfirmed(row: UnifiedRentalRow): boolean {
  return row.owner_confirmed === true && row.renter_confirmed === true;
}

function agreementAwaiting(row: UnifiedRentalRow): boolean {
  const a = String(row.agreement_status ?? '').trim().toLowerCase();
  return a === 'pending' || !allConfirmed(row);
}

function isEquipmentOut(status: string): boolean {
  return status === 'active' || status === 'handed_off' || status === 'return_pending';
}

function isReturnDueSoonOrOverdue(returnMs: number | null, now: number): boolean {
  if (returnMs == null) return false;
  return returnMs - now <= 2 * DAY_MS;
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function calendarDayDiff(targetMs: number, nowMs: number): number {
  const t = new Date(targetMs);
  const n = new Date(nowMs);
  return Math.round((startOfLocalDay(t) - startOfLocalDay(n)) / DAY_MS);
}

function formatHomeDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} • ${timePart}`;
}

function formatReturnPrimaryLine(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayDiff = calendarDayDiff(t, now);
  if (dayDiff < 0) return `Return overdue • ${timePart}`;
  if (dayDiff === 0) return `Return due today • ${timePart}`;
  if (dayDiff === 1) return `Return due tomorrow • ${timePart}`;
  const datePart = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `Return due ${datePart} • ${timePart}`;
}

function meetupPrimaryLine(row: UnifiedRentalRow, viewerUserId: string): string {
  const me = viewerUserId.trim();
  const lastProposer = String(row.last_proposed_by ?? '').trim();
  if (me && lastProposer && lastProposer === me) {
    return 'Waiting for their confirmation';
  }
  if (me && lastProposer && lastProposer !== me) {
    return 'Respond to the meetup proposal';
  }
  return 'Awaiting meetup confirmation';
}

function pickupPrimaryLine(pickupMs: number, now: number): string {
  const dayDiff = calendarDayDiff(pickupMs, now);
  if (dayDiff < 0) return 'Pickup time passed — open to coordinate';
  if (dayDiff === 0) return 'Pickup today';
  if (dayDiff === 1) return 'Pickup tomorrow';
  if (dayDiff <= 7) return 'Pickup coming up';
  return 'Pickup scheduled';
}

type Scored = {
  row: UnifiedRentalRow;
  bucket: PriorityBucket;
  /** Lower sorts earlier within the same bucket. */
  tie1: number;
  tie2: number;
};

function scoreRow(row: UnifiedRentalRow, viewerUserId: string, now: number): Scored | null {
  if (isTerminalRentalRow(row)) return null;

  const status = normStatus(row);
  const pickupMs = parseMs(row.pickup_datetime);
  const returnMs = parseMs(row.return_datetime);
  const createdMs = parseMs(row.created_at) ?? 0;

  if (agreementAwaiting(row)) {
    const tProposal = parseMs(row.proposal_updated_at);
    const tie2 = -(tProposal ?? createdMs);
    const tie1 = pickupMs != null ? pickupMs : Number.MAX_SAFE_INTEGER;
    return { row, bucket: 1, tie1, tie2 };
  }

  if (isEquipmentOut(status) && isReturnDueSoonOrOverdue(returnMs, now)) {
    const tie1 = returnMs != null ? returnMs - now : 0;
    return { row, bucket: 3, tie1, tie2: createdMs };
  }

  if (!isEquipmentOut(status)) {
    const tie1 = pickupMs != null ? pickupMs : Number.MAX_SAFE_INTEGER;
    return { row, bucket: 2, tie1, tie2: createdMs };
  }

  const tie1 = returnMs != null ? returnMs : Number.MAX_SAFE_INTEGER;
  return { row, bucket: 4, tie1, tie2: createdMs };
}

function compareScored(a: Scored, b: Scored): number {
  if (a.bucket !== b.bucket) return a.bucket - b.bucket;
  if (a.bucket === 1) {
    if (a.tie1 !== b.tie1) return a.tie1 - b.tie1;
    return a.tie2 - b.tie2;
  }
  if (a.tie1 !== b.tie1) return a.tie1 - b.tie1;
  return a.tie2 - b.tie2;
}

function buildModel(row: UnifiedRentalRow, viewerUserId: string, bucket: PriorityBucket, now: number): HomeActiveRentalCardModel {
  const equipmentTitle = unifiedRentalTitle(row);
  const pickupMs = parseMs(row.pickup_datetime);
  const pickupFmt = formatHomeDateTime(row.pickup_datetime);

  if (bucket === 1) {
    return {
      rentalId: row.id,
      sectionLabel: 'Active rental',
      equipmentTitle,
      primaryLine: meetupPrimaryLine(row, viewerUserId),
      detailLine: pickupFmt ? `Pickup:\n${pickupFmt}` : null,
    };
  }

  if (bucket === 2) {
    const primary =
      pickupMs != null ? pickupPrimaryLine(pickupMs, now) : 'Coordinate your pickup in the workspace';
    return {
      rentalId: row.id,
      sectionLabel: 'Active rental',
      equipmentTitle,
      primaryLine: primary,
      detailLine: pickupFmt ? `Pickup:\n${pickupFmt}` : null,
    };
  }

  if (bucket === 3) {
    const retLine = formatReturnPrimaryLine(row.return_datetime, now);
    return {
      rentalId: row.id,
      sectionLabel: 'Rental in progress',
      equipmentTitle,
      primaryLine: retLine ?? 'Return coming up soon',
      detailLine: null,
    };
  }

  return {
    rentalId: row.id,
    sectionLabel: 'Rental in progress',
    equipmentTitle,
    primaryLine: 'Rental active',
    detailLine: null,
  };
}

export function selectHomeActiveRentalCardModel(
  rows: UnifiedRentalRow[],
  viewerUserId: string,
  nowMs: number = Date.now()
): HomeActiveRentalCardModel | null {
  const uid = viewerUserId.trim();
  if (!uid) return null;

  const scored = rows
    .map((r) => scoreRow(r, uid, nowMs))
    .filter((s): s is Scored => s != null)
    .sort(compareScored);

  const best = scored[0];
  if (!best) return null;

  return buildModel(best.row, uid, best.bucket, nowMs);
}

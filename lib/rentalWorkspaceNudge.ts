import type { UnifiedRentalRow } from '@/lib/fetchUnifiedRentalsForUser';

function terminalRental(row: UnifiedRentalRow): boolean {
  const s = String(row.status ?? '').trim().toLowerCase();
  return s === 'returned' || s === 'completed' || s === 'cancelled' || s === 'canceled';
}

function allConfirmed(row: UnifiedRentalRow): boolean {
  return row.owner_confirmed === true && row.renter_confirmed === true;
}

/** True until both parties have confirmed meetup terms (matches Activity “meetup pending” phase). */
export function rentalRowNeedsMeetupWorkspaceAttention(row: UnifiedRentalRow): boolean {
  if (terminalRental(row)) return false;
  const agreement = String(row.agreement_status ?? '').trim().toLowerCase();
  if (agreement === 'pending' || !allConfirmed(row)) return true;
  return false;
}

export function pickRentalWorkspaceNudgeRow(
  rows: UnifiedRentalRow[],
  dismissed: Set<string>
): UnifiedRentalRow | null {
  const candidates = rows.filter(
    (r) => rentalRowNeedsMeetupWorkspaceAttention(r) && !dismissed.has(r.id)
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const ta = Date.parse(String(a.proposal_updated_at ?? a.created_at ?? '')) || 0;
    const tb = Date.parse(String(b.proposal_updated_at ?? b.created_at ?? '')) || 0;
    return tb - ta;
  });
  return candidates[0] ?? null;
}

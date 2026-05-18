/**
 * Pending meetup proposal values on the rental row (operational columns).
 * Used when ACCEPTING — not `agreed_*`, which may still hold the pre-negotiation baseline.
 */
export function resolveProposedPickupIso(rental: {
  meetup_time?: string | null;
  pickup_datetime?: string | null;
  agreed_pickup_datetime?: string | null;
}): string | null {
  for (const k of ['meetup_time', 'pickup_datetime'] as const) {
    const v = rental[k];
    if (typeof v === 'string' && v.trim() !== '') {
      const t = Date.parse(v.trim());
      if (Number.isFinite(t)) return v.trim();
    }
  }
  const agreed = rental.agreed_pickup_datetime?.trim();
  if (agreed && Number.isFinite(Date.parse(agreed))) return agreed;
  return null;
}

export function resolveProposedReturnIso(rental: {
  return_time?: string | null;
  return_datetime?: string | null;
  agreed_return_datetime?: string | null;
}): string | null {
  for (const k of ['return_time', 'return_datetime'] as const) {
    const v = rental[k];
    if (typeof v === 'string' && v.trim() !== '') {
      const t = Date.parse(v.trim());
      if (Number.isFinite(t)) return v.trim();
    }
  }
  const agreed = rental.agreed_return_datetime?.trim();
  if (agreed && Number.isFinite(Date.parse(agreed))) return agreed;
  return null;
}

export function resolveProposedMeetupLocation(rental: {
  meetup_location?: string | null;
  return_location?: string | null;
}): string {
  return (rental.meetup_location ?? rental.return_location ?? '').trim();
}

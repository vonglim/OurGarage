/**
 * Penalty applied to the daily rental rate for each calendar day the item is late.
 * Not compounded across the booking period — per late day only.
 */
export const DAILY_LATE_FEE_MULTIPLIER = 1.2;

/**
 * Daily late fee = (total rental amount ÷ duration days) × multiplier.
 * `totalAmount` should be the full negotiated total used for the daily rate (e.g. base + delivery when applicable).
 */
export function calculateDailyLateFee(args: {
  totalAmount: number;
  durationDays: number;
  multiplier?: number;
}): number {
  const days = Math.max(1, Math.floor(Math.abs(args.durationDays)) || 1);
  const total = Number(args.totalAmount);
  if (!Number.isFinite(total) || total < 0) return 0;
  const dailyRate = total / days;
  const mult = args.multiplier ?? DAILY_LATE_FEE_MULTIPLIER;
  const raw = dailyRate * mult;
  return Math.round(raw * 100) / 100;
}

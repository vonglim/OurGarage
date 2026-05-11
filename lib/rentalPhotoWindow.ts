import type { VerificationPhase } from '@/lib/rentalVerification';

/** Hours before scheduled pickup/return when verification photo uploads open. */
export const RENTAL_PHOTO_WINDOW_HOURS_BEFORE_EVENT = 48;

function parseTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function isPhotoUploadWindowOpen(
  phase: VerificationPhase,
  pickupDatetime: string | null | undefined,
  returnDatetime: string | null | undefined,
  nowMs: number = Date.now()
): { allowed: boolean; helperText: string | null } {
  const targetTs = parseTs(phase === 'pickup' ? pickupDatetime : returnDatetime);
  if (targetTs == null) return { allowed: true, helperText: null };

  const windowStartTs = targetTs - RENTAL_PHOTO_WINDOW_HOURS_BEFORE_EVENT * 60 * 60 * 1000;
  if (nowMs >= windowStartTs) return { allowed: true, helperText: null };

  const phaseLabel = phase === 'pickup' ? 'pickup' : 'return';
  return {
    allowed: false,
    helperText: `Photos become available ${RENTAL_PHOTO_WINDOW_HOURS_BEFORE_EVENT} hours before ${phaseLabel}.`,
  };
}

import type { VerificationPhase } from '@/lib/rentalVerification';

const WINDOW_HOURS_BEFORE_EVENT = 24;

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

  const windowStartTs = targetTs - WINDOW_HOURS_BEFORE_EVENT * 60 * 60 * 1000;
  if (nowMs >= windowStartTs) return { allowed: true, helperText: null };

  const phaseLabel = phase === 'pickup' ? 'pickup' : 'return';
  return {
    allowed: false,
    helperText: `Photos become available 24 hours before ${phaseLabel}.`,
  };
}

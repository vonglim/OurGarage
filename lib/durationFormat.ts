export type DurationType = 'fullDay' | 'multiDay';

export const DURATION_OPTIONS: { key: DurationType; label: string }[] = [
  { key: 'fullDay', label: 'Full Day' },
  { key: 'multiDay', label: 'Multiple Days' },
];

export function isDurationType(v: unknown): v is DurationType {
  return v === 'fullDay' || v === 'multiDay';
}

export function formatDurationDisplay(req: {
  durationType?: DurationType | string | null | undefined;
  durationValue?: number | null | undefined;
  duration?: unknown;
}): string {
  const t = req.durationType;
  const normalized = t === 'halfDay' ? 'fullDay' : t;
  if (isDurationType(normalized)) {
    if (normalized === 'fullDay') return 'Full Day';
    if (normalized === 'multiDay') {
      const n = Number(req.durationValue);
      if (!Number.isFinite(n) || n < 1) return 'Multiple Days';
      const rounded = Math.round(n);
      return rounded === 1 ? '1 Day' : `${rounded} Days`;
    }
  }
  if (normalized === 'weekly') {
    const n = Number(req.durationValue);
    if (!Number.isFinite(n) || n < 1) return 'Multiple Days';
    const days = Math.max(1, Math.round(n) * 7);
    return days === 1 ? '1 Day' : `${days} Days`;
  }
  const legacy = req.duration != null && String(req.duration).trim();
  if (legacy) return String(req.duration).trim();
  return '—';
}

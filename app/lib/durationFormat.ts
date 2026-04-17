export type DurationType = 'halfDay' | 'fullDay' | 'multiDay' | 'weekly';

export const DURATION_OPTIONS: { key: DurationType; label: string }[] = [
  { key: 'halfDay', label: 'Half Day' },
  { key: 'fullDay', label: 'Full Day' },
  { key: 'multiDay', label: 'Multiple Days' },
  { key: 'weekly', label: 'Weekly' },
];

export function isDurationType(v: unknown): v is DurationType {
  return (
    v === 'halfDay' ||
    v === 'fullDay' ||
    v === 'multiDay' ||
    v === 'weekly'
  );
}

export function formatDurationDisplay(req: {
  durationType?: DurationType | string | null | undefined;
  durationValue?: number | null | undefined;
  duration?: unknown;
}): string {
  const t = req.durationType;
  if (isDurationType(t)) {
    if (t === 'halfDay') return 'Half Day';
    if (t === 'fullDay') return 'Full Day';
    if (t === 'multiDay') {
      const n = Number(req.durationValue);
      if (!Number.isFinite(n) || n < 1) return 'Multiple Days';
      const rounded = Math.round(n);
      return rounded === 1 ? '1 Day' : `${rounded} Days`;
    }
    if (t === 'weekly') {
      const n = Number(req.durationValue);
      if (!Number.isFinite(n) || n < 1) return 'Weekly';
      const rounded = Math.round(n);
      return rounded === 1 ? '1 Week' : `${rounded} Weeks`;
    }
  }
  const legacy = req.duration != null && String(req.duration).trim();
  if (legacy) return String(req.duration).trim();
  return '—';
}

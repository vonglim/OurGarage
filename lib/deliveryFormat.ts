export type HowKey = 'pickup_nearby' | 'delivery_only';

export const DELIVERY_OPTIONS: {
  key: HowKey;
  /** Full sentence used in lists / details */
  label: string;
  /** Compact label for form chips */
  shortLabel: string;
  needsRadius?: boolean;
}[] = [
  {
    key: 'pickup_nearby',
    label: 'No delivery needed (within X miles)',
    shortLabel: 'No delivery needed (pickup)',
    needsRadius: true,
  },
  {
    key: 'delivery_only',
    label: 'Delivery only',
    shortLabel: 'Delivery only',
  },
];

export function isHowKey(v: unknown): v is HowKey {
  return v === 'pickup_nearby' || v === 'delivery_only';
}

export function needsDeliveryFee(how: unknown): boolean {
  return how === 'delivery_only' || how === 'delivery_and_pickup';
}

export function formatHowDisplay(req: {
  how?: unknown;
  pickupRadiusMiles?: number | null;
}): string {
  const h = req.how;
  const milesRaw = req.pickupRadiusMiles;
  const miles =
    milesRaw != null && Number.isFinite(Number(milesRaw))
      ? Math.max(1, Math.round(Number(milesRaw)))
      : 10;

  if (h === 'pickup_nearby') {
    const template =
      DELIVERY_OPTIONS.find((o) => o.key === 'pickup_nearby')?.label ??
      'No delivery needed (within X miles)';
    return template.replace('X', String(miles));
  }
  if (h === 'delivery_only') return 'Owner delivery';
  if (h === 'delivery_and_pickup') return 'Owner delivery';

  const legacy = String(h ?? '').trim();
  return legacy === '' ? '—' : legacy;
}

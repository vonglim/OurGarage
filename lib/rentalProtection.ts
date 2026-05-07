export function calculatePreauthAmount(replacementValue: number): number {
  const safe = Number.isFinite(replacementValue) ? Math.max(0, replacementValue) : 0;
  const target = Math.round(safe * 0.5);
  const bounded = Math.min(500, Math.max(25, target));
  return Math.round(bounded);
}

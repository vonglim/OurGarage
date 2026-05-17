export function formatWizardDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not set yet';
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return 'Not set yet';
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} at ${timePart}`;
}

export function formatWizardLocation(
  meetup: string | null | undefined,
  fallback?: string | null
): string {
  const a = (meetup ?? '').trim();
  const b = (fallback ?? '').trim();
  return a || b || 'Location not set';
}

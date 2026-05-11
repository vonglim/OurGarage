/** Human-readable dates for transaction / request summary rows (no time). */
export function formatYyyyMmDdHuman(ymd: string | undefined | null): string {
  const s = String(ymd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s.length > 0 ? s : '—';
  }
  const [ys, ms, ds] = s.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return s;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatRequestDateRangeLine(
  pickup: string | undefined | null,
  ret: string | undefined | null
): string {
  const a = formatYyyyMmDdHuman(pickup);
  const b = formatYyyyMmDdHuman(ret);
  if (a === '—' && b === '—') return '—';
  if (a === b) return a;
  return `${a} – ${b}`;
}

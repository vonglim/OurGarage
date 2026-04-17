/** Strip to digits and at most one decimal point (simple money typing). */
export function sanitizeMoneyDigits(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const first = s.indexOf('.');
  if (first === -1) return s;
  s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, '');
  return s;
}

export function parseMoneyToNumber(raw: string): number | null {
  const t = sanitizeMoneyDigits(raw).trim();
  if (t === '' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function getNumericTotalPrice(req: {
  totalPrice?: unknown;
  budget?: unknown;
}): number | null {
  if (typeof req.totalPrice === 'number' && Number.isFinite(req.totalPrice)) {
    return req.totalPrice;
  }
  return parseMoneyToNumber(String(req.budget ?? ''));
}

export function formatUsd(amount: unknown): string {
  if (amount == null || amount === '') return '—';
  const n =
    typeof amount === 'number'
      ? amount
      : parseMoneyToNumber(String(amount).replace(/[^0-9.]/g, ''));
  if (n == null || !Number.isFinite(n)) return '—';
  const formatted = n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `$${formatted}`;
}

export function getNumericOfferPrice(offer: { price?: unknown }): number {
  if (typeof offer.price === 'number' && Number.isFinite(offer.price)) {
    return offer.price;
  }
  return parseMoneyToNumber(String(offer.price ?? '')) ?? 0;
}

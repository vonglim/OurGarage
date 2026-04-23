/**
 * Local pricing guidance for Create Listing (no API).
 * Daily ≈ 5–10% of estimated value; weekly ≈ 3–4× daily; monthly ≈ 10–15× daily.
 */

function hashTitle(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Heuristic resale / replacement value (USD) from title keywords + light hash jitter. */
export function estimatedValueForTitle(title: string): number | null {
  const t = title.trim().toLowerCase();
  if (t.length < 2) return null;

  let base = 140;
  const tiers: [string, number][] = [
    ['scissor lift', 8500],
    ['lift', 2200],
    ['generator', 950],
    ['compactor', 1600],
    ['pressure washer', 380],
    ['washer', 380],
    ['ladder', 220],
    ['compressor', 480],
    ['table saw', 520],
    ['miter', 480],
    ['circular saw', 320],
    ['drill', 240],
    ['impact', 220],
    ['vac', 160],
    ['vacuum', 160],
    ['jackhammer', 1200],
    ['hammer', 260],
    ['sander', 440],
    ['tile', 520],
  ];
  for (const [kw, v] of tiers) {
    if (t.includes(kw)) base = Math.max(base, v);
  }

  const jitter = 0.82 + (hashTitle(t) % 37) / 100;
  return Math.round(base * jitter);
}

export type PricingGuidanceLines = {
  /** e.g. "Recommended: $8–$15/day based on similar items" */
  dailyLine: string;
  /** Optional compact weekly + monthly line */
  tenureLine: string;
  estimatedValue: number;
};

export function getCreateListingPricingGuidance(title: string): PricingGuidanceLines | null {
  const est = estimatedValueForTitle(title);
  if (est == null) return null;

  const dLo = Math.max(1, Math.round(est * 0.05));
  const dHi = Math.max(dLo + 1, Math.round(est * 0.1));

  const wLo = Math.max(1, Math.round(dLo * 3));
  const wHi = Math.max(wLo + 1, Math.round(dHi * 4));
  const mLo = Math.max(1, Math.round(dLo * 10));
  const mHi = Math.max(mLo + 1, Math.round(dHi * 15));

  const dailyLine = `Recommended: $${dLo}–$${dHi}/day based on similar items`;
  const tenureLine = `Weekly ≈ $${wLo}–$${wHi} · monthly ≈ $${mLo}–$${mHi}`;

  return { dailyLine, tenureLine, estimatedValue: est };
}

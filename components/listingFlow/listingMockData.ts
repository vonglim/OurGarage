export const POPULAR_BRAND_CHIPS = [
  'DeWalt',
  'Milwaukee',
  'Makita',
  'Honda',
  'Bosch',
  'Ryobi',
] as const;

export type BrandSuggestion = { id: string; title: string; subtitle: string };

const BRAND_CATALOG: BrandSuggestion[] = [
  { id: '1', title: 'DeWalt', subtitle: 'Power tools' },
  { id: '2', title: 'Milwaukee', subtitle: 'M18 / M12' },
  { id: '3', title: 'Makita', subtitle: 'LXT cordless' },
  { id: '4', title: 'Honda', subtitle: 'Generators & engines' },
  { id: '5', title: 'Bosch', subtitle: 'Professional' },
  { id: '6', title: 'Ryobi', subtitle: 'ONE+' },
];

export function filterListingBrandSuggestions(query: string, max = 4): BrandSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const scored = BRAND_CATALOG.map((s) => {
    const t = s.title.toLowerCase();
    const sub = s.subtitle.toLowerCase();
    let score = 0;
    if (t.startsWith(q)) score += 100;
    else if (t.includes(q)) score += 50;
    if (sub.includes(q)) score += 20;
    return { s, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.s);
}

export const SUGGESTED_INCLUDED_CHIPS = [
  'Battery',
  'Charger',
  'Carrying case',
  'Blades',
  'Manual',
  'Safety gear',
] as const;

export const SUGGESTED_RATE_CHIPS = [25, 35, 45] as const;

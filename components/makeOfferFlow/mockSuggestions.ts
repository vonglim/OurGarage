export type BrandSuggestion = {
  id: string;
  title: string;
  subtitle: string;
};

export const MOCK_BRAND_SUGGESTIONS: BrandSuggestion[] = [
  { id: '1', title: 'DeWalt DWP611 Mixer', subtitle: '1/2 HP • Portable router' },
  { id: '2', title: 'DeWalt DWE575 Circular Saw', subtitle: '7-1/4 in • Lightweight' },
  { id: '3', title: 'DeWalt DCD771 Drill Driver', subtitle: '20V MAX • Compact kit' },
  { id: '4', title: 'Bosch GCM12SD Miter Saw', subtitle: '12 in • Dual-bevel glide' },
  { id: '5', title: 'Milwaukee M18 Impact', subtitle: '1/4 in • Brushless' },
];

export function filterBrandSuggestions(query: string, max = 3): BrandSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = MOCK_BRAND_SUGGESTIONS.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.subtitle.toLowerCase().includes(q) ||
      q.split(/\s+/).some((w) => w.length > 1 && s.title.toLowerCase().includes(w))
  );
  return scored.slice(0, max);
}

export const SUGGESTED_ACCESSORIES = [
  'Battery',
  'Charger',
  'Carrying Case',
  'Manual',
  'Extra Blade',
] as const;

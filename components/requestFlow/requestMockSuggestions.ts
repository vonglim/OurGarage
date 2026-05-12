export type RequestItemSuggestion = { id: string; title: string; subtitle: string };

const CATALOG: RequestItemSuggestion[] = [
  { id: '1', title: 'Concrete Mixer', subtitle: 'Portable mixer' },
  { id: '2', title: 'Pressure Washer', subtitle: 'Gas or electric' },
  { id: '3', title: 'Generator', subtitle: 'Portable power' },
  { id: '4', title: 'Skid Steer', subtitle: 'Loader rental' },
  { id: '5', title: 'Scissor Lift', subtitle: 'Aerial work platform' },
];

export function filterRequestItemSuggestions(query: string, max = 3): RequestItemSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const scored = CATALOG.map((s) => {
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

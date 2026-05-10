/**
 * Normalizes a name for agreement matching: trim, collapse repeated spaces, lowercase.
 * Does not strip punctuation (e.g. "O'Brien" stays distinct).
 */
export function normalizeLegalName(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

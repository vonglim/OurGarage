/**
 * Normalize Supabase `listings.images`: real array, JSON string, or a string that looks like
 * `['https://...']` (single quotes — invalid for `JSON.parse`).
 */
export function normalizeListingImages(raw: unknown): string[] {
  const toStringList = (arr: unknown[]): string[] =>
    arr
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean);

  if (raw == null || raw === '') {
    return [];
  }

  if (Array.isArray(raw)) {
    return toStringList(raw);
  }

  if (typeof raw !== 'string') {
    return [];
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const tryJson = (s: string): string[] | null => {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return toStringList(parsed);
      }
    } catch {
      /* fall through */
    }
    return null;
  };

  const fromStrict = tryJson(trimmed);
  if (fromStrict !== null) {
    return fromStrict;
  }

  // e.g. "['https://x.com/img.jpg']" — not valid JSON; double quotes required.
  const fromQuoted = tryJson(trimmed.replace(/'/g, '"'));
  if (fromQuoted !== null) {
    return fromQuoted;
  }

  return extractHttpUrlsFromString(trimmed);
}

/**
 * Last resort: pull `http(s)://…` segments from arbitrary text (trims trailing brackets/quotes).
 */
function extractHttpUrlsFromString(s: string): string[] {
  const re = /https?:\/\/[^\s'"]+/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    let u = m[0].trim();
    u = u.replace(/['")\],]+$/g, '');
    if (u.length > 0 && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

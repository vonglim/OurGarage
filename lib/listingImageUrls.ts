/**
 * Listing `images` in Supabase must be remote CDN/storage URLs only — never `file://` or `ph://`.
 */

const REMOTE_PREFIXES = ['https://', 'http://'] as const;

export function isPersistedRemoteImageUrl(url: string | null | undefined): boolean {
  const u = url?.trim() ?? '';
  if (!u) return false;
  const lower = u.toLowerCase();
  if (lower.startsWith('file:') || lower.startsWith('content:') || lower.startsWith('ph:') || lower.startsWith('asset:'))
    return false;
  return REMOTE_PREFIXES.some((p) => lower.startsWith(p));
}

/** Drops any non-remote URL. Use before Supabase insert and when validating publish readiness. */
export function sanitizeListingImagesForPersistence(urls: string[]): string[] {
  return urls.map((u) => u.trim()).filter((u) => isPersistedRemoteImageUrl(u));
}

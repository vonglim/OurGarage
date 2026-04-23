/**
 * Canonical request author: Supabase Auth `user_id` in DB, mapped in-app to `posterUserId` / `ownerId`.
 */
export function getRequestOwnerId(req: Record<string, unknown>): string | null {
  const poster = req.posterUserId ?? req.poster_user_id;
  const owner = req.ownerId ?? req.owner_id;
  const row = req.user_id;
  for (const v of [poster, owner, row]) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/** Supabase `requests.id` UUID when the row came from (or was merged with) remote. */
export function getRequestSupabaseRowId(req: Record<string, unknown>): string | null {
  const rid = req.remoteId ?? req.id;
  return typeof rid === 'string' && rid.trim() !== '' ? rid.trim() : null;
}

/** RFC 4122 UUID (any version) — used to validate `request-details` route params. */
export function isUuidString(value: string): boolean {
  const s = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

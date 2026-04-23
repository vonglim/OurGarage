import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';

/**
 * True when the user has not set a public display name yet (onboarding) or the row still has a generic placeholder.
 */
export function profileNeedsCreateUsername(name: string | null | undefined): boolean {
  const t = (name ?? '').trim();
  if (t === '') return true;
  const lower = t.toLowerCase();
  if (lower === PROFILE_NAME_FALLBACK.toLowerCase()) return true;
  if (lower === 'new user') return true;
  return false;
}

import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';

/** e.g. "Borrowing from Chris P." */
export function formatBorrowingFromOwner(displayName: string): string {
  const n = displayName.trim();
  if (!n || n === PROFILE_NAME_FALLBACK) return 'Borrowing from the owner';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const lastInitial = parts[parts.length - 1]![0]?.toUpperCase();
    if (lastInitial) return `Borrowing from ${first} ${lastInitial}.`;
  }
  return `Borrowing from ${n}`;
}

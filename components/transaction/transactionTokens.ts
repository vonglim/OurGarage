import { ui } from '@/constants/appUi';

/** Semantic greens for transactional cards (best value, success borders). */
export const transactionSuccess = {
  border: '#86EFAC',
  badgeBg: '#DCFCE7',
  badgeText: '#14532D',
  dot: '#22C55E',
} as const;

export const transactionNav = {
  /** Circular back control on light surfaces */
  backFill: '#F3F4F6',
  backIcon: ui.primary,
} as const;

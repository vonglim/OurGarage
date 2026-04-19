import { StyleSheet } from 'react-native';

/** Minimal shared UI tokens (no external UI libraries). */
export const ui = {
  primary: '#007AFF',
  text: '#111111',
  textSecondary: '#3A3A3A',
  textBody: '#404040',
  textSubtle: '#555555',
  textMuted: '#666666',
  border: '#E6E6E6',
  borderLight: '#F0F0F0',
  cardBg: '#FFFFFF',
  radiusCard: 16,
  radiusButton: 12,
  radiusChip: 20,
  padCard: 16,
  padButtonV: 14,
  fontTitleCard: 20,
  fontSecondary: 14,
  fontSubtle: 13,
  fontBody: 15,
  pressOpacity: 0.88,
} as const;

/** Default white list/detail card chrome (radius, padding, border, shadow). */
export const cardChrome = {
  backgroundColor: ui.cardBg,
  borderRadius: ui.radiusCard,
  padding: ui.padCard,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: '#E5E5EA',
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 } as const,
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 4,
} as const;

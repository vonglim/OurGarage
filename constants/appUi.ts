import { StyleSheet, type ViewStyle } from 'react-native';

/**
 * Global UI tokens — use these instead of one-off hex values.
 * Red (#FF3B30, etc.) reserved for alerts / destructive / errors only.
 */
export const ui = {
  /** Deep Navy — primary buttons, key links, active tab tint */
  primary: '#0B1F3A',
  /** Solid primary control — pressed fill (instant; pair with `Pressable` `pressOpacityFeedback={false}`). */
  primaryPressed: '#071525',
  /** Text & icons on top of `primary` */
  primaryOn: '#FFFFFF',

  /** Charcoal — titles, primary reading text */
  textPrimary: '#222222',
  /** Slate — secondary labels, meta, placeholders */
  textSecondary: '#6B7280',

  /** Validation / destructive emphasis (required field errors, alerts) */
  danger: '#DC2626',

  /** Light slate — dividers, hairlines, input borders */
  border: '#E5E7EB',
  /** Screen / card surface */
  background: '#FFFFFF',

  cardBg: '#FFFFFF',
  borderLight: '#F3F4F6',

  /** Grouped list / screen chrome behind white cards */
  surfaceGrouped: '#F3F4F6',
  /** Text fields, subtle inset panels */
  surfaceInput: '#F9FAFB',
  /** Segment tracks, neutral control wells */
  surfaceNeutral: '#ECECEC',
  /** Striped rows, keyboard accessory bars */
  surfaceStriped: '#F5F5F7',

  /** Light primary tint for highlighted rows (e.g. unread, CTAs) */
  surfaceTintPrimary: '#EFF6FF',

  /** Bottom tab “pill” when focused (slate, not on dark bar) */
  surfaceTabActive: '#F1F5F9',

  /** @deprecated Use `textPrimary` */
  text: '#222222',
  /** @deprecated Use `textSecondary` */
  textBody: '#222222',
  /** @deprecated Use `textSecondary` */
  textSubtle: '#6B7280',
  /** @deprecated Use `textSecondary` */
  textMuted: '#6B7280',

  /** Cards, modals, large panels */
  radiusCard: 16,
  /** Primary / secondary pressable actions */
  radiusButton: 16,
  /** Hero CTAs (e.g. home) — top of 16–20 range */
  radiusProminent: 20,
  /** Text fields, search */
  radiusInput: 14,
  radiusChip: 20,

  /** Tight inline gap */
  spaceSm: 8,
  /** Standard block / screen gutter companion */
  spaceMd: 16,
  /** Between sections */
  spaceSection: 28,
  /** Large vertical rhythm */
  spaceLg: 32,

  padCard: 16,
  /** Horizontal screen gutter (most scroll roots) */
  padScreenH: 20,
  padButtonV: 14,
  fontTitleCard: 20,
  /** List row / browse price emphasis */
  fontPrice: 16,
  /** Card hero price */
  fontPriceLarge: 18,
  fontSecondary: 14,
  fontSubtle: 13,
  fontBody: 15,
  /** Pressable dim while held (0.7–0.8 range) */
  pressOpacity: 0.78,
} as const;

/** Solid `ui.primary` fill on press — avoids stacking global press opacity on labels. */
export const primarySolidPressed: ViewStyle = {
  backgroundColor: ui.primaryPressed,
};

/** Outlined primary-style control — light fill on press. */
export const outlinePrimaryPressed: ViewStyle = {
  backgroundColor: ui.surfaceTintPrimary,
};

/** Subtle fill for text-only / link actions (e.g. Send). */
export const subtleControlPressed: ViewStyle = {
  backgroundColor: ui.surfaceStriped,
};

/** Red-outline control (e.g. End rental) — light pressed fill, no opacity stack. */
export const destructiveOutlinePressed: ViewStyle = {
  backgroundColor: '#FFEBEE',
};

/** Subtle depth for primary actions (FAB, navy CTAs). */
export const shadowKey = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 3 } as const,
  shadowOpacity: 0.1,
  shadowRadius: 12,
  elevation: 5,
} as const;

/** Light elevation for important cards (not list rows). */
export const shadowCard = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 } as const,
  shadowOpacity: 0.05,
  shadowRadius: 10,
  elevation: 3,
} as const;

/** Activity segment — selected tab (subtle lift). */
export const shadowSegmentActive = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 } as const,
  shadowOpacity: 0.1,
  shadowRadius: 8,
  elevation: 5,
} as const;

/** Activity segment — inactive tab with pending attention (soft, not alarm-colored). */
export const shadowSegmentAttention = {
  shadowColor: '#0B1F3A',
  shadowOffset: { width: 0, height: 1 } as const,
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 2,
} as const;

const cardChromeBase = {
  backgroundColor: '#FFFFFF',
  borderRadius: ui.radiusCard,
  padding: ui.padCard,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: ui.border,
} as const;

/** Default white list/detail card chrome — subtle shadow; Browse stays flat (no cardChrome). */
export const cardChrome = {
  ...cardChromeBase,
  ...shadowCard,
} as const;

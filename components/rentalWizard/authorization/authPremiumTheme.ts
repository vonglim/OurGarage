import { StyleSheet } from 'react-native';

import { ui } from '@/constants/appUi';

/** Authorization polish tokens — same navy / slate language as the rest of the rental wizard. */
export const authPremium = {
  gradient: {
    /** Matches `WizardTransitionShell` dark celebration screens. */
    hero: ['#0F172A', '#1E293B', '#334155'] as const,
    heroSoft: [ui.surfaceGrouped, ui.background, ui.background] as const,
    cta: [ui.primary, ui.primary, ui.primaryPressed] as const,
    success: ['#065F46', '#059669', '#10B981'] as const,
    hold: ['#0F172A', '#1E293B', '#334155'] as const,
  },
  glow: {
    accent: 'rgba(129, 140, 248, 0.35)',
    green: 'rgba(34, 197, 94, 0.28)',
  },
  ink: {
    hero: '#F8FAFC',
    heroMuted: 'rgba(226, 232, 240, 0.78)',
    primary: ui.textPrimary,
    secondary: ui.textSecondary,
    accent: ui.primary,
  },
  surface: {
    card: ui.cardBg,
    elevated: '#FAFBFD',
    muted: ui.surfaceGrouped,
  },
  radius: {
    card: ui.radiusCard,
    chip: 12,
    cta: ui.radiusButton,
    hero: ui.radiusProminent,
  },
  spacing: {
    section: ui.spaceSection,
    block: 20,
    tight: ui.spaceSm,
  },
} as const;

export const authType = StyleSheet.create({
  heroHeadline: {
    fontSize: 28,
    fontWeight: '800',
    color: authPremium.ink.hero,
    letterSpacing: -0.5,
    lineHeight: 34,
    textAlign: 'center',
  },
  heroSupport: {
    fontSize: 16,
    fontWeight: '500',
    color: authPremium.ink.heroMuted,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 320,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: authPremium.ink.primary,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  screenSubtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: authPremium.ink.secondary,
    lineHeight: 22,
    marginTop: 6,
  },
  sectionKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: authPremium.ink.accent,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  trust: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.primary,
    lineHeight: 18,
  },
});

import { StyleSheet, type ViewStyle } from 'react-native';

import { ui } from '@/constants/appUi';

/**
 * Shared guided-wizard layout rhythm — Request Item wizard is the visual benchmark.
 * Horizontal inset comes from `ScreenWrapper` (16px); step content may add `stepContentInset`.
 */
export const wizardLayout = {
  /** Applied by ScreenWrapper — do not duplicate on scroll regions. */
  screenPaddingHorizontal: 16,
  screenPaddingTop: 10,

  headerBlockPaddingBottom: 8,
  progressMarginTop: 4,
  progressGap: 8,

  scrollPaddingTop: 20,
  /** Space reserved above the sticky footer (plus safe area in chrome). */
  scrollBottomReserve: 108,
  keyboardBottomOffset: 56,
  keyboardExtraSpace: 12,

  /** Vertical gap between major blocks inside a step body. */
  bodyGap: 20,
  /** Extra inset on step roots (matches Request `stepPad`). */
  stepContentInset: 4,
  /** Gap between section kicker and first control/card in that section. */
  sectionLabelToContent: 8,
  /** Gap between stacked major sections (method → location → time). */
  sectionGap: 24,
  /** Gap between related controls inside a section (e.g. time card → chips). */
  sectionContentGap: 12,
  /** Gap between cards in the same section. */
  cardGap: 16,
  /** Bottom sheet / modal chrome (wizard forms). */
  sheetPaddingHorizontal: 20,
  sheetContentGap: 12,
  sheetHeaderPaddingBottom: 8,
  sheetScrollPaddingBottom: 8,
  sheetFooterPaddingTop: 4,
  sheetBottomMin: 12,
  /** iOS spinner DateTimePicker minimum visible height. */
  sheetPickerHeight: 216,
  /** Space after the item summary card before first section. */
  afterSummaryCard: 24,
  /** Rental summary card (celebration / confirmation). */
  summaryCardInset: 12,
  summaryMetaPaddingVertical: 8,
  summaryMetaColumnGap: 8,

  /** Light celebration transition screens (rental confirmed, etc.). */
  celebrationScrollPaddingTop: 6,
  celebrationHeaderPaddingBottom: 4,
  celebrationHeroOuter: 76,
  celebrationHeroInner: 54,
  celebrationHeroIconToTextGap: 6,
  celebrationHeroTextGap: 6,
  celebrationHeadlineMaxWidth: 340,
  celebrationSupportMaxWidth: 320,
  celebrationSectionGap: 20,
  journeyRowPaddingVertical: 11,
  journeyRowPaddingHorizontal: 14,
  /** Extra scroll reserve when footer has primary + 2 outlined tiers. */
  footerStackedExtraReserve: 80,
  celebrationFooterGap: 6,
  celebrationFooterSecondaryBg: '#FAFBFD',
  celebrationFooterSecondaryBorder: '#D1D5DB',
  celebrationFooterTertiaryBg: '#FCFCFD',
  celebrationFooterTertiaryBorder: '#EEF0F3',
  celebrationFooterTertiaryPaddingVertical: 11,

  footerPaddingTop: 8,
  footerBottomMin: 10,
  footerGap: 8,
  footerCompactPaddingTop: 6,
  footerCompactBottomMin: 6,
  footerCompactGap: 4,
  scrollBottomReserveCompact: 72,
  footerNotePaddingVertical: 10,
  footerNotePaddingHorizontal: 14,
  footerNoteRadius: 12,

  ctaPaddingVertical: 16,
  ctaCompactPaddingVertical: 13,
  inlineFooterPaddingVertical: 4,
  ctaBorderRadius: ui.radiusProminent,
  secondaryMarginTop: 4,
  secondaryPaddingVertical: 6,
} as const;

export function wizardScrollBottomPadding(safeBottom: number): number {
  return wizardLayout.scrollBottomReserve + safeBottom;
}

export function wizardScrollBottomPaddingCompact(safeBottom: number): number {
  return wizardLayout.scrollBottomReserveCompact + safeBottom;
}

export function wizardScrollBottomPaddingStackedFooter(safeBottom: number): number {
  return (
    wizardLayout.scrollBottomReserve +
    wizardLayout.footerStackedExtraReserve +
    safeBottom
  );
}

export const wizardStepContentStyle: ViewStyle = {
  paddingHorizontal: wizardLayout.stepContentInset,
};

export const wizardBodyStyle: ViewStyle = {
  gap: wizardLayout.bodyGap,
};

export const wizardSectionStackStyle: ViewStyle = {
  gap: wizardLayout.sectionGap,
};

/** Groups a section kicker with its controls (tight label-to-content). */
export const wizardSectionBlockStyle: ViewStyle = {
  gap: wizardLayout.sectionLabelToContent,
};

/** Sibling controls under one section kicker (e.g. field card + chips). */
export const wizardSectionContentStyle: ViewStyle = {
  gap: wizardLayout.sectionContentGap,
};

export const guidedWizardChromeStyles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: ui.background },
  headerBlock: {
    paddingBottom: wizardLayout.headerBlockPaddingBottom,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: wizardLayout.scrollPaddingTop,
    flexGrow: 1,
  },
  body: wizardBodyStyle,
  footer: {
    paddingHorizontal: 0,
    paddingTop: wizardLayout.footerPaddingTop,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    backgroundColor: ui.background,
    gap: wizardLayout.footerGap,
  },
  cta: {
    backgroundColor: ui.primary,
    paddingVertical: wizardLayout.ctaPaddingVertical,
    borderRadius: wizardLayout.ctaBorderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaAlt: {
    backgroundColor: ui.primary,
  },
  ctaPublish: {
    backgroundColor: '#22C55E',
    borderWidth: 1,
    borderColor: '#16A34A',
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '700',
  },
  ctaTextPublish: {
    color: '#FFFFFF',
  },
  secondaryFooter: {
    marginTop: wizardLayout.secondaryMarginTop,
    paddingVertical: wizardLayout.secondaryPaddingVertical,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryFooterText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
  tertiaryFooter: {
    marginTop: 4,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tertiaryFooterText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
    textDecorationLine: 'underline',
  },
  footerCompact: {
    paddingTop: wizardLayout.footerCompactPaddingTop,
    gap: wizardLayout.footerCompactGap,
  },
  ctaCompact: {
    paddingVertical: wizardLayout.ctaCompactPaddingVertical,
  },
  inlineFooterActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: wizardLayout.inlineFooterPaddingVertical,
    gap: 2,
  },
  inlineFooterSep: {
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    paddingHorizontal: 6,
  },
  inlineFooterAction: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.primary,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  inlineFooterActionTertiary: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  footerNote: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4338CA',
    textAlign: 'center',
    lineHeight: 18,
    backgroundColor: '#EEF2FF',
    paddingVertical: wizardLayout.footerNotePaddingVertical,
    paddingHorizontal: wizardLayout.footerNotePaddingHorizontal,
    borderRadius: wizardLayout.footerNoteRadius,
    overflow: 'hidden',
  },
  /** Celebration shell — secondary tier (message, etc.). */
  celebrationFooterSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 8,
    paddingVertical: wizardLayout.ctaPaddingVertical,
    borderRadius: wizardLayout.ctaBorderRadius,
    borderWidth: 1,
    borderColor: wizardLayout.celebrationFooterSecondaryBorder,
    backgroundColor: wizardLayout.celebrationFooterSecondaryBg,
  },
  celebrationFooterSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  celebrationHeaderBlock: {
    paddingBottom: wizardLayout.celebrationHeaderPaddingBottom,
  },
  /** Celebration shell — tertiary tier (view details, etc.). */
  celebrationFooterTertiary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 4,
    paddingVertical: wizardLayout.celebrationFooterTertiaryPaddingVertical,
    borderRadius: wizardLayout.ctaBorderRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: wizardLayout.celebrationFooterTertiaryBorder,
    backgroundColor: wizardLayout.celebrationFooterTertiaryBg,
  },
  celebrationFooterTertiaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: -0.2,
  },
  celebrationFooterStack: {
    gap: wizardLayout.celebrationFooterGap,
    paddingTop: wizardLayout.footerPaddingTop,
    paddingBottom: wizardLayout.footerBottomMin,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    backgroundColor: '#FAFBFC',
  },
  celebrationCta: {
    alignSelf: 'stretch',
  },
});

/** Centered hero block for light celebration transitions. */
export const wizardCelebrationHeroStyle: ViewStyle = {
  alignItems: 'center',
  gap: wizardLayout.celebrationHeroIconToTextGap,
};

/** Headline + supporting copy within the celebration hero. */
export const wizardCelebrationHeroTextStyle: ViewStyle = {
  alignItems: 'center',
  gap: wizardLayout.celebrationHeroTextGap,
};

/** Step body for celebration transitions — full-width sections, wizard rhythm. */
export const wizardCelebrationBodyStyle: ViewStyle = {
  gap: wizardLayout.celebrationSectionGap,
};

/** Tighter scroll inset for celebration transition screens. */
export const wizardCelebrationScrollContentStyle: ViewStyle = {
  paddingTop: wizardLayout.celebrationScrollPaddingTop,
  flexGrow: 1,
};

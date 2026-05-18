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

  footerPaddingTop: 8,
  footerBottomMin: 10,
  footerGap: 8,
  footerNotePaddingVertical: 10,
  footerNotePaddingHorizontal: 14,
  footerNoteRadius: 12,

  ctaPaddingVertical: 16,
  ctaBorderRadius: ui.radiusProminent,
  secondaryMarginTop: 4,
  secondaryPaddingVertical: 6,
} as const;

export function wizardScrollBottomPadding(safeBottom: number): number {
  return wizardLayout.scrollBottomReserve + safeBottom;
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
});

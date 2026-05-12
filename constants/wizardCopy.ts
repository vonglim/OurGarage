import type { TextStyle, ViewStyle } from 'react-native';

import { ui } from '@/constants/appUi';

/**
 * Shared wizard step typography — Request, Offer, Listing, and review subheads.
 * Centered rhythm, max width for balanced wraps, tight line height.
 * Prefer intentional `\n` in copy to avoid orphan words; wrap copy in `WizardSubtitle`.
 */
export const wizardCopy = {
  /** Max width for subtitle blocks (centered). */
  subtitleMaxWidth: 296,
  subtitleLineHeight: 19,
  /** Space from title to subtitle */
  titleToSubtitle: 6,
  /** Space from subtitle to first content block */
  subtitleToContent: 14,
  /** Looser gap when the next block is dense (e.g. big money input). */
  subtitleToContentLoose: 18,
} as const;

export const wizardSubtitleOuterStyle: ViewStyle = {
  alignSelf: 'center',
  width: '100%',
  maxWidth: wizardCopy.subtitleMaxWidth,
  paddingHorizontal: 14,
  marginBottom: wizardCopy.subtitleToContent,
};

export const wizardSubtitleTextStyle: TextStyle = {
  fontSize: 14,
  fontWeight: '400',
  color: ui.textSecondary,
  textAlign: 'center',
  lineHeight: wizardCopy.subtitleLineHeight,
};

export const wizardStepTitleStyle: TextStyle = {
  fontSize: 22,
  fontWeight: '700',
  color: ui.textPrimary,
  textAlign: 'center',
  marginBottom: wizardCopy.titleToSubtitle,
};

/** Legacy flat style for StyleSheets that still spread subtitle onto `Text`. Prefer `WizardSubtitle`. */
export const wizardStepSubtitleStyle: TextStyle = {
  ...wizardSubtitleTextStyle,
  alignSelf: 'center',
  maxWidth: wizardCopy.subtitleMaxWidth,
  marginBottom: wizardCopy.subtitleToContent,
  paddingHorizontal: 14,
};

export const wizardStepSubtitleToContentLoose: TextStyle = {
  marginBottom: wizardCopy.subtitleToContentLoose,
};

/** Two-line wizard titles (e.g. market value step) */
export const wizardStepTitleMultilineStyle: TextStyle = {
  ...wizardStepTitleStyle,
  lineHeight: 28,
};

/** Trust / protection explainer cards (listing step 7, review preview). */
export const wizardTrustCardShell: ViewStyle = {
  marginTop: 20,
  padding: 16,
  borderRadius: 14,
  backgroundColor: '#F0F9FF',
  borderWidth: 1,
  borderColor: '#BAE6FD',
};

export const wizardTrustMainTitle: TextStyle = {
  fontSize: 17,
  fontWeight: '800',
  color: ui.textPrimary,
  marginBottom: 12,
};

export const wizardTrustSectionTitle: TextStyle = {
  fontSize: 15,
  fontWeight: '700',
  color: ui.textPrimary,
  marginBottom: 4,
};

export const wizardTrustSectionBody: TextStyle = {
  fontSize: 14,
  color: ui.textSecondary,
  lineHeight: 20,
  marginBottom: 12,
};

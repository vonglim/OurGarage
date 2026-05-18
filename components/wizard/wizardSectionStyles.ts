import { StyleSheet } from 'react-native';

import { wizardLayout } from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

/** Section kicker labels (PICKUP METHOD, etc.) — aligned with creation wizard density. */
export const wizardSectionLabelStyle = StyleSheet.create({
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.textMuted,
    letterSpacing: 0.7,
  },
  /** When a label is not inside a `wizardSectionStackStyle` parent. */
  kickerSpaced: {
    marginTop: wizardLayout.sectionLabelToContent,
  },
  kickerFirst: {},
});

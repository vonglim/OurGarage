import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  wizardLayout,
  wizardSectionBlockStyle,
  wizardSectionContentStyle,
} from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

export type WizardJourneyStep = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

export type WizardJourneyStepsListProps = {
  title: string;
  steps: WizardJourneyStep[];
};

export function WizardJourneyStepsList({ title, steps }: WizardJourneyStepsListProps) {
  return (
    <View style={wizardSectionBlockStyle}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[wizardSectionContentStyle, styles.list]}>
        {steps.map((row, index) => (
          <View
            key={row.title}
            style={[styles.row, index < steps.length - 1 && styles.rowBorder]}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={row.icon} size={20} color="#16A34A" />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowBody}>{row.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.2,
  },
  list: {
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    backgroundColor: ui.cardBg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: wizardLayout.journeyRowPaddingHorizontal,
    paddingVertical: wizardLayout.journeyRowPaddingVertical,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.15,
  },
  rowBody: {
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 20,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';
import { wizardLayout } from '@/constants/wizardLayout';

export type WizardRentalSummaryCardProps = {
  title: string;
  ownerLine: string;
  rentalCode: string;
  thumbUri?: string | null;
  dateRange: string;
  durationDays?: string;
  handoffTitle: string;
  handoffSubtitle: string;
  handoffIcon?: keyof typeof Ionicons.glyphMap;
};

type SummaryMetaColumnProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
};

function SummaryMetaColumn({ icon, title, subtitle }: SummaryMetaColumnProps) {
  return (
    <View style={styles.metaColumn}>
      <Ionicons name={icon} size={17} color="#16A34A" style={styles.metaIcon} />
      <View style={styles.metaTextCol}>
        <Text style={styles.metaTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.metaSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function WizardRentalSummaryCard({
  title,
  ownerLine,
  rentalCode,
  thumbUri,
  dateRange,
  durationDays,
  handoffTitle,
  handoffSubtitle,
  handoffIcon = 'location-outline',
}: WizardRentalSummaryCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.itemRow}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={styles.thumbPh}>
            <Ionicons name="cube-outline" size={20} color={ui.textSecondary} />
          </View>
        )}
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.owner} numberOfLines={1}>
            {ownerLine}
          </Text>
          <Text style={styles.code} numberOfLines={1}>
            {rentalCode}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.metaRow}>
        <View style={styles.metaColumnWrap}>
          <SummaryMetaColumn
            icon="calendar-outline"
            title={dateRange}
            subtitle={durationDays || undefined}
          />
        </View>
        <View style={styles.metaVerticalRule} />
        <View style={styles.metaColumnWrap}>
          <SummaryMetaColumn
            icon={handoffIcon}
            title={handoffTitle}
            subtitle={handoffSubtitle}
          />
        </View>
      </View>
    </View>
  );
}

const pad = wizardLayout.summaryCardInset;

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: ui.cardBg,
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wizardLayout.sectionContentGap,
    paddingHorizontal: pad,
    paddingTop: pad,
    paddingBottom: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  thumbPh: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 16, fontWeight: '700', color: ui.textPrimary, letterSpacing: -0.2 },
  owner: { fontSize: 13, fontWeight: '500', color: ui.textSecondary },
  code: {
    fontSize: 10,
    fontWeight: '500',
    color: '#9CA3AF',
    letterSpacing: 0.15,
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginHorizontal: pad,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: pad,
    paddingVertical: wizardLayout.summaryMetaPaddingVertical,
  },
  metaColumnWrap: {
    flex: 1,
    minWidth: 0,
  },
  metaVerticalRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginHorizontal: wizardLayout.summaryMetaColumnGap,
    marginVertical: 2,
  },
  metaColumn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: wizardLayout.summaryMetaColumnGap,
  },
  metaIcon: { marginTop: 1 },
  metaTextCol: { flex: 1, minWidth: 0, gap: 2 },
  metaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.15,
    lineHeight: 18,
  },
  metaSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 16,
  },
});

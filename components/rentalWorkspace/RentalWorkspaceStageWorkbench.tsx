import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import type {
  RentalWorkspaceBenchTone,
  RentalWorkspacePrimaryStageModel,
} from '@/lib/rentalWorkspacePrimaryStageModel';

export type RentalWorkspaceStageWorkbenchProps = {
  model: RentalWorkspacePrimaryStageModel;
  children?: React.ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
};

const TONE_SHELL: Record<
  RentalWorkspaceBenchTone,
  { bg: string; border: string; iconBg: string; iconBorder: string; iconColor: string }
> = {
  coordination: {
    bg: '#F4F2FF',
    border: 'rgba(91, 33, 182, 0.22)',
    iconBg: 'rgba(255, 255, 255, 0.75)',
    iconBorder: 'rgba(91, 33, 182, 0.15)',
    iconColor: ui.primary,
  },
  pickup: {
    bg: '#F0FDF4',
    border: 'rgba(22, 163, 74, 0.2)',
    iconBg: 'rgba(255, 255, 255, 0.85)',
    iconBorder: 'rgba(22, 163, 74, 0.18)',
    iconColor: '#15803D',
  },
  active: {
    bg: '#EFF6FF',
    border: 'rgba(37, 99, 235, 0.2)',
    iconBg: 'rgba(255, 255, 255, 0.9)',
    iconBorder: 'rgba(37, 99, 235, 0.15)',
    iconColor: '#1D4ED8',
  },
  return: {
    bg: '#FFFBEB',
    border: 'rgba(217, 119, 6, 0.28)',
    iconBg: 'rgba(255, 255, 255, 0.9)',
    iconBorder: 'rgba(217, 119, 6, 0.22)',
    iconColor: '#B45309',
  },
  closure: {
    bg: '#F8FAFC',
    border: 'rgba(15, 23, 42, 0.1)',
    iconBg: '#FFFFFF',
    iconBorder: 'rgba(15, 23, 42, 0.08)',
    iconColor: ui.textSecondary,
  },
  neutral: {
    bg: '#F9FAFB',
    border: 'rgba(15, 23, 42, 0.1)',
    iconBg: '#FFFFFF',
    iconBorder: 'rgba(15, 23, 42, 0.08)',
    iconColor: ui.textSecondary,
  },
};

function toneIcon(tone: RentalWorkspaceBenchTone): keyof typeof Ionicons.glyphMap {
  switch (tone) {
    case 'coordination':
      return 'calendar-outline';
    case 'pickup':
      return 'cube-outline';
    case 'active':
      return 'pulse-outline';
    case 'return':
      return 'arrow-undo-outline';
    case 'closure':
      return 'checkmark-done-outline';
    default:
      return 'ellipse-outline';
  }
}

function nextStepTitle(tone: RentalWorkspaceBenchTone): string {
  switch (tone) {
    case 'coordination':
      return 'Your next step';
    case 'pickup':
      return 'Handoff checklist';
    case 'active':
      return 'While it’s out';
    case 'return':
      return 'Close out return';
    case 'closure':
      return 'Summary';
    default:
      return 'Details';
  }
}

/**
 * Dominant “rental workspace” surface: one evolving stage card + optional embedded workflow body.
 * Business logic stays in the parent; this component is layout + hierarchy only.
 */
export function RentalWorkspaceStageWorkbench({
  model,
  children,
  onLayout,
}: RentalWorkspaceStageWorkbenchProps) {
  const hasBody = Boolean(children);
  const tone = model.benchTone;
  const shell = TONE_SHELL[tone] ?? TONE_SHELL.neutral;
  const flatInner = tone === 'active' || tone === 'pickup' || tone === 'return';

  return (
    <View
      style={[styles.shell, { backgroundColor: shell.bg, borderColor: shell.border }]}
      onLayout={onLayout}
      accessibilityRole="summary"
    >
      <View style={styles.headRow}>
        <View
          style={[
            styles.headIconWrap,
            { backgroundColor: shell.iconBg, borderColor: shell.iconBorder },
          ]}
        >
          <Ionicons name={toneIcon(tone)} size={18} color={shell.iconColor} />
        </View>
        <Text style={styles.stageLabel}>{model.stageLabel}</Text>
      </View>
      <Text style={[styles.summary, hasBody ? styles.summaryTightBottom : styles.summaryLooseBottom]} numberOfLines={5}>
        {model.summaryLine}
      </Text>
      {model.contextLine ? (
        <Text style={styles.contextLine} numberOfLines={3}>
          {model.contextLine}
        </Text>
      ) : null}
      {model.benchTone === 'active' ? (
        <Text style={styles.extensionHint} numberOfLines={2}>
          Need more time? Extensions aren’t automatic — agree any new dates in Messages.
        </Text>
      ) : null}
      {hasBody ? (
        <View style={[styles.nextStepBox, flatInner && styles.nextStepBoxFlat]}>
          <Text style={styles.nextStepKicker}>{nextStepTitle(tone)}</Text>
          <View style={styles.body}>{children}</View>
        </View>
      ) : null}
      {model.onPrimary ? (
        <Pressable
          pressOpacityFeedback={false}
          haptic
          disabled={model.primaryDisabled}
          onPress={model.onPrimary}
          style={({ pressed }) => [
            styles.cta,
            model.primaryDisabled && styles.ctaDisabled,
            pressed && !model.primaryDisabled && styles.ctaPressed,
          ]}
        >
          <Text style={[styles.ctaText, model.primaryDisabled && styles.ctaTextDisabled]}>{model.primaryLabel}</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" style={styles.ctaChevron} />
        </Pressable>
      ) : (
        <View style={[styles.cta, styles.ctaDisabled]}>
          <Text style={[styles.ctaText, styles.ctaTextDisabled]}>{model.primaryLabel}</Text>
        </View>
      )}
      {model.secondaryAction ? (
        <Pressable
          pressOpacityFeedback={false}
          haptic
          disabled={model.secondaryAction.disabled}
          onPress={model.secondaryAction.onPress}
          style={({ pressed }) => [
            styles.secondaryHit,
            model.secondaryAction?.disabled && styles.secondaryHitDisabled,
            pressed && !model.secondaryAction?.disabled && styles.secondaryHitPressed,
          ]}
        >
          <Ionicons name="flag-outline" size={16} color={ui.textSecondary} />
          <Text style={styles.secondaryText}>{model.secondaryAction.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    borderRadius: ui.radiusCard,
    paddingVertical: 14,
    paddingHorizontal: 13,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  headIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  stageLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: 0.7,
  },
  summary: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    lineHeight: 21,
  },
  contextLine: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    lineHeight: 18,
  },
  extensionHint: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  summaryTightBottom: { marginBottom: 6 },
  summaryLooseBottom: { marginBottom: 12 },
  nextStepBox: {
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  nextStepBoxFlat: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  nextStepKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: 0.55,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  body: {},
  cta: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ui.primary,
  },
  ctaChevron: { marginLeft: 2 },
  ctaPressed: { opacity: 0.92 },
  ctaDisabled: { backgroundColor: 'rgba(15, 23, 42, 0.12)' },
  ctaText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },
  ctaTextDisabled: { color: 'rgba(15, 23, 42, 0.45)' },
  secondaryHit: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  secondaryHitPressed: { opacity: 0.82 },
  secondaryHitDisabled: { opacity: 0.45 },
  secondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textSecondary,
  },
});

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import type {
  RentalWorkspaceBenchTone,
  RentalWorkspacePrimaryStageModel,
} from '@/lib/rentalWorkspacePrimaryStageModel';
import {
  rentalWorkbenchFocusHeadline,
  type RentalWorkspaceViewerRole,
} from '@/lib/rentalWorkspaceRoleCopy';

export type RentalWorkspaceStageWorkbenchProps = {
  model: RentalWorkspacePrimaryStageModel;
  viewerRole?: RentalWorkspaceViewerRole;
  children?: React.ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
};

type ToneShell = {
  bg: string;
  border: string;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
  stageLabel: string;
  summary: string;
  context: string;
  urgency: string;
  ctaBg: string;
  ctaText: string;
  secondary: string;
  dark: boolean;
};

const TONE_SHELL: Record<RentalWorkspaceBenchTone, ToneShell> = {
  coordination: {
    bg: '#F4F2FF',
    border: 'rgba(91, 33, 182, 0.22)',
    iconBg: 'rgba(255, 255, 255, 0.75)',
    iconBorder: 'rgba(91, 33, 182, 0.15)',
    iconColor: ui.primary,
    stageLabel: ui.textSecondary,
    summary: ui.textPrimary,
    context: ui.textSecondary,
    urgency: ui.textSecondary,
    ctaBg: ui.primary,
    ctaText: '#FFFFFF',
    secondary: ui.textSecondary,
    dark: false,
  },
  pickup: {
    bg: '#F0FDF4',
    border: 'rgba(22, 163, 74, 0.2)',
    iconBg: 'rgba(255, 255, 255, 0.85)',
    iconBorder: 'rgba(22, 163, 74, 0.18)',
    iconColor: '#15803D',
    stageLabel: ui.textSecondary,
    summary: ui.textPrimary,
    context: ui.textSecondary,
    urgency: ui.textSecondary,
    ctaBg: ui.primary,
    ctaText: '#FFFFFF',
    secondary: ui.textSecondary,
    dark: false,
  },
  active: {
    bg: '#0F172A',
    border: 'rgba(99, 102, 241, 0.35)',
    iconBg: 'rgba(99, 102, 241, 0.22)',
    iconBorder: 'rgba(129, 140, 248, 0.35)',
    iconColor: '#E0E7FF',
    stageLabel: 'rgba(199, 210, 254, 0.85)',
    summary: '#F8FAFC',
    context: 'rgba(226, 232, 240, 0.88)',
    urgency: 'rgba(253, 224, 71, 0.95)',
    ctaBg: '#FFFFFF',
    ctaText: '#0F172A',
    secondary: 'rgba(226, 232, 240, 0.75)',
    dark: true,
  },
  return: {
    bg: '#FFFBEB',
    border: 'rgba(217, 119, 6, 0.28)',
    iconBg: 'rgba(255, 255, 255, 0.9)',
    iconBorder: 'rgba(217, 119, 6, 0.22)',
    iconColor: '#B45309',
    stageLabel: ui.textSecondary,
    summary: ui.textPrimary,
    context: ui.textSecondary,
    urgency: ui.textSecondary,
    ctaBg: ui.primary,
    ctaText: '#FFFFFF',
    secondary: ui.textSecondary,
    dark: false,
  },
  closure: {
    bg: '#F8FAFC',
    border: 'rgba(15, 23, 42, 0.1)',
    iconBg: '#FFFFFF',
    iconBorder: 'rgba(15, 23, 42, 0.08)',
    iconColor: ui.textSecondary,
    stageLabel: ui.textSecondary,
    summary: ui.textPrimary,
    context: ui.textSecondary,
    urgency: ui.textSecondary,
    ctaBg: ui.primary,
    ctaText: '#FFFFFF',
    secondary: ui.textSecondary,
    dark: false,
  },
  neutral: {
    bg: '#F9FAFB',
    border: 'rgba(15, 23, 42, 0.1)',
    iconBg: '#FFFFFF',
    iconBorder: 'rgba(15, 23, 42, 0.08)',
    iconColor: ui.textSecondary,
    stageLabel: ui.textSecondary,
    summary: ui.textPrimary,
    context: ui.textSecondary,
    urgency: ui.textSecondary,
    ctaBg: ui.primary,
    ctaText: '#FFFFFF',
    secondary: ui.textSecondary,
    dark: false,
  },
};

function toneIcon(tone: RentalWorkspaceBenchTone): keyof typeof Ionicons.glyphMap {
  switch (tone) {
    case 'coordination':
      return 'calendar-outline';
    case 'pickup':
      return 'cube-outline';
    case 'active':
      return 'timer-outline';
    case 'return':
      return 'arrow-undo-outline';
    case 'closure':
      return 'checkmark-done-outline';
    default:
      return 'ellipse-outline';
  }
}

/**
 * Dominant “rental workspace” surface: one evolving stage card + optional embedded workflow body.
 * Business logic stays in the parent; this component is layout + hierarchy only.
 */
export function RentalWorkspaceStageWorkbench({
  model,
  viewerRole = 'renter',
  children,
  onLayout,
}: RentalWorkspaceStageWorkbenchProps) {
  const hasBody = Boolean(children);
  const tone = model.benchTone;
  const shell = TONE_SHELL[tone] ?? TONE_SHELL.neutral;
  const flatInner = tone === 'active' || tone === 'pickup' || tone === 'return';
  const focusHeadline = rentalWorkbenchFocusHeadline(tone, viewerRole);

  return (
    <View
      style={[styles.shell, { backgroundColor: shell.bg, borderColor: shell.border }, shell.dark && styles.shellDark]}
      onLayout={onLayout}
      accessibilityRole="summary"
    >
      <View style={styles.headRow}>
        <View
          style={[
            styles.headIconWrap,
            { backgroundColor: shell.iconBg, borderColor: shell.iconBorder },
            shell.dark && styles.headIconWrapDark,
          ]}
        >
          <Ionicons name={toneIcon(tone)} size={20} color={shell.iconColor} />
        </View>
        <Text style={[styles.stageLabel, { color: shell.stageLabel }]}>{model.stageLabel}</Text>
      </View>
      <Text
        style={[
          styles.summary,
          { color: shell.summary },
          hasBody ? styles.summaryTightBottom : styles.summaryLooseBottom,
        ]}
        numberOfLines={6}
      >
        {model.summaryLine}
      </Text>
      {model.contextLine ? (
        <Text style={[styles.contextLine, { color: shell.context }]} numberOfLines={3}>
          {model.contextLine}
        </Text>
      ) : null}
      {model.urgencyLine ? (
        <Text style={[styles.urgencyLine, { color: shell.urgency }]} numberOfLines={2}>
          {model.urgencyLine}
        </Text>
      ) : null}
      {hasBody ? (
        <View style={[styles.nextStepBox, flatInner && styles.nextStepBoxFlat]}>
          <Text style={[styles.nextStepKicker, shell.dark && styles.nextStepKickerDark]}>{focusHeadline}</Text>
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
            { backgroundColor: shell.ctaBg },
            model.primaryDisabled && styles.ctaDisabled,
            pressed && !model.primaryDisabled && styles.ctaPressed,
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              { color: shell.ctaText },
              model.primaryDisabled && styles.ctaTextDisabled,
            ]}
          >
            {model.primaryLabel}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={model.primaryDisabled ? 'rgba(15, 23, 42, 0.45)' : shell.ctaText}
            style={styles.ctaChevron}
          />
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
          <Ionicons
            name={model.secondaryAction.label === 'Decline' ? 'close-circle-outline' : 'chatbubble-outline'}
            size={16}
            color={shell.secondary}
          />
          <Text style={[styles.secondaryText, { color: shell.secondary }]}>{model.secondaryAction.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    borderRadius: ui.radiusCard,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shellDark: {
    borderWidth: 1,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  headIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  headIconWrapDark: {
    borderWidth: 1,
  },
  stageLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.85,
  },
  summary: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    letterSpacing: -0.25,
  },
  contextLine: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  urgencyLine: {
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  summaryTightBottom: { marginBottom: 6 },
  summaryLooseBottom: { marginBottom: 4 },
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
  nextStepKickerDark: {
    color: 'rgba(199, 210, 254, 0.75)',
  },
  body: {},
  cta: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ctaChevron: { marginLeft: 2 },
  ctaPressed: { opacity: 0.92 },
  ctaDisabled: { backgroundColor: 'rgba(15, 23, 42, 0.12)' },
  ctaText: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
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
  },
});

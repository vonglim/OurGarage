import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import type {
  CommandCenterStepKey,
  CommandCenterTone,
  RentalCommandCenterModel,
} from '@/lib/rentalCommandCenterModel';
import type { CommandCenterStep } from '@/lib/rentalCommandCenterModel';
import {
  RENTAL_COMMAND_CENTER_COLLAPSED_COMPACT,
  RENTAL_COMMAND_CENTER_COLLAPSED_HEIGHT,
  RENTAL_COMMAND_CENTER_DOCK_MARGIN_H,
  RENTAL_COMMAND_CENTER_EXPANDED_HEIGHT,
  RENTAL_COMMAND_CENTER_GAP_ABOVE_TAB,
} from '@/lib/rentalCommandCenterModel';

export type RentalCommandCenterProps = {
  model: RentalCommandCenterModel;
  bottomInset: number;
  scrollCompact?: boolean;
  onStepNavigate: (step: CommandCenterStepKey) => void;
  onPrimaryPress?: () => void;
  onSecondaryPress?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
};

/** Matches ON RENT workbench — operational navy dock */
const DOCK = {
  bg: '#0F172A',
  bgElevated: '#131C31',
  border: 'rgba(99, 102, 241, 0.38)',
  borderSoft: 'rgba(129, 140, 248, 0.22)',
  label: '#F8FAFC',
  labelMuted: 'rgba(226, 232, 240, 0.55)',
  subline: 'rgba(199, 210, 254, 0.72)',
  sublineActive: 'rgba(165, 180, 252, 0.95)',
  sublineDone: 'rgba(74, 222, 128, 0.9)',
  context: 'rgba(148, 163, 184, 0.88)',
  contextUrgent: 'rgba(252, 165, 165, 0.92)',
  connector: 'rgba(51, 65, 85, 0.9)',
  connectorDone: 'rgba(34, 197, 94, 0.55)',
  nodeUpcoming: 'rgba(148, 163, 184, 0.45)',
  nodeCurrent: '#6366F1',
  nodeCurrentRing: 'rgba(129, 140, 248, 0.55)',
  nodeDone: '#22C55E',
  iconBg: 'rgba(99, 102, 241, 0.22)',
  iconBorder: 'rgba(129, 140, 248, 0.35)',
  chevronBg: 'rgba(30, 41, 59, 0.85)',
  divider: 'rgba(99, 102, 241, 0.2)',
};

function contextLineColor(tone: CommandCenterTone): string {
  if (tone === 'urgent') return DOCK.contextUrgent;
  return DOCK.context;
}

function StageNode({ step }: { step: CommandCenterStep }) {
  if (step.done) {
    return (
      <View style={[styles.node, styles.nodeDone]}>
        <Text style={styles.nodeCheck}>✓</Text>
      </View>
    );
  }
  if (step.current) {
    return (
      <View style={styles.nodeCurrentWrap}>
        <View style={styles.nodeCurrentGlow} />
        <View style={[styles.node, styles.nodeCurrent]}>
          <View style={styles.nodeCurrentDot} />
        </View>
      </View>
    );
  }
  return <View style={[styles.node, styles.nodeUpcoming]} />;
}

function LifecycleDockTrack({
  steps,
  onStepPress,
}: {
  steps: CommandCenterStep[];
  onStepPress: (key: CommandCenterStepKey) => void;
}) {
  return (
    <View style={styles.track}>
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          <Pressable
            pressOpacityFeedback={false}
            onPress={() => onStepPress(step.key)}
            style={styles.stageCol}
            accessibilityRole="button"
            accessibilityLabel={`${step.label}, ${step.subline}`}
          >
            <StageNode step={step} />
            <Text
              style={[styles.stageLabel, step.current && styles.stageLabelCurrent]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
            <Text
              style={[
                styles.stageSubline,
                step.done && styles.stageSublineDone,
                step.current && styles.stageSublineCurrent,
              ]}
              numberOfLines={1}
            >
              {step.subline}
            </Text>
          </Pressable>
          {i < steps.length - 1 ? (
            <View
              style={[styles.connector, steps[i]?.done && styles.connectorDone]}
            />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function PulseIcon({ tone }: { tone: CommandCenterTone }) {
  return (
    <View style={styles.pulseIcon}>
      <Ionicons
        name={tone === 'complete' ? 'checkmark' : 'pulse'}
        size={16}
        color="#A5B4FC"
      />
    </View>
  );
}

export function RentalCommandCenter({
  model,
  bottomInset,
  scrollCompact = false,
  onStepNavigate,
  onPrimaryPress,
  onSecondaryPress,
  onExpandedChange,
}: RentalCommandCenterProps) {
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const animateExpand = useCallback(
    (toExpanded: boolean) => {
      setExpanded(toExpanded);
      onExpandedChange?.(toExpanded);
      Animated.timing(expandAnim, {
        toValue: toExpanded ? 1 : 0,
        duration: 240,
        useNativeDriver: false,
      }).start();
    },
    [expandAnim, onExpandedChange]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 10,
        onPanResponderRelease: (_, g) => {
          if (g.dy < -24) animateExpand(true);
          else if (g.dy > 24) animateExpand(false);
        },
      }),
    [animateExpand]
  );

  const collapsedH = scrollCompact
    ? RENTAL_COMMAND_CENTER_COLLAPSED_COMPACT
    : RENTAL_COMMAND_CENTER_COLLAPSED_HEIGHT;

  const dockHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedH, RENTAL_COMMAND_CENTER_EXPANDED_HEIGHT],
  });

  const bottomPad = Math.max(RENTAL_COMMAND_CENTER_GAP_ABOVE_TAB, bottomInset);

  return (
    <View
      style={[styles.root, { paddingBottom: bottomPad }]}
      pointerEvents="box-none"
    >
      {expanded ? (
        <Pressable
          pressOpacityFeedback={false}
          style={styles.scrim}
          onPress={() => animateExpand(false)}
          accessibilityLabel="Collapse rental dock"
        />
      ) : null}

      <Animated.View
        style={[
          styles.dock,
          {
            marginHorizontal: RENTAL_COMMAND_CENTER_DOCK_MARGIN_H,
            height: dockHeight,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.collapsedRow, scrollCompact && styles.collapsedRowCompact]}>
          <Pressable
            pressOpacityFeedback={false}
            onPress={() => animateExpand(!expanded)}
            style={styles.pulseHit}
          >
            <PulseIcon tone={model.tone} />
          </Pressable>
          <View style={styles.collapsedCenter}>
            <LifecycleDockTrack steps={model.steps} onStepPress={onStepNavigate} />
            {!expanded ? (
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => animateExpand(true)}
                style={styles.contextHit}
              >
                <Text
                  style={[styles.contextLine, { color: contextLineColor(model.tone) }]}
                  numberOfLines={1}
                >
                  {model.contextLine}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            pressOpacityFeedback={false}
            onPress={() => animateExpand(!expanded)}
            style={styles.chevronBtn}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse' : 'Expand'}
          >
            <Ionicons
              name={expanded ? 'chevron-down' : 'chevron-up'}
              size={16}
              color="rgba(226, 232, 240, 0.85)"
            />
          </Pressable>
        </View>

        {expanded ? (
          <View style={styles.expandedBlock}>
            <View style={styles.expandedDivider} />
            <Text style={styles.expandedEyebrow}>{model.expandedEyebrow}</Text>
            {model.scheduleLine ? (
              <Text style={styles.expandedSchedule} numberOfLines={1}>
                {model.scheduleLine}
              </Text>
            ) : null}
            {model.locationLine ? (
              <Text style={styles.expandedLocation} numberOfLines={1}>
                {model.locationLine}
              </Text>
            ) : null}
            <Text style={styles.expandedDetail} numberOfLines={2}>
              {model.detailLine}
            </Text>

            {model.primaryCta ? (
              <Pressable
                pressOpacityFeedback={false}
                haptic
                disabled={model.primaryCta.disabled}
                onPress={onPrimaryPress}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  model.primaryCta?.disabled && styles.primaryBtnDisabled,
                  pressed && !model.primaryCta?.disabled && { opacity: 0.94 },
                ]}
              >
                <Text
                  style={[
                    styles.primaryBtnText,
                    model.primaryCta.disabled && styles.primaryBtnTextDisabled,
                  ]}
                >
                  {model.primaryCta.label}
                </Text>
              </Pressable>
            ) : null}

            {model.secondaryCta ? (
              <Pressable
                pressOpacityFeedback={false}
                onPress={onSecondaryPress}
                disabled={model.secondaryCta.disabled}
                style={({ pressed }) => [styles.secondaryHit, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.secondaryText}>{model.secondaryCta.label}</Text>
              </Pressable>
            ) : null}

            <View style={styles.miniTimeline}>
              {model.steps.map((step) => (
                <Pressable
                  key={step.key}
                  pressOpacityFeedback={false}
                  onPress={() => onStepNavigate(step.key)}
                  style={({ pressed }) => [styles.miniRow, pressed && { opacity: 0.88 }]}
                >
                  <StageNode step={step} />
                  <Text
                    style={[
                      styles.miniLabel,
                      step.current && !step.done && styles.miniLabelCurrent,
                      step.done && styles.miniLabelDone,
                    ]}
                  >
                    {step.timelineLabel}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  dock: {
    backgroundColor: DOCK.bg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: DOCK.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 10,
    gap: 8,
    minHeight: 72,
  },
  collapsedRowCompact: {
    paddingTop: 8,
    paddingBottom: 6,
    minHeight: 62,
  },
  pulseHit: { marginTop: 2 },
  pulseIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: DOCK.iconBg,
    borderWidth: 1,
    borderColor: DOCK.iconBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextHit: { alignSelf: 'flex-start', marginTop: 5 },
  collapsedCenter: { flex: 1, minWidth: 0 },
  chevronBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: DOCK.chevronBg,
    borderWidth: 1,
    borderColor: DOCK.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  contextLine: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.15,
    paddingLeft: 2,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stageCol: {
    flex: 1,
    alignItems: 'center',
    maxWidth: 88,
  },
  node: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDone: {
    backgroundColor: DOCK.nodeDone,
    borderWidth: 0,
  },
  nodeCheck: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: -1,
  },
  nodeCurrentWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeCurrentGlow: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.45)',
  },
  nodeCurrent: {
    backgroundColor: DOCK.nodeCurrent,
    borderWidth: 2,
    borderColor: DOCK.nodeCurrentRing,
  },
  nodeCurrentDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFFFFF',
  },
  nodeUpcoming: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: DOCK.nodeUpcoming,
  },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: DOCK.connector,
    marginTop: 7,
    marginHorizontal: 2,
    borderRadius: 1,
    maxWidth: 28,
  },
  connectorDone: { backgroundColor: DOCK.connectorDone },
  stageLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: DOCK.labelMuted,
    letterSpacing: 0.1,
  },
  stageLabelCurrent: { color: DOCK.label },
  stageSubline: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: '500',
    color: DOCK.labelMuted,
    letterSpacing: 0.05,
  },
  stageSublineCurrent: { color: DOCK.sublineActive },
  stageSublineDone: { color: DOCK.sublineDone },
  expandedBlock: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  expandedDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: DOCK.divider,
    marginBottom: 10,
  },
  expandedEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: 'rgba(199, 210, 254, 0.65)',
    marginBottom: 4,
  },
  expandedSchedule: {
    fontSize: 14,
    fontWeight: '700',
    color: DOCK.label,
    letterSpacing: -0.2,
  },
  expandedLocation: {
    fontSize: 11,
    fontWeight: '500',
    color: DOCK.subline,
    marginTop: 2,
  },
  expandedDetail: {
    fontSize: 11,
    fontWeight: '500',
    color: DOCK.context,
    marginTop: 6,
    marginBottom: 10,
    lineHeight: 15,
  },
  primaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  primaryBtnTextDisabled: { color: 'rgba(15, 23, 42, 0.5)' },
  secondaryHit: { alignItems: 'center', paddingVertical: 4, marginBottom: 8 },
  secondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(199, 210, 254, 0.85)',
  },
  miniTimeline: { gap: 6, marginTop: 2 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: DOCK.labelMuted,
    flex: 1,
  },
  miniLabelCurrent: { color: DOCK.label, fontWeight: '600' },
  miniLabelDone: { color: DOCK.sublineDone },
});

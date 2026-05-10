import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pressable as OgPressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

const NODE_DONE = '#16A34A';
const NODE_CURRENT = ui.primary;
const NODE_ATTENTION = '#D97706';
const NODE_LOCKED = '#94A3B8';
const CONNECTOR_DONE = 'rgba(22, 163, 74, 0.35)';
const CONNECTOR_MUTED = 'rgba(148, 163, 184, 0.45)';
const LABEL_ACTIVE = '#0F172A';
const LABEL_MUTED = '#94A3B8';

export type LifecycleNavigatorStep = { key: string; label: string };

export type RentalLifecycleNavigatorProps = {
  steps: readonly LifecycleNavigatorStep[];
  /** Per-step: phase fully completed */
  stepDone: boolean[];
  /** Index of the step user is in (0..steps.length-1) */
  currentIndex: number;
  /** Optional step that needs attention (amber) */
  attentionIndex: number | null;
  /** All steps complete — show completion banner instead */
  transactionComplete: boolean;
  onStepPress: (index: number) => void;
  /** Wide horizontal strip; swipe-ready structure for a future pager */
  horizontal?: boolean;
};

function LifecycleNode({
  done,
  current,
  locked,
  attention,
  label,
  onPress,
  pulse,
}: {
  done: boolean;
  current: boolean;
  locked: boolean;
  attention: boolean;
  label: string;
  onPress: () => void;
  pulse: Animated.Value;
}) {
  const scale = useMemo(() => pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }), [pulse]);
  const glow = useMemo(() => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] }), [pulse]);

  let borderColor = NODE_LOCKED;
  let bg = '#FFFFFF';
  let icon: React.ReactNode = <Text style={styles.nodeDotMuted}> </Text>;

  if (done) {
    borderColor = NODE_DONE;
    bg = NODE_DONE;
    icon = <Ionicons name="checkmark" size={14} color="#FFFFFF" />;
  } else if (attention) {
    borderColor = NODE_ATTENTION;
    bg = '#FFFBEB';
    icon = <Ionicons name="alert" size={14} color={NODE_ATTENTION} />;
  } else if (current) {
    borderColor = NODE_CURRENT;
    bg = '#EFF6FF';
    icon = <View style={styles.nodeInnerCurrent} />;
  } else if (locked) {
    icon = <Ionicons name="lock-closed" size={11} color={NODE_LOCKED} />;
  } else {
    icon = <View style={styles.nodeInnerFuture} />;
  }

  const nodeBody = (
    <Animated.View
      style={[
        styles.nodeOuter,
        current && !done && { transform: [{ scale }] },
        current &&
          !done &&
          !attention && {
            shadowColor: NODE_CURRENT,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: glow,
            shadowRadius: 8,
            elevation: 4,
          },
      ]}
    >
      <View style={[styles.nodeCircle, { borderColor, backgroundColor: bg }]}>{icon}</View>
      <Text
        numberOfLines={2}
        style={[
          styles.nodeLabel,
          done && styles.nodeLabelDone,
          current && !done && styles.nodeLabelCurrent,
          locked && !current && !done && styles.nodeLabelMuted,
          attention && !done && styles.nodeLabelAttention,
        ]}
      >
        {label}
      </Text>
    </Animated.View>
  );

  return (
    <OgPressable
      pressOpacityFeedback={false}
      accessibilityRole="button"
      accessibilityLabel={`${label} phase`}
      onPress={onPress}
      style={({ pressed }) => [styles.nodePressable, pressed && { opacity: 0.88 }]}
    >
      {nodeBody}
    </OgPressable>
  );
}

export function RentalLifecycleNavigator({
  steps,
  stepDone,
  currentIndex,
  attentionIndex,
  transactionComplete,
  onStepPress,
  horizontal = true,
}: RentalLifecycleNavigatorProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  if (transactionComplete) {
    return (
      <View style={styles.completeBanner}>
        <Ionicons name="checkmark-circle" size={22} color={NODE_DONE} />
        <Text style={styles.completeBannerText}>Transaction complete</Text>
      </View>
    );
  }

  const row = (
    <View style={styles.row}>
      {steps.map((step, idx) => {
        const done = Boolean(stepDone[idx]);
        const current = idx === currentIndex;
        const locked = idx > currentIndex && !done;
        const attention = attentionIndex === idx && !done;
        const connectorDone = stepDone[idx] && idx < steps.length - 1;

        return (
          <React.Fragment key={step.key}>
            <LifecycleNode
              done={done}
              current={current}
              locked={locked}
              attention={attention}
              label={step.label}
              onPress={() => onStepPress(idx)}
              pulse={pulse}
            />
            {idx < steps.length - 1 ? (
              <View
                style={[
                  styles.connector,
                  { backgroundColor: connectorDone ? CONNECTOR_DONE : CONNECTOR_MUTED },
                ]}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {row}
      </ScrollView>
    );
  }

  return row;
}

const styles = StyleSheet.create({
  horizontalScrollContent: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minWidth: '100%',
    gap: 0,
  },
  completeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: ui.radiusCard,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  completeBannerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14532D',
  },
  nodePressable: {
    flex: 1,
    minWidth: 56,
    maxWidth: 88,
    alignItems: 'center',
  },
  nodeOuter: {
    alignItems: 'center',
    gap: 6,
  },
  nodeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeInnerCurrent: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: NODE_CURRENT,
  },
  nodeInnerFuture: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: NODE_LOCKED,
    opacity: 0.6,
  },
  nodeDotMuted: {
    fontSize: 8,
    color: NODE_LOCKED,
  },
  nodeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: LABEL_MUTED,
    textAlign: 'center',
    lineHeight: 12,
  },
  nodeLabelDone: {
    color: NODE_DONE,
    fontWeight: '600',
  },
  nodeLabelCurrent: {
    color: LABEL_ACTIVE,
    fontWeight: '800',
  },
  nodeLabelMuted: {
    opacity: 0.72,
  },
  nodeLabelAttention: {
    color: NODE_ATTENTION,
    fontWeight: '700',
  },
  connector: {
    width: 12,
    height: 3,
    borderRadius: 2,
    marginTop: 14,
    flexShrink: 0,
  },
});

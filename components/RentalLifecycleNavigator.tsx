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
  stepDone: boolean[];
  currentIndex: number;
  attentionIndex: number | null;
  transactionComplete: boolean;
  onStepPress: (index: number) => void;
  horizontal?: boolean;
  /** Tighter, lower-weight progress strip (`micro` = breadcrumb strip) */
  density?: 'default' | 'compact' | 'micro';
};

function LifecycleNode({
  done,
  current,
  locked,
  attention,
  label,
  onPress,
  pulse,
  compact,
  micro,
}: {
  done: boolean;
  current: boolean;
  locked: boolean;
  attention: boolean;
  label: string;
  onPress: () => void;
  pulse: Animated.Value;
  compact: boolean;
  micro: boolean;
}) {
  const scale = useMemo(() => pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }), [pulse]);
  const glow = useMemo(() => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.45] }), [pulse]);

  const circleSize = micro ? 14 : compact ? 20 : 30;
  const iconMain = micro ? 8 : compact ? 11 : 14;
  const iconLock = micro ? 7 : compact ? 9 : 11;
  const innerCurrent = micro ? 5 : compact ? 7 : 10;
  const innerFuture = micro ? 4 : compact ? 6 : 8;

  let borderColor = NODE_LOCKED;
  let bg = '#FFFFFF';
  let icon: React.ReactNode = <Text style={[styles.nodeDotMuted, compact && styles.nodeDotMutedCompact]}> </Text>;

  if (done) {
    borderColor = NODE_DONE;
    bg = NODE_DONE;
    icon = <Ionicons name="checkmark" size={iconMain} color="#FFFFFF" />;
  } else if (attention) {
    borderColor = NODE_ATTENTION;
    bg = '#FFFBEB';
    icon = <Ionicons name="alert" size={iconMain} color={NODE_ATTENTION} />;
  } else if (current) {
    borderColor = NODE_CURRENT;
    bg = '#EFF6FF';
    icon = <View style={[styles.nodeInnerCurrent, { width: innerCurrent, height: innerCurrent, borderRadius: innerCurrent / 2 }]} />;
  } else if (locked) {
    icon = <Ionicons name="lock-closed" size={iconLock} color={NODE_LOCKED} />;
  } else {
    icon = (
      <View
        style={[
          styles.nodeInnerFuture,
          { width: innerFuture, height: innerFuture, borderRadius: innerFuture / 2 },
        ]}
      />
    );
  }

  const nodeBody = (
    <Animated.View
      style={[
        styles.nodeOuter,
        (compact || micro) && styles.nodeOuterCompact,
        current && !done && !compact && !micro && { transform: [{ scale }] },
        current &&
          !done &&
          !attention &&
          !compact &&
          !micro && {
            shadowColor: NODE_CURRENT,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: glow,
            shadowRadius: 8,
            elevation: 4,
          },
      ]}
    >
      <View
        style={[
          styles.nodeCircle,
          (compact || micro) && styles.nodeCircleCompact,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            borderColor,
            backgroundColor: bg,
          },
        ]}
      >
        {icon}
      </View>
      <Text
        numberOfLines={compact || micro ? 1 : 2}
        style={[
          styles.nodeLabel,
          (compact || micro) && styles.nodeLabelCompact,
          micro && styles.nodeLabelMicro,
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
      style={({ pressed }) => [
        styles.nodePressable,
        (compact || micro) && styles.nodePressableCompact,
        micro && styles.nodePressableMicro,
        pressed && { opacity: 0.88 },
      ]}
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
  density = 'default',
}: RentalLifecycleNavigatorProps) {
  const compact = density === 'compact' || density === 'micro';
  const micro = density === 'micro';
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (compact) return;
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
  }, [pulse, compact]);

  if (transactionComplete) {
    return (
      <View style={[styles.completeBanner, compact && styles.completeBannerCompact, micro && styles.completeBannerMicro]}>
        <Ionicons name="checkmark-circle" size={micro ? 14 : compact ? 16 : 22} color={NODE_DONE} />
        <Text style={[styles.completeBannerText, compact && styles.completeBannerTextCompact, micro && styles.completeBannerTextMicro]}>
          Complete
        </Text>
      </View>
    );
  }

  const row = (
    <View style={[styles.row, compact && styles.rowCompact]}>
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
              compact={compact}
              micro={micro}
            />
            {idx < steps.length - 1 ? (
              <View
                style={[
                  styles.connector,
                  compact && styles.connectorCompact,
                  micro && styles.connectorMicro,
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
        contentContainerStyle={[
          styles.horizontalScrollContent,
          compact && styles.horizontalScrollContentCompact,
          micro && styles.horizontalScrollContentMicro,
        ]}
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
  horizontalScrollContentCompact: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  horizontalScrollContentMicro: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    opacity: 0.92,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minWidth: '100%',
    gap: 0,
  },
  rowCompact: {
    alignItems: 'center',
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
  completeBannerCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    borderRadius: 10,
  },
  completeBannerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14532D',
  },
  completeBannerTextCompact: {
    fontSize: 12,
    fontWeight: '700',
  },
  completeBannerMicro: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
    borderRadius: 8,
    opacity: 0.9,
  },
  completeBannerTextMicro: {
    fontSize: 11,
    fontWeight: '600',
  },
  nodePressable: {
    flex: 1,
    minWidth: 56,
    maxWidth: 88,
    alignItems: 'center',
  },
  nodePressableCompact: {
    minWidth: 44,
    maxWidth: 72,
  },
  nodePressableMicro: {
    minWidth: 34,
    maxWidth: 56,
  },
  nodeOuter: {
    alignItems: 'center',
    gap: 6,
  },
  nodeOuterCompact: {
    gap: 3,
  },
  nodeCircle: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeCircleCompact: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  nodeInnerCurrent: {
    backgroundColor: NODE_CURRENT,
  },
  nodeInnerFuture: {
    backgroundColor: NODE_LOCKED,
    opacity: 0.6,
  },
  nodeDotMuted: {
    fontSize: 8,
    color: NODE_LOCKED,
  },
  nodeDotMutedCompact: {
    fontSize: 6,
  },
  nodeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: LABEL_MUTED,
    textAlign: 'center',
    lineHeight: 12,
  },
  nodeLabelCompact: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '600',
  },
  nodeLabelMicro: {
    fontSize: 8,
    lineHeight: 10,
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
  connectorCompact: {
    width: 8,
    height: 2,
    marginTop: 10,
  },
  connectorMicro: {
    width: 5,
    height: 1.5,
    marginTop: 7,
    opacity: 0.75,
  },
});

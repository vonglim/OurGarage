import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  wizardCelebrationHeroStyle,
  wizardCelebrationHeroTextStyle,
  wizardLayout,
} from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

const SPARKLE_ACCENTS = [
  { top: 8, left: '14%' as const, color: '#FDE047', size: 5 },
  { top: 22, left: '78%' as const, color: '#C4B5FD', size: 4 },
  { top: 40, left: '10%' as const, color: '#93C5FD', size: 4 },
  { top: 16, left: '88%' as const, color: '#86EFAC', size: 5 },
  { top: 52, left: '54%' as const, color: '#FDE68A', size: 3 },
] as const;

export type WizardCelebrationHeroProps = {
  headline: string;
  support: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function WizardCelebrationHero({ headline, support, style }: WizardCelebrationHeroProps) {
  const heroScale = useRef(new Animated.Value(0.92)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(heroScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      Animated.timing(heroOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [heroOpacity, heroScale]);

  return (
    <Animated.View style={[wizardCelebrationHeroStyle, style, { opacity: heroOpacity }]}>
      <Animated.View
        style={[
          styles.iconWrap,
          { transform: [{ scale: heroScale }] },
        ]}
      >
        <Animated.View style={styles.sparkleLayer} pointerEvents="none">
          {SPARKLE_ACCENTS.map((s, i) => (
            <Animated.View
              key={i}
              style={[
                styles.sparkle,
                {
                  top: s.top,
                  left: s.left,
                  width: s.size,
                  height: s.size,
                  borderRadius: s.size / 2,
                  backgroundColor: s.color,
                },
              ]}
            />
          ))}
        </Animated.View>
        <Animated.View style={styles.iconGlow} />
        <Animated.View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={36} color="#FFFFFF" />
        </Animated.View>
      </Animated.View>

      <View style={wizardCelebrationHeroTextStyle}>
        <Text style={styles.headline}>{headline}</Text>
        {typeof support === 'string' ? <Text style={styles.support}>{support}</Text> : support}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: wizardLayout.celebrationHeroOuter,
    height: wizardLayout.celebrationHeroOuter,
  },
  sparkleLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
  },
  sparkle: {
    position: 'absolute',
    opacity: 0.55,
  },
  iconGlow: {
    position: 'absolute',
    width: wizardLayout.celebrationHeroOuter,
    height: wizardLayout.celebrationHeroOuter,
    borderRadius: wizardLayout.celebrationHeroOuter / 2,
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
  },
  iconCircle: {
    width: wizardLayout.celebrationHeroInner,
    height: wizardLayout.celebrationHeroInner,
    borderRadius: wizardLayout.celebrationHeroInner / 2,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: ui.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 34,
    maxWidth: wizardLayout.celebrationHeadlineMaxWidth,
  },
  support: {
    fontSize: 16,
    fontWeight: '500',
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    maxWidth: wizardLayout.celebrationSupportMaxWidth,
  },
});

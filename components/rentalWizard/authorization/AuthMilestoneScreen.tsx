import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { AuthTrustLine } from '@/components/rentalWizard/authorization/AuthTrustLine';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import {
  wizardContentGutterStyle,
  wizardLayout,
  wizardScreenBleedStyle,
} from '@/constants/wizardLayout';
import type { AuthorizationMilestoneConfig } from '@/lib/rentalAuthorization/authorizationMilestones';

export type AuthMilestoneScreenProps = {
  config: AuthorizationMilestoneConfig;
  onBack: () => void;
  onContinue: () => void;
  busy?: boolean;
};

/** Full-bleed celebration screen — same edge treatment as `WizardTransitionShell`. */
export function AuthMilestoneScreen({
  config,
  onBack,
  onContinue,
  busy = false,
}: AuthMilestoneScreenProps) {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const heroBg = config.gradient[0];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  return (
    <ScreenWrapper
      style={[styles.screenWrap, wizardScreenBleedStyle, { backgroundColor: heroBg }]}
      innerStyle={styles.screenInner}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.flex}>
        <LinearGradient
          colors={[...config.gradient]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.headerBlock}>
          <View style={[styles.minimalHeader, { paddingTop: Math.max(insets.top, 8) }]}>
            <Pressable
              pressOpacityFeedback={false}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="chevron-back" size={24} color="#F8FAFC" />
            </Pressable>
            <View style={styles.headerTitleSpacer} />
            <View style={styles.headerBtn} />
          </View>
        </View>

        <View style={styles.scrollArea}>
          <View style={styles.center}>
            <Animated.View style={[styles.iconGlow, { opacity, transform: [{ scale }] }]}>
              <Ionicons name={config.icon} size={48} color={config.iconTint} />
            </Animated.View>

            <Animated.View style={[styles.textBlock, { opacity }]}>
              <Text style={styles.headline}>{config.headline}</Text>
              <Text style={styles.subheadline}>{config.support}</Text>
            </Animated.View>

            <Animated.View style={[styles.trustBlock, { opacity }]}>
              {config.trustLines.map((line) => (
                <AuthTrustLine key={line} text={line} variant="onDark" />
              ))}
            </Animated.View>
          </View>
        </View>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, wizardLayout.footerBottomMin),
            },
          ]}
        >
          <Pressable
            pressOpacityFeedback={false}
            haptic
            disabled={busy}
            onPress={onContinue}
            style={({ pressed }) => [
              styles.primaryBtn,
              busy && styles.primaryBtnDisabled,
              pressed && !busy && { opacity: 0.94 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={ui.primary} />
            ) : (
              <View style={styles.primaryBtnInner}>
                <Text style={styles.primaryBtnText}>{config.primaryLabel}</Text>
                <Ionicons name="arrow-forward" size={18} color={ui.primary} />
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
  },
  screenInner: { flex: 1 },
  flex: { flex: 1 },
  headerBlock: {
    paddingBottom: wizardLayout.headerBlockPaddingBottom,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  minimalHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...wizardContentGutterStyle,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleSpacer: { flex: 1 },
  scrollArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 28,
    ...wizardContentGutterStyle,
    gap: wizardLayout.bodyGap,
  },
  iconGlow: {
    width: wizardLayout.celebrationHeroOuter,
    height: wizardLayout.celebrationHeroOuter,
    borderRadius: wizardLayout.celebrationHeroOuter / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129, 140, 248, 0.35)',
  },
  textBlock: {
    alignItems: 'center',
    gap: wizardLayout.celebrationHeroTextGap,
    maxWidth: wizardLayout.celebrationHeadlineMaxWidth,
    width: '100%',
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 34,
    maxWidth: wizardLayout.celebrationHeadlineMaxWidth,
  },
  subheadline: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(226, 232, 240, 0.78)',
    textAlign: 'center',
    lineHeight: 23,
    maxWidth: wizardLayout.celebrationSupportMaxWidth,
  },
  trustBlock: {
    gap: 10,
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  footer: {
    ...wizardContentGutterStyle,
    paddingTop: wizardLayout.footerPaddingTop,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
  },
  primaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: wizardLayout.ctaBorderRadius,
    paddingVertical: wizardLayout.ctaPaddingVertical,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { authPremium } from '@/components/rentalWizard/authorization/authPremiumTheme';
import { ui } from '@/constants/appUi';

export type AuthGradientButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  showArrow?: boolean;
  variant?: 'primary' | 'success';
};

export function AuthGradientButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  showArrow = false,
  variant = 'primary',
}: AuthGradientButtonProps) {
  const colors =
    variant === 'success' ? authPremium.gradient.success : authPremium.gradient.cta;

  return (
    <Pressable
      pressOpacityFeedback={false}
      haptic
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        (disabled || busy) && styles.disabled,
        pressed && !disabled && !busy && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={[...colors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.glow} />
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View style={styles.inner}>
            <Text style={styles.label}>{label}</Text>
            {showArrow ? (
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            ) : null}
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    borderRadius: authPremium.radius.cta,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
  disabled: { opacity: 0.45, shadowOpacity: 0 },
  pressed: { transform: [{ scale: 0.985 }] },
  gradient: {
    paddingVertical: 17,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});

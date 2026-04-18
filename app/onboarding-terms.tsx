import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { setOnboardingTermsAccepted } from './store/agreementsStore';
import { ui } from '@/constants/appUi';

const POINTS = [
  'You are responsible for any agreements you make with other people on OurGarage.',
  'OurGarage is here to help neighbors connect. We do not provide the tools or handle payments between you and others.',
  'Be honest in listings and messages, respond in good faith, and treat people the way you would want to be treated.',
];

export default function OnboardingTermsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const onAgree = async () => {
    setBusy(true);
    try {
      await setOnboardingTermsAccepted();
      router.replace('/home');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 28 + insets.top, paddingBottom: 28 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Welcome to OurGarage</Text>
        <Text style={styles.lead}>
          Before you continue, please read the following. This is not legal advice—just plain expectations
          for using the app.
        </Text>

        <View style={styles.card}>
          {POINTS.map((line, i) => (
            <View key={i} style={[styles.bulletRow, i > 0 && styles.bulletRowSpaced]}>
              <Text style={styles.bulletMark}>•</Text>
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          onPress={() => void onAgree()}
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryBtn,
            (pressed || busy) && styles.primaryBtnPressed,
            busy && styles.primaryBtnDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>Agree & Continue</Text>
          )}
        </Pressable>
      </View>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  lead: {
    fontSize: 16,
    lineHeight: 24,
    color: ui.textSubtle,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bulletRowSpaced: {
    marginTop: 14,
  },
  bulletMark: {
    fontSize: 16,
    lineHeight: 24,
    color: ui.primary,
    width: 22,
    fontWeight: '700',
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#1C1C1E',
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryBtnPressed: {
    opacity: ui.pressOpacity,
  },
  primaryBtnDisabled: {
    opacity: 0.75,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});

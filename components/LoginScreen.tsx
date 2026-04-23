import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { supabase } from '@/lib/supabase';

const OTP_COOLDOWN_SEC = 10;

/**
 * Email OTP (magic link). No password; user completes sign-in from the link and session restores in-app.
 * Cooldown after each request limits Supabase rate limits (429) from button spam.
 */
export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  const trimmed = email.trim();
  const canSubmit = trimmed.length > 0 && !sending && cooldownSec === 0;

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = setTimeout(() => {
      setCooldownSec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearTimeout(t);
  }, [cooldownSec]);

  const onSend = async () => {
    if (!canSubmit) return;
    setError(null);
    setSending(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo:
            Platform.OS === 'web' && typeof window !== 'undefined'
              ? window.location.origin
              : Linking.createURL('/'),
        },
      });
      if (otpError) {
        setError(otpError.message);
        return;
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
      setCooldownSec(OTP_COOLDOWN_SEC);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Sign in or create an account</Text>
        <Text style={styles.subtitle}>We’ll email you a login link.</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={ui.textSecondary}
          style={styles.input}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoCorrect={false}
          editable={!sending}
        />

        <Pressable
          onPress={() => {
            void onSend();
          }}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            !canSubmit && styles.buttonDisabled,
          ]}
          pressOpacityFeedback={false}
          disabled={!canSubmit}
          haptic
        >
          {sending ? (
            <ActivityIndicator color={ui.primaryOn} />
          ) : (
            <Text style={styles.buttonLabel}>{sent ? 'Resend link' : 'Continue'}</Text>
          )}
        </Pressable>

        {error != null && error.length > 0 ? <Text style={styles.error}>{error}</Text> : null}

        {cooldownSec > 0 ? (
          <Text style={styles.cooldown} accessibilityLiveRegion="polite">
            {sent && error == null
              ? `Check your email. You can request another link in ${cooldownSec}s.`
              : `Please wait ${cooldownSec}s before trying again.`}
          </Text>
        ) : sent && error == null ? (
          <Text style={styles.success} accessibilityLiveRegion="polite">
            Check your email. You can request another link if you don&apos;t see it.
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.background,
    paddingHorizontal: 20,
  },
  inner: {
    flex: 1,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: ui.textSecondary,
    marginBottom: 24,
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.surfaceInput,
    paddingHorizontal: 14,
    fontSize: 17,
    color: ui.textPrimary,
    marginBottom: 16,
  },
  button: {
    height: 50,
    borderRadius: 10,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: ui.primaryPressed },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { fontSize: 17, fontWeight: '600', color: ui.primaryOn },
  error: { marginTop: 16, color: '#B91C1C', fontSize: 15 },
  success: { marginTop: 16, color: ui.textPrimary, fontSize: 16, lineHeight: 22 },
  cooldown: { marginTop: 16, color: ui.textSecondary, fontSize: 15, lineHeight: 22 },
});

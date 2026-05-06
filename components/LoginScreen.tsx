import { useState } from 'react';
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

/**
 * Email + password sign-in and sign-up. Session is handled by the root layout auth listener.
 */
export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'signin' | 'signup' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signUpNote, setSignUpNote] = useState<string | null>(null);

  const trimmed = email.trim();
  const canSubmit =
    trimmed.length > 0 && password.length > 0 && busy == null;

  const onSignIn = async () => {
    if (!canSubmit) return;
    setError(null);
    setSignUpNote(null);
    setBusy('signin');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const onSignUp = async () => {
    if (!canSubmit) return;
    setError(null);
    setSignUpNote(null);
    setBusy('signup');
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: trimmed,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setSignUpNote('Account created. If your project requires email confirmation, check your inbox.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Sign in or create an account</Text>
        <Text style={styles.subtitle}>Use your email and password.</Text>

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
          editable={busy == null}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={ui.textSecondary}
          style={styles.input}
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          autoCorrect={false}
          secureTextEntry
          editable={busy == null}
        />

        <Pressable
          onPress={() => {
            void onSignIn();
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
          {busy === 'signin' ? (
            <ActivityIndicator color={ui.primaryOn} />
          ) : (
            <Text style={styles.buttonLabel}>Sign In</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            void onSignUp();
          }}
          style={({ pressed }) => [
            styles.buttonSecondary,
            pressed && styles.buttonSecondaryPressed,
            !canSubmit && styles.buttonDisabled,
          ]}
          pressOpacityFeedback={false}
          disabled={!canSubmit}
          haptic
        >
          {busy === 'signup' ? (
            <ActivityIndicator color={ui.primary} />
          ) : (
            <Text style={styles.buttonSecondaryLabel}>Create Account</Text>
          )}
        </Pressable>

        {error != null && error.length > 0 ? <Text style={styles.error}>{error}</Text> : null}
        {signUpNote != null && error == null ? (
          <Text style={styles.success} accessibilityLiveRegion="polite">
            {signUpNote}
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
    marginBottom: 12,
  },
  buttonPressed: { backgroundColor: ui.primaryPressed },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { fontSize: 17, fontWeight: '600', color: ui.primaryOn },
  buttonSecondary: {
    height: 50,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.primary,
    backgroundColor: ui.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondaryPressed: { backgroundColor: ui.surfaceTintPrimary },
  buttonSecondaryLabel: { fontSize: 17, fontWeight: '600', color: ui.primary },
  error: { marginTop: 16, color: '#B91C1C', fontSize: 15 },
  success: { marginTop: 16, color: ui.textPrimary, fontSize: 16, lineHeight: 22 },
});

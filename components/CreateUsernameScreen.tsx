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
import type { User } from '@supabase/supabase-js';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { isDisplayNameTakenByOther } from '@/lib/displayNameUniqueness';
import { getOrCreateProfile } from '@/lib/getOrCreateProfile';
import { getSupabase } from '@/lib/supabase';
import { isUuidString } from '@/lib/requestOwnership';
import { profileNeedsCreateUsername } from '@/lib/profileOnboarding';

type Props = {
  user: User;
  onCompleted: () => void;
};

const MIN_LEN = 2;
const MAX_LEN = 32;

/**
 * Shown after magic-link login when `profiles.name` is still a placeholder; saves `profiles.name`
 * and refreshes the session profile cache.
 */
export function CreateUsernameScreen({ user, onCompleted }: Props) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailHint = user.email?.trim() ?? null;
  const trimmed = username.trim();
  const canSubmit = trimmed.length >= MIN_LEN && trimmed.length <= MAX_LEN && !saving;

  const onSave = async () => {
    if (!canSubmit) return;
    setError(null);
    if (profileNeedsCreateUsername(trimmed)) {
      setError('Choose a more specific name (not a placeholder).');
      return;
    }
    if (!isUuidString(user.id)) {
      setError('Invalid session. Please try again.');
      return;
    }
    setSaving(true);
    try {
      const { taken, errorMessage: dupQErr } = await isDisplayNameTakenByOther(trimmed, user.id);
      if (dupQErr != null) {
        setError(dupQErr);
        return;
      }
      if (taken) {
        setError('Name not available');
        return;
      }
      const { data: updated, error: upErr } = await getSupabase()
        .from('profiles')
        .update({ name: trimmed })
        .eq('id', user.id)
        .select('id, name');
      if (upErr != null) {
        if (upErr.code === '23505') {
          setError('Name not available');
        } else {
          setError(upErr.message);
        }
        return;
      }
      if (updated == null || updated.length === 0) {
        setError('Could not update your name. Check your connection and try again.');
        return;
      }
      const r = await getOrCreateProfile(user.id, user);
      if (r == null && __DEV__) {
        console.warn('[CreateUsername] getOrCreateProfile returned null after successful update; continuing to app');
      }
      onCompleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Create a username</Text>
        <Text style={styles.subtitle}>
          This is how you&apos;ll show up in requests, offers, and messages.
        </Text>

        {emailHint != null && emailHint.length > 0 ? (
          <Text style={styles.hint}>You&apos;re signed in as {emailHint}</Text>
        ) : null}

        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Display name"
          placeholderTextColor={ui.textSecondary}
          style={styles.input}
          autoCapitalize="words"
          autoCorrect
          textContentType="username"
          autoComplete="username"
          maxLength={MAX_LEN}
          editable={!saving}
        />
        <Text style={styles.counter}>
          {MIN_LEN}–{MAX_LEN} characters
        </Text>

        <Pressable
          onPress={() => {
            void onSave();
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
          {saving ? (
            <ActivityIndicator color={ui.primaryOn} />
          ) : (
            <Text style={styles.buttonLabel}>Continue</Text>
          )}
        </Pressable>

        {error != null ? <Text style={styles.error}>{error}</Text> : null}
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
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: ui.textSecondary,
    marginBottom: 20,
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
    marginBottom: 4,
  },
  counter: {
    fontSize: 13,
    color: ui.textSecondary,
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
});

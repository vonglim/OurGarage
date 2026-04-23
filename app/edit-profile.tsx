import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { UserAvatar } from '@/components/UserAvatar';
import { PresetAvatarModal } from '@/components/PresetAvatarModal';
import { getAuthUserIdSync } from '@/lib/authUser';
import { isUuidString } from '@/lib/requestOwnership';
import { formatPresetAvatar } from '@/lib/profileAvatar';
import { pickProfileImageFromLibrary } from '@/lib/pickProfileImage';
import { mergeProfileRowsFromServer } from '@/lib/remoteProfileCache';
import { getSupabase } from '@/lib/supabase';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { useAuthSessionStore } from '@/store/authSessionStore';
import { getProfile, updateProfile } from '@/store/profileStore';

import { primarySolidPressed, ui } from '@/constants/appUi';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const bioInputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      const p = getProfile();
      setName(p.name);
      setBio(p.bio);
      setPresetModalOpen(false);
    }, [])
  );

  const openAvatarOptions = useCallback(() => {
    Alert.alert('Profile photo', undefined, [
      {
        text: 'Choose from presets',
        onPress: () => setPresetModalOpen(true),
      },
      {
        text: 'Upload photo',
        onPress: () => {
          void (async () => {
            const uri = await pickProfileImageFromLibrary();
            if (uri) await updateProfile({ avatar: uri });
          })();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const onSave = async () => {
    const trimmed = name.trim();
    const nameForDb = trimmed || PROFILE_NAME_FALLBACK;
    const uid = getAuthUserIdSync().trim();
    if (isUuidString(uid)) {
      const { error } = await getSupabase()
        .from('profiles')
        .update({ name: nameForDb })
        .eq('id', uid);
      if (error == null) {
        mergeProfileRowsFromServer([{ id: uid, name: nameForDb }]);
        useAuthSessionStore.setState({ profile: { name: nameForDb } });
        await updateProfile({ name: nameForDb, bio: bio.trim() });
      } else if (__DEV__) {
        console.warn('[profiles] update from edit-profile:', error.message);
        return;
      }
    } else {
      await updateProfile({ name: nameForDb, bio: bio.trim() });
    }
    showFeedbackToast('Profile saved');
    router.back();
  };

  return (
    <>
      <KeyboardDismissScreen>
        <ScreenEntrance style={styles.entranceFlex}>
        <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        >
        <Pressable
          onPress={openAvatarOptions}
          style={({ pressed }) => [
            styles.avatarBlock,
            pressed && styles.avatarBlockPressed,
          ]}
          accessibilityLabel="Change profile photo"
          accessibilityRole="button"
        >
          <View style={styles.avatarOuter}>
            <UserAvatar />
          </View>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </Pressable>

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="ui.textSecondary"
          style={styles.input}
          autoCapitalize="words"
          autoCorrect
          returnKeyType="next"
          blurOnSubmit
          onSubmitEditing={() => bioInputRef.current?.focus()}
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          ref={bioInputRef}
          value={bio}
          onChangeText={setBio}
          placeholder="A short bio"
          placeholderTextColor="ui.textSecondary"
          style={[styles.input, styles.inputMultiline]}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
          returnKeyType="default"
          blurOnSubmit={false}
        />

        <Pressable
          pressOpacityFeedback={false}
          haptic
          onPress={() => void onSave()}
          style={({ pressed }) => [
            styles.saveButton,
            pressed && styles.saveButtonPressed,
          ]}
        >
          <Text style={styles.saveButtonText}>Save Profile</Text>
        </Pressable>
      </ScrollView>
        </ScreenEntrance>
      </KeyboardDismissScreen>

      <PresetAvatarModal
        visible={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        onSelectPreset={(id) => {
          void updateProfile({ avatar: formatPresetAvatar(id) });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  entranceFlex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  avatarBlock: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 8,
  },
  avatarBlockPressed: {
    opacity: 0.92,
  },
  avatarOuter: {
    padding: 10,
    borderRadius: 999,
    backgroundColor: ui.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 10,
  },
  avatarHint: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    backgroundColor: ui.background,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: ui.textPrimary,
    marginBottom: 16,
  },
  inputMultiline: {
    minHeight: 120,
    paddingTop: 14,
  },
  saveButton: {
    marginTop: 8,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonPressed: {
    ...primarySolidPressed,
  },
  saveButtonText: {
    color: ui.primaryOn,
    fontSize: 17,
    fontWeight: '600',
  },
});

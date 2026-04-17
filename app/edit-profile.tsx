import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UserAvatar } from './components/UserAvatar';
import { PresetAvatarModal } from './components/PresetAvatarModal';
import { formatPresetAvatar } from './lib/profileAvatar';
import { pickProfileImageFromLibrary } from './lib/pickProfileImage';
import { getProfile, updateProfile } from './store/profileStore';

import { ui } from '@/constants/appUi';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [presetModalOpen, setPresetModalOpen] = useState(false);

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
    await updateProfile({ name: name.trim(), bio: bio.trim() });
    router.back();
  };

  return (
    <>
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
            <UserAvatar variant="profile" />
          </View>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </Pressable>

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="#8E8E93"
          style={styles.input}
          autoCapitalize="words"
          autoCorrect
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="A short bio"
          placeholderTextColor="#8E8E93"
          style={[styles.input, styles.inputMultiline]}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
        />

        <Pressable
          onPress={() => void onSave()}
          style={({ pressed }) => [
            styles.saveButton,
            pressed && styles.saveButtonPressed,
          ]}
        >
          <Text style={styles.saveButtonText}>Save Profile</Text>
        </Pressable>
      </ScrollView>

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
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
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
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 10,
  },
  avatarHint: {
    fontSize: 14,
    color: '#6D6D72',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: '#000',
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
    opacity: ui.pressOpacity,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});

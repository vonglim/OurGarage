import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UserAvatar } from './components/UserAvatar';
import { USER_AVATAR_PRESETS, type UserAvatarPreset } from './lib/userAvatarPresets';
import {
  setUserAvatarCustom,
  setUserAvatarPreset,
} from './store/userAvatarStore';

function placeholder(title: string) {
  return () => {
    Alert.alert(title, 'Coming soon.');
  };
}

function ProfileRow({
  label,
  onPress,
  isLast,
}: {
  label: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowBorder,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [presetModalOpen, setPresetModalOpen] = useState(false);

  const openAvatarOptions = useCallback(() => {
    Alert.alert('Profile photo', undefined, [
      {
        text: 'Choose from presets',
        onPress: () => setPresetModalOpen(true),
      },
      {
        text: 'Upload photo',
        onPress: () => {
          void pickFromLibrary();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photos access',
        'Allow photo library access in Settings to upload a profile picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    await setUserAvatarCustom(result.assets[0].uri);
  };

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 40 + insets.bottom },
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

        <Text style={[styles.sectionTitle, styles.sectionFirst]}>Account</Text>
        <View style={styles.sectionCard}>
          <ProfileRow label="Edit Profile" onPress={placeholder('Edit Profile')} isLast />
        </View>

        <Text style={styles.sectionTitle}>Activity</Text>
        <View style={styles.sectionCard}>
          <ProfileRow label="Renter Reviews" onPress={placeholder('Renter Reviews')} />
          <ProfileRow label="Rentee Reviews" onPress={placeholder('Rentee Reviews')} isLast />
        </View>

        <Text style={styles.sectionTitle}>Payments & Subscription</Text>
        <View style={styles.sectionCard}>
          <ProfileRow label="Subscription" onPress={placeholder('Subscription')} />
          <ProfileRow label="Payment Methods" onPress={placeholder('Payment Methods')} isLast />
        </View>

        <Text style={styles.sectionTitle}>Earnings</Text>
        <View style={styles.sectionCard}>
          <ProfileRow label="Earnings & History" onPress={placeholder('Earnings & History')} isLast />
        </View>
      </ScrollView>

      <Modal
        visible={presetModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setPresetModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPresetModalOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Choose an avatar</Text>
            <View style={styles.presetGrid}>
              {USER_AVATAR_PRESETS.map((preset: UserAvatarPreset) => (
                <Pressable
                  key={preset.id}
                  style={({ pressed }) => [
                    styles.presetCell,
                    pressed && styles.presetCellPressed,
                  ]}
                  onPress={() => {
                    void setUserAvatarPreset(preset.id);
                    setPresetModalOpen(false);
                  }}
                >
                  <View
                    style={[
                      styles.presetCircle,
                      { backgroundColor: preset.color },
                    ]}
                  >
                    <Ionicons
                      name={
                        preset.icon as React.ComponentProps<
                          typeof Ionicons
                        >['name']
                      }
                      size={28}
                      color="#FFFFFF"
                    />
                  </View>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.modalClose,
                pressed && styles.modalClosePressed,
              ]}
              onPress={() => setPresetModalOpen(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const PRESET_CELL = 72;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  avatarBlock: {
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 12,
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 16,
  },
  sectionFirst: {
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  rowPressed: {
    backgroundColor: '#F9F9F9',
  },
  rowLabel: {
    fontSize: 16,
    color: '#000',
    flex: 1,
  },
  chevron: {
    fontSize: 22,
    color: '#C7C7CC',
    fontWeight: '300',
    marginLeft: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginBottom: 16,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 8,
  },
  presetCell: {
    borderRadius: PRESET_CELL / 2,
  },
  presetCellPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  presetCircle: {
    width: PRESET_CELL,
    height: PRESET_CELL,
    borderRadius: PRESET_CELL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClose: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalClosePressed: {
    opacity: 0.7,
  },
  modalCloseText: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '500',
  },
});

import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UserAvatar } from '../components/UserAvatar';
import { PresetAvatarModal } from '../components/PresetAvatarModal';
import { formatPresetAvatar } from '../lib/profileAvatar';
import { pickProfileImageFromLibrary } from '../lib/pickProfileImage';
import { getProfile, updateProfile, type UserProfile } from '../store/profileStore';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile>(() => getProfile());
  const [presetModalOpen, setPresetModalOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const data = getProfile();
      setProfile(data);
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

  const displayName =
    profile.name.trim().length > 0 ? profile.name.trim() : 'Your name';
  const displayBio =
    profile.bio.trim().length > 0 ? profile.bio.trim() : 'Add a short bio';

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

        <View style={styles.identityCard}>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text
            style={[
              styles.displayBio,
              profile.bio.trim().length === 0 && styles.displayBioPlaceholder,
            ]}
          >
            {displayBio}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, styles.sectionFirst]}>Account</Text>
        <View style={styles.sectionCard}>
          <ProfileRow
            label="Edit Profile"
            onPress={() => router.push('/edit-profile')}
            isLast
          />
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
  identityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 8,
  },
  displayBio: {
    fontSize: 16,
    lineHeight: 22,
    color: '#3A3A3C',
    textAlign: 'center',
  },
  displayBioPlaceholder: {
    color: '#8E8E93',
    fontStyle: 'italic',
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
});

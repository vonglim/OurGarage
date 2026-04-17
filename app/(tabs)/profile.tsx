import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PresetAvatarModal } from '../components/PresetAvatarModal';
import { formatPresetAvatar, parseProfileAvatar } from '../lib/profileAvatar';
import { pickProfileImageFromLibrary } from '../lib/pickProfileImage';
import { getProfile, updateProfile, type UserProfile } from '../store/profileStore';

/** Profile hero height as fraction of window (30–35%). */
const HERO_HEIGHT_RATIO = 0.33;

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [profile, setProfile] = useState<UserProfile>(() => getProfile());
  const [presetModalOpen, setPresetModalOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const data = getProfile();
      setProfile(data);
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

  const displayName =
    profile.name.trim().length > 0 ? profile.name.trim() : 'Your name';
  const displayBio =
    profile.bio.trim().length > 0 ? profile.bio.trim() : 'Add a short bio';

  const parsedAvatar = parseProfileAvatar(profile.avatar);
  const hasCustomImage = parsedAvatar.kind === 'custom';
  const heroHeight = Math.round(windowHeight * HERO_HEIGHT_RATIO);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 0,
            paddingBottom: 40 + insets.bottom,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.hero,
            {
              width: windowWidth,
              height: heroHeight,
              marginHorizontal: -20,
            },
          ]}
        >
          <Pressable
            onPress={openAvatarOptions}
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.heroPress,
              pressed && styles.heroPressPressed,
            ]}
          >
            {hasCustomImage ? (
              <Image
                source={{ uri: parsedAvatar.uri }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[StyleSheet.absoluteFillObject, styles.heroPlaceholder]} />
            )}
            {!hasCustomImage ? (
              <View style={styles.heroHintWrap} pointerEvents="none">
                <Text style={styles.heroHint}>Tap to change photo</Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View reviews"
            onPress={() => router.push('/(tabs)/reviews')}
            style={({ pressed }) => [
              styles.ratingOverlay,
              pressed && styles.ratingOverlayPressed,
            ]}
          >
            <View style={styles.ratingRowInner}>
              <Text style={styles.ratingSegLight}>⭐ 4.8 </Text>
              <Text style={styles.ratingSegGold}>★★★★☆</Text>
            </View>
          </Pressable>
        </View>

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
          <ProfileRow
            label="Manage Rentals"
            onPress={() => router.push('/rentals-management')}
          />
          <ProfileRow
            label="Manage Requests"
            onPress={() => router.push('/requests-management')}
            isLast
          />
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
  },
  hero: {
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#000',
  },
  heroPress: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPressPressed: {
    opacity: 0.92,
  },
  heroPlaceholder: {
    backgroundColor: '#C7CCD4',
  },
  heroHintWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  heroHint: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ratingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    zIndex: 2,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  ratingOverlayPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  ratingRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
  },
  ratingSegLight: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  ratingSegGold: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F9A825',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
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

import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import { PresetAvatarModal } from '../components/PresetAvatarModal';
import { UserActivityDot } from '../components/UserActivityDot';
import {
  getPublicProfileForView,
  isOwnProfileUserId,
} from '../lib/mockPublicProfiles';
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
  const params = useLocalSearchParams<{ viewUserId?: string | string[] }>();
  const rawView = params.viewUserId;
  const viewUserIdParam = Array.isArray(rawView) ? rawView[0] : rawView;
  const isViewingOther =
    viewUserIdParam != null &&
    viewUserIdParam !== '' &&
    !isOwnProfileUserId(viewUserIdParam);
  const viewPublic = isViewingOther ? getPublicProfileForView(viewUserIdParam) : null;

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

  const displayName = isViewingOther
    ? viewPublic!.name.trim()
    : profile.name.trim().length > 0
      ? profile.name.trim()
      : 'Your name';
  const displayBio = isViewingOther
    ? viewPublic!.bio.trim()
    : profile.bio.trim().length > 0
      ? profile.bio.trim()
      : 'Add a short bio';

  const avatarField = isViewingOther ? viewPublic!.avatar : profile.avatar;
  const parsedAvatar = parseProfileAvatar(avatarField);
  const ratingNumber = isViewingOther ? viewPublic!.ratingNumber : 4.8;
  const ratingStarsDisplay = isViewingOther ? viewPublic!.ratingStars : '★★★★☆';
  const hasCustomImage = parsedAvatar.kind === 'custom';
  const heroHeight = Math.round(windowHeight * HERO_HEIGHT_RATIO);

  return (
    <>
      <KeyboardDismissScreen>
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
        {isViewingOther ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.viewBackRow, { marginTop: insets.top + 8 }, pressed && styles.viewBackPressed]}
          >
            <Text style={styles.viewBackLabel}>‹ Back</Text>
          </Pressable>
        ) : null}

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
          {isViewingOther ? (
            <View style={styles.heroPress}>
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
            </View>
          ) : (
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
          )}

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
              <Text style={styles.ratingSegLight}>⭐ {ratingNumber.toFixed(1)} </Text>
              <Text style={styles.ratingSegGold}>{ratingStarsDisplay}</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.identityCard}>
          <View style={styles.identityNameRow}>
            <UserActivityDot
              lastActive={isViewingOther ? viewPublic!.lastActive : profile.lastActive}
            />
            <Text style={styles.displayName} numberOfLines={2}>
              {displayName}
            </Text>
          </View>
          <Text
            style={[
              styles.displayBio,
              !isViewingOther && profile.bio.trim().length === 0 && styles.displayBioPlaceholder,
            ]}
          >
            {displayBio}
          </Text>
        </View>

        {isViewingOther ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionFirst]}>Reviews</Text>
            <View style={styles.sectionCard}>
              <ProfileRow
                label="See all reviews"
                onPress={() => router.push('/(tabs)/reviews')}
                isLast
              />
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.sectionTitle, styles.sectionFirst]}>Account</Text>
            <View style={styles.sectionCard}>
              <ProfileRow
                label="Edit Profile"
                onPress={() => router.push('/edit-profile')}
                isLast
              />
            </View>

            <Text style={styles.sectionTitle}>Earnings & Status</Text>
            <View style={styles.sectionCard}>
              <ProfileRow label="Earnings" onPress={placeholder('Earnings')} />
              <ProfileRow
                label="Completed Rentals"
                onPress={placeholder('Completed Rentals')}
              />
              <ProfileRow label="Performance" onPress={placeholder('Performance')} isLast />
            </View>

            <Text style={styles.sectionTitle}>Payments & Subscription</Text>
            <View style={styles.sectionCard}>
              <ProfileRow label="Subscription" onPress={placeholder('Subscription')} />
              <ProfileRow label="Payment Methods" onPress={placeholder('Payment Methods')} isLast />
            </View>
          </>
        )}
      </ScrollView>
      </KeyboardDismissScreen>

      {!isViewingOther ? (
        <PresetAvatarModal
          visible={presetModalOpen}
          onClose={() => setPresetModalOpen(false)}
          onSelectPreset={(id) => {
            void updateProfile({ avatar: formatPresetAvatar(id) });
          }}
        />
      ) : null}
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
  identityNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginBottom: 8,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  displayName: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
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
  viewBackRow: {
    alignSelf: 'flex-start',
    marginBottom: 6,
    paddingVertical: 4,
    paddingRight: 12,
  },
  viewBackPressed: {
    opacity: 0.75,
  },
  viewBackLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: '#007AFF',
  },
});

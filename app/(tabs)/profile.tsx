import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { BackHeader, RootScreenHeader } from '@/components/AppHeaders';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenWrapper } from '@/components/ScreenWrapper';
import { MainTabFab, useMainTabFabBottomReserve } from '@/components/MainTabFab';

import { PresetAvatarModal } from '@/components/PresetAvatarModal';
import { UserActivityDot } from '@/components/UserActivityDot';
import {
  getPublicProfileForView,
  isOwnProfileUserId,
} from '@/lib/publicProfiles';
import { formatPresetAvatar, parseProfileAvatar } from '@/lib/profileAvatar';
import { pickProfileImageFromLibrary } from '@/lib/pickProfileImage';
import { formatUsd } from '@/lib/money';
import { useAuthUser, useAuthUserDisplayName } from '@/lib/authUser';
import { supabase } from '../../lib/supabase';
import { resetMarketplaceData } from '@/lib/resetMarketplaceData';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { getProfile, updateProfile, type UserProfile } from '@/store/profileStore';
import { cardChrome, ui } from '@/constants/appUi';
import { IMAGE_TRANSITION_MS } from '@/constants/interactionTiming';

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
  const fabBottomReserve = useMainTabFabBottomReserve();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [profile, setProfile] = useState<UserProfile>(() => getProfile());
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const currentUser = useAuthUser();
  const myDisplayName = useAuthUserDisplayName();

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

  const displayName = isViewingOther ? viewPublic!.name.trim() : myDisplayName;
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

  const impactStats = useMemo(() => ({ totalSaved: 0, totalEarned: 0 }), []);

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <View style={styles.root}>
        <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          styles.scrollContent,
          {
            paddingTop: ui.spaceMd,
            paddingBottom: fabBottomReserve + insets.bottom,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isViewingOther ? (
          <BackHeader title="Profile" onBack={() => router.back()} style={styles.profileHeader} />
        ) : (
          <RootScreenHeader title="Profile" style={styles.profileHeader} />
        )}

        <View
          style={[
            styles.hero,
            {
              width: windowWidth,
              height: heroHeight,
              marginHorizontal: -16,
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
                  transition={IMAGE_TRANSITION_MS}
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
                  transition={IMAGE_TRANSITION_MS}
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
            pressOpacityFeedback={false}
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
            <Text style={[styles.sectionTitle, styles.sectionFirst]}>Your Impact</Text>
            <View style={styles.impactCard}>
              <View style={styles.impactRow}>
                <Text style={styles.impactLabel}>Total Saved</Text>
                <Text style={styles.impactValue}>{formatUsd(impactStats.totalSaved)}</Text>
              </View>
              <View style={styles.impactDivider} />
              <View style={styles.impactRow}>
                <Text style={styles.impactLabel}>Total Earned</Text>
                <Text style={styles.impactValue}>{formatUsd(impactStats.totalEarned)}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Account</Text>
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

            <View style={styles.logoutSection}>
              <Button
                title="Logout"
                onPress={async () => {
                  const { error } = await supabase.auth.signOut();
                  if (error) {
                    console.error('Logout error', error);
                  }
                }}
              />
            </View>

            {__DEV__ ? (
              <>
                <Text style={styles.sectionTitle}>Dev</Text>
                <View style={styles.devToolsCard}>
                  <Text style={styles.devToolsHint}>
                    User id is your Supabase Auth user id; session is persisted. Display name
                    is always &quot;You&quot; for requests, offers, and messages. Other user ids show as
                    &quot;User&quot; until profiles are backed by a server.
                  </Text>
                  <View style={[styles.devToolsRow, styles.devToolsRowBorder]}>
                    <Text style={styles.devToolsRowLabel}>Auth user id</Text>
                    <Text style={styles.devToolsRowMeta}>
                      {currentUser.id} · {currentUser.name}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      resetMarketplaceData();
                      showFeedbackToast('Marketplace data cleared');
                    }}
                    style={({ pressed }) => [
                      styles.devResetBtn,
                      styles.devResetBtnLast,
                      pressed && styles.devResetBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Clear marketplace data in memory"
                  >
                    <Text style={styles.devResetBtnText}>Clear marketplace data</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {!isViewingOther ? (
        <PresetAvatarModal
          visible={presetModalOpen}
          onClose={() => setPresetModalOpen(false)}
          onSelectPreset={(id) => {
            void updateProfile({ avatar: formatPresetAvatar(id) });
          }}
        />
      ) : null}
      {!isViewingOther ? <MainTabFab /> : null}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  root: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  content: {
    paddingHorizontal: 0,
  },
  /** Lets short profiles fill the screen without breaking scroll when content is tall. */
  scrollContent: {
    flexGrow: 1,
  },
  profileHeader: {
    marginBottom: 12,
  },
  hero: {
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: ui.primary,
  },
  heroPress: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPressPressed: {
    opacity: 0.92,
  },
  heroPlaceholder: {
    backgroundColor: ui.border,
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
    color: ui.primaryOn,
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
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 20,
    alignSelf: 'center',
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
    color: ui.primaryOn,
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
    ...cardChrome,
    alignItems: 'center',
    marginBottom: 20,
  },
  identityNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginBottom: 14,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  displayName: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  displayBio: {
    fontSize: 16,
    lineHeight: 22,
    color: ui.textPrimary,
    textAlign: 'center',
  },
  displayBioPlaceholder: {
    color: ui.textSecondary,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 16,
  },
  sectionFirst: {
    marginTop: 4,
  },
  impactCard: {
    backgroundColor: ui.surfaceTintPrimary,
    borderRadius: ui.radiusCard,
    paddingVertical: ui.padCard,
    paddingHorizontal: ui.padCard + 2,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 122, 255, 0.14)',
    shadowColor: ui.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  impactLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    letterSpacing: -0.1,
  },
  impactValue: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.2,
  },
  impactDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 60, 67, 0.08)',
    marginVertical: 12,
  },
  sectionCard: {
    ...cardChrome,
    overflow: 'hidden',
    marginBottom: 16,
  },
  logoutSection: {
    marginTop: 40,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: ui.background,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  rowPressed: {
    backgroundColor: ui.surfaceInput,
  },
  rowLabel: {
    fontSize: 16,
    color: ui.textPrimary,
    flex: 1,
  },
  chevron: {
    fontSize: 22,
    color: ui.textSecondary,
    fontWeight: '300',
    marginLeft: 8,
  },
  devToolsCard: {
    ...cardChrome,
    overflow: 'hidden',
    marginBottom: 16,
    paddingBottom: 4,
  },
  devToolsHint: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  devToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: ui.background,
  },
  devToolsRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  devToolsRowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  devToolsRowMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
  },
  devResetBtnLast: {
    marginBottom: 14,
  },
  devResetBtn: {
    marginHorizontal: 16,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  devResetBtnPressed: {
    opacity: 0.88,
    backgroundColor: ui.surfaceStriped,
  },
  devResetBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.primary,
  },
});

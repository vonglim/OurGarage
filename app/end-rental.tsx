import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { pickPhotoFromLibrary } from './lib/pickProfileImage';
import { archiveChatForRequest } from './store/chatStore';
import { useRentalConditionStore } from './store/rentalConditionStore';
import {
  getEffectiveRentalStatus,
  getRequestByTimestamp,
  markRequestRentalComplete,
} from './store/requestsStore';
import { primarySolidPressed, ui } from '@/constants/appUi';
import { IMAGE_TRANSITION_MS } from '@/constants/interactionTiming';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function EndRentalScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestIdStr = firstParam(params.requestId);
  const [tick, setTick] = useState(0);
  const hydrateConditions = useRentalConditionStore((s) => s.hydrate);
  const returnPhotoUri = useRentalConditionStore((s) =>
    requestIdStr && Number.isFinite(Number(requestIdStr))
      ? s.returnPhotoByRequest[requestIdStr]
      : undefined
  );
  const setReturnPhoto = useRentalConditionStore((s) => s.setReturnPhoto);

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
      void hydrateConditions();
    }, [hydrateConditions])
  );

  const request = useMemo(() => {
    void tick;
    const id = Number(requestIdStr);
    if (!Number.isFinite(id)) return undefined;
    return getRequestByTimestamp(id);
  }, [requestIdStr, tick]);

  const onAddReturnPhoto = async () => {
    if (request?.timestamp == null) return;
    const uri = await pickPhotoFromLibrary();
    if (uri) setReturnPhoto(request.timestamp, uri);
  };

  const onComplete = () => {
    if (request?.timestamp == null) return;
    markRequestRentalComplete(request.timestamp);
    archiveChatForRequest(request.timestamp);
    router.replace({
      pathname: '/leave-review',
      params: {
        requestTimestamp: String(request.timestamp),
        type: 'renter',
      },
    });
  };

  if (!requestIdStr || !Number.isFinite(Number(requestIdStr))) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>Invalid request.</Text>
          <Pressable onPress={() => router.back()} style={styles.textBtn} hitSlop={12}>
            <Text style={styles.textBtnLabel}>Go back</Text>
          </Pressable>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  if (!request) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>Request not found.</Text>
          <Pressable onPress={() => router.back()} style={styles.textBtn} hitSlop={12}>
            <Text style={styles.textBtnLabel}>Go back</Text>
          </Pressable>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  if (getEffectiveRentalStatus(request) !== 'active') {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>
            This rental is not active, so it cannot be completed here.
          </Text>
          <Pressable
            pressOpacityFeedback={false}
            haptic
            onPress={() =>
              router.replace({
                pathname: '/request-details',
                params: { requestId: String(request.timestamp) },
              })
            }
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          >
            <Text style={styles.primaryBtnText}>Open request</Text>
          </Pressable>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <ScreenEntrance style={styles.entranceFlex}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>End rental</Text>
        <Text style={styles.headerSub}>Confirm the return before you leave a review.</Text>
      </View>

      <View style={[styles.body, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.card}>
          <Text style={styles.confirmLine}>Confirm item has been returned</Text>
          <Text style={styles.hint}>
            Once you complete this rental, you can leave a review for the other person.
          </Text>
        </View>

        <View style={styles.optionalBlock}>
          <Text style={styles.optionalLabel}>Return (optional)</Text>
          <Pressable
            onPress={onAddReturnPhoto}
            style={({ pressed }) => [styles.photoBtn, pressed && styles.photoBtnPressed]}
          >
            <Text style={styles.photoBtnText}>Add Return Photo</Text>
          </Pressable>
          {returnPhotoUri ? (
            <View style={styles.photoPreviewWrap}>
              <Image
                source={{ uri: returnPhotoUri }}
                style={styles.photoPreview}
                contentFit="cover"
                transition={IMAGE_TRANSITION_MS}
              />
              <Pressable
                onPress={() => request.timestamp != null && setReturnPhoto(request.timestamp, null)}
                hitSlop={8}
                style={({ pressed }) => [styles.removePhoto, pressed && styles.photoBtnPressed]}
              >
                <Text style={styles.removePhotoText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.bodySpacer} />

        <Pressable
          pressOpacityFeedback={false}
          haptic
          onPress={onComplete}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        >
          <Text style={styles.primaryBtnText}>Complete Rental</Text>
        </Pressable>
      </View>
      </ScreenEntrance>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  entranceFlex: {
    flex: 1,
  },
  entranceFillCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  backHit: {
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: ui.primary,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  headerSub: {
    marginTop: 6,
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    justifyContent: 'space-between',
    gap: 14,
  },
  optionalBlock: {
    backgroundColor: ui.background,
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  optionalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    marginBottom: 10,
  },
  photoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: ui.surfaceGrouped,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.border,
  },
  photoBtnPressed: {
    opacity: 0.75,
  },
  photoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.primary,
  },
  photoPreviewWrap: {
    marginTop: 12,
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 10,
    backgroundColor: ui.surfaceNeutral,
  },
  removePhoto: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
  },
  removePhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  card: {
    backgroundColor: ui.background,
    borderRadius: 14,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  confirmLine: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 10,
    lineHeight: 22,
  },
  hint: {
    fontSize: 14,
    color: ui.textSubtle,
    lineHeight: 20,
  },
  bodySpacer: {
    flex: 1,
    minHeight: 16,
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    ...primarySolidPressed,
  },
  primaryBtnText: {
    color: ui.primaryOn,
    fontSize: 17,
    fontWeight: '600',
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  textBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  textBtnLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.primary,
  },
});

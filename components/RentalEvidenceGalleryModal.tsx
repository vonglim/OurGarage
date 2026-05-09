import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import type { VerificationPhase } from '@/lib/rentalVerification';

export type GalleryModalPhoto = {
  id: string;
  signedUrl?: string | null;
  role?: string;
  phase?: string;
  pickupPhotoCategory?: string | null;
  createdAt?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  phase: VerificationPhase;
  photos: GalleryModalPhoto[];
  index: number;
  onIndexChange: (i: number) => void;
  slideLabel: (i: number) => string;
  metaLine: string;
  canDelete: boolean;
  onDelete: () => void;
  imageRetryKey: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onImageLoadStart: () => void;
  onImageLoad: () => void;
  onImageError: (message: string) => void;
};

export function RentalEvidenceGalleryModal({
  visible,
  onClose,
  phase,
  photos,
  index,
  onIndexChange,
  slideLabel,
  metaLine,
  canDelete,
  onDelete,
  imageRetryKey,
  loading,
  error,
  onRetry,
  onImageLoadStart,
  onImageLoad,
  onImageError,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const listRef = useRef<FlatList<GalleryModalPhoto>>(null);
  const thumbScrollRef = useRef<ScrollView>(null);
  const openAnim = useRef(new Animated.Value(0)).current;
  const pageW = winW;
  const maxImageW = winW * (winW >= 600 ? 0.76 : 0.965);
  const topBarEst = 52;
  const thumbArea = 72 + Math.max(insets.bottom, 10);
  const metaArea = 36;
  const listH = Math.max(300, winH - insets.top - topBarEst - thumbArea - metaArea);

  const clampedIndex = photos.length > 0 ? Math.min(Math.max(0, index), photos.length - 1) : 0;

  const scrollListToIndex = useCallback(
    (i: number, animated: boolean) => {
      if (photos.length === 0) return;
      const safe = Math.min(Math.max(0, i), photos.length - 1);
      try {
        listRef.current?.scrollToIndex({ index: safe, animated });
      } catch {
        /* layout */
      }
    },
    [photos.length]
  );

  useEffect(() => {
    if (visible) {
      openAnim.setValue(0);
      Animated.timing(openAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(openAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, openAnim]);

  useEffect(() => {
    if (!visible || photos.length === 0) return;
    const t = requestAnimationFrame(() => scrollListToIndex(clampedIndex, false));
    return () => cancelAnimationFrame(t);
  }, [visible, photos.length, clampedIndex, scrollListToIndex]);

  useEffect(() => {
    if (!visible || photos.length === 0) return;
    scrollListToIndex(clampedIndex, true);
  }, [clampedIndex, visible, photos.length, scrollListToIndex]);

  useEffect(() => {
    if (!visible || photos.length === 0) return;
    const x = Math.max(0, clampedIndex * 68 - winW / 2 + 34);
    thumbScrollRef.current?.scrollTo({ x, animated: true });
  }, [clampedIndex, visible, photos.length, winW]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / pageW);
      if (next >= 0 && next < photos.length && next !== index) {
        onIndexChange(next);
      }
    },
    [pageW, photos.length, index, onIndexChange]
  );

  const phaseWord = phase === 'return' ? 'Return' : 'Pickup';
  const centerTitle =
    photos.length > 0 ? `${slideLabel(clampedIndex)} · ${clampedIndex + 1} / ${photos.length}` : '—';

  const renderPage = useCallback(
    ({ item, index: itemIndex }: ListRenderItemInfo<GalleryModalPhoto>) => {
      const uri = item.signedUrl ?? null;
      const active = itemIndex === clampedIndex;
      return (
        <View style={[styles.page, { width: pageW, height: listH }]}>
          <View style={[styles.imageFrame, { width: maxImageW, height: listH - 10 }]}>
            {uri ? (
              <Image
                key={`${item.id}:${imageRetryKey}`}
                source={{ uri }}
                style={styles.imageContain}
                contentFit="contain"
                onLoadStart={active ? onImageLoadStart : undefined}
                onLoad={active ? onImageLoad : undefined}
                onError={
                  active
                    ? (ev) => onImageError(ev.error ?? 'Could not load image')
                    : undefined
                }
              />
            ) : (
              <View style={styles.fallbackInner}>
                <Text style={styles.fallbackText}>Image unavailable.</Text>
              </View>
            )}
            {loading && uri && active ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : null}
            {error && uri && active ? (
              <View style={styles.errorOverlay}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable
                  pressOpacityFeedback={false}
                  style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
                  onPress={onRetry}
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    [
      pageW,
      listH,
      maxImageW,
      clampedIndex,
      imageRetryKey,
      loading,
      error,
      onImageLoadStart,
      onImageLoad,
      onImageError,
      onRetry,
    ]
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<GalleryModalPhoto> | null | undefined, i: number) => ({
      length: pageW,
      offset: pageW * i,
      index: i,
    }),
    [pageW]
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          styles.root,
          { paddingTop: insets.top },
          {
            opacity: openAnim,
            transform: [
              {
                translateY: openAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable
            pressOpacityFeedback={false}
            onPress={onClose}
            hitSlop={14}
            style={styles.topBarBtn}
            accessibilityRole="button"
            accessibilityLabel="Close gallery"
          >
            <Ionicons name="chevron-back" size={26} color="#F9FAFB" />
          </Pressable>
          <View style={styles.topBarCenter}>
            <Text style={styles.topBarPhase}>{phaseWord}</Text>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {centerTitle}
            </Text>
          </View>
          {canDelete ? (
            <Pressable
              pressOpacityFeedback={false}
              onPress={onDelete}
              hitSlop={14}
              style={styles.topBarBtn}
              accessibilityRole="button"
              accessibilityLabel="Delete photo"
            >
              <Ionicons name="trash-outline" size={22} color="#FCA5A5" />
            </Pressable>
          ) : (
            <View style={styles.topBarBtnPlaceholder} />
          )}
        </View>

        <View style={styles.mainArea}>
          {photos.length > 0 ? (
            <>
              <FlatList
                ref={listRef}
                data={photos}
                keyExtractor={(it) => it.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                renderItem={renderPage}
                getItemLayout={getItemLayout}
                onMomentumScrollEnd={onMomentumScrollEnd}
                initialScrollIndex={clampedIndex}
                extraData={clampedIndex}
                style={{ height: listH }}
                removeClippedSubviews={Platform.OS === 'android'}
                windowSize={5}
                onScrollToIndexFailed={(info) => {
                  setTimeout(() => {
                    listRef.current?.scrollToIndex({
                      index: info.index,
                      animated: false,
                    });
                  }, 120);
                }}
              />
              <Pressable
                pressOpacityFeedback={false}
                disabled={clampedIndex <= 0}
                onPress={() => onIndexChange(Math.max(0, clampedIndex - 1))}
                style={({ pressed }) => [
                  styles.sideNav,
                  styles.sideNavLeft,
                  clampedIndex <= 0 && styles.sideNavDisabled,
                  pressed && clampedIndex > 0 && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Previous photo"
              >
                <Ionicons name="chevron-back" size={22} color="#F9FAFB" />
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                disabled={clampedIndex >= photos.length - 1}
                onPress={() => onIndexChange(Math.min(photos.length - 1, clampedIndex + 1))}
                style={({ pressed }) => [
                  styles.sideNav,
                  styles.sideNavRight,
                  clampedIndex >= photos.length - 1 && styles.sideNavDisabled,
                  pressed && clampedIndex < photos.length - 1 && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Next photo"
              >
                <Ionicons name="chevron-forward" size={22} color="#F9FAFB" />
              </Pressable>
            </>
          ) : (
            <View style={styles.emptyMain}>
              <Text style={styles.emptyMainText}>No photos</Text>
            </View>
          )}
        </View>

        {photos.length > 0 ? (
          <Text style={styles.metaBelow}>{metaLine}</Text>
        ) : null}

        {photos.length > 0 ? (
          <View style={[styles.thumbRail, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <ScrollView
              ref={thumbScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRailContent}
            >
              {photos.map((p, i) => {
                const active = i === clampedIndex;
                return (
                  <Pressable
                    key={p.id}
                    pressOpacityFeedback={false}
                    onPress={() => onIndexChange(i)}
                    style={[styles.thumbCell, active && styles.thumbCellActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${i + 1}`}
                  >
                    {p.signedUrl ? (
                      <Image
                        source={{ uri: p.signedUrl }}
                        style={styles.thumbImg}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.thumbPlaceholder} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    backgroundColor: 'rgba(10, 10, 12, 0.88)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  topBarBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarBtnPlaceholder: {
    width: 44,
    height: 44,
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 6,
  },
  topBarPhase: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(249, 250, 251, 0.55)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  topBarTitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#F9FAFB',
    textAlign: 'center',
  },
  mainArea: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  page: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageFrame: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imageContain: {
    width: '100%',
    height: '100%',
  },
  fallbackInner: {
    width: '100%',
    height: '100%',
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
  },
  fallbackText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
  },
  errorOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(17,24,39,0.92)',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: '#F3F4F6',
    fontSize: 12,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  retryBtnText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
  sideNav: {
    position: 'absolute',
    top: '42%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sideNavLeft: {
    left: 10,
  },
  sideNavRight: {
    right: 10,
  },
  sideNavDisabled: {
    opacity: 0.28,
  },
  emptyMain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMainText: {
    color: 'rgba(249,250,251,0.45)',
    fontSize: 14,
  },
  metaBelow: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(209, 213, 219, 0.72)',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 4,
    fontWeight: '500',
  },
  thumbRail: {
    backgroundColor: 'rgba(22, 22, 26, 0.78)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: 10,
  },
  thumbRailContent: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'center',
    flexDirection: 'row',
  },
  thumbCell: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(55, 65, 81, 0.72)',
  },
  thumbCellActive: {
    borderColor: '#60A5FA',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    backgroundColor: '#374151',
  },
});

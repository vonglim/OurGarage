import { Image } from 'expo-image';
import React, { forwardRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { Pressable } from '@/components/Pressable';
import { MAO_PROGRESS_GREEN } from '@/components/makeOfferFlow/constants';
import type { MediaCaptureItem } from '@/store/mediaCaptureSessionStore';
import { MEDIA_THUMB_RAIL_GAP, MEDIA_THUMB_RAIL_SIZE } from '@/components/media/mediaCaptureTokens';
import { ui } from '@/constants/appUi';

type Props = {
  items: MediaCaptureItem[];
  coverId: string;
  maxPhotos: number;
  onPressItem: (item: MediaCaptureItem) => void;
};

/**
 * Horizontal thumbnail rail — newest at end; cover gets a subtle ring.
 * Last item animates in after capture (non-blocking).
 */
export const PhotoThumbnailRail = forwardRef<ScrollView, Props>(function PhotoThumbnailRail(
  { items, coverId, maxPhotos, onPressItem },
  ref
) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.count}>
        {items.length} / {maxPhotos}
      </Text>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item, index) => {
          const isCover = item.id === coverId;
          const isNewest = index === items.length - 1;
          const Thumb = (
            <Pressable
              onPress={() => onPressItem(item)}
              style={({ pressed }) => [
                styles.thumbShell,
                isCover && styles.thumbShellCover,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={isCover ? 'Cover photo' : 'Photo'}
            >
              <Image source={{ uri: item.localUri }} style={styles.thumbImg} contentFit="cover" />
            </Pressable>
          );

          const inner = isNewest ? (
            <Animated.View entering={FadeInRight.springify().damping(18).stiffness(220)}>{Thumb}</Animated.View>
          ) : (
            Thumb
          );

          return (
            <View key={item.id} style={index < items.length - 1 ? styles.thumbCell : undefined}>
              {inner}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
});

const TH = MEDIA_THUMB_RAIL_SIZE;

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  count: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: -0.2,
  },
  scrollContent: {
    alignItems: 'center',
    paddingRight: 8,
    flexDirection: 'row',
  },
  thumbCell: {
    marginRight: MEDIA_THUMB_RAIL_GAP,
  },
  thumbShell: {
    width: TH,
    height: TH,
    borderRadius: ui.radiusInput,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbShellCover: {
    borderColor: MAO_PROGRESS_GREEN,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
});

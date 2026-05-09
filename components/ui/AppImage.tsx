import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/Pressable';

export type AppImageAspect = 'square' | 'wide' | 'portrait';

/** Landscape tile: width:height = 16:9 (image fills with cover). */
const WIDE_H_OVER_W = 9 / 16;
/** Portrait tile: width:height = 3:4 */
const PORTRAIT_H_OVER_W = 4 / 3;

type AppImageShared = {
  uri?: string | null;
  aspect: AppImageAspect;
  rounded?: number;
  maxWideHeight?: number;
  canDelete?: boolean;
  onDelete?: () => void;
  onPress?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export type AppImageProps = AppImageShared &
  (
    | { width: number; stretch?: false }
    | { stretch: true; width?: undefined }
  );

function computeSize(
  w: number,
  aspect: AppImageAspect,
  maxWideHeight: number
): { width: number; height: number } {
  if (w <= 0) return { width: 0, height: 0 };
  if (aspect === 'square') return { width: w, height: w };
  if (aspect === 'wide') {
    const h = Math.min(Math.round(w * WIDE_H_OVER_W), maxWideHeight);
    return { width: w, height: Math.max(h, 1) };
  }
  return { width: w, height: Math.round(w * PORTRAIT_H_OVER_W) };
}

export function AppImage(props: AppImageProps) {
  const {
    uri,
    aspect,
    rounded = 12,
    maxWideHeight = 160,
    canDelete,
    onDelete,
    onPress,
    style,
    accessibilityLabel = 'Photo',
  } = props;

  const stretch = 'stretch' in props && props.stretch === true;
  const widthProp = stretch ? undefined : props.width;

  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [loading, setLoading] = useState(Boolean(uri));

  useEffect(() => {
    setLoading(Boolean(uri));
  }, [uri]);

  const effW = stretch ? measuredWidth : widthProp ?? 0;
  const { width, height } = useMemo(
    () => computeSize(effW, aspect, maxWideHeight),
    [effW, aspect, maxWideHeight]
  );

  const containerStyle = useMemo((): ViewStyle => {
    const w: DimensionValue = stretch ? '100%' : width;
    return {
      ...styles.imageBox,
      width: w,
      height: stretch && measuredWidth === 0 ? 0 : height,
      borderRadius: rounded,
    };
  }, [stretch, width, height, measuredWidth, rounded]);

  const imageInner = (
    <>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.fill}
          contentFit="cover"
          transition={0}
          onLoadStart={() => setLoading(true)}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      ) : (
        <View style={[styles.fill, styles.placeholder]} />
      )}
      {loading && uri ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#6B7280" />
        </View>
      ) : null}
    </>
  );

  const core = onPress ? (
    <Pressable
      pressOpacityFeedback={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open fullscreen. ${accessibilityLabel}`}
      style={containerStyle}
    >
      {imageInner}
    </Pressable>
  ) : (
    <View style={containerStyle} accessibilityLabel={accessibilityLabel}>
      {imageInner}
    </View>
  );

  return (
    <View
      style={[styles.wrap, stretch && styles.stretchW, style]}
      onLayout={
        stretch
          ? (e) => {
              const w = e.nativeEvent.layout.width;
              if (w !== measuredWidth) setMeasuredWidth(w);
            }
          : undefined
      }
    >
      {core}
      {canDelete && onDelete ? (
        <Pressable
          pressOpacityFeedback={false}
          onPress={onDelete}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Delete this photo"
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.88 }]}
        >
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  stretchW: {
    alignSelf: 'stretch',
  },
  imageBox: {
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: 'rgba(26,43,74,0.14)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,244,246,0.65)',
  },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(12, 19, 33, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});

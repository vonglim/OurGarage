import React from 'react';
import { LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  MEDIA_CAPTURE_GUIDE_ASPECT,
  MEDIA_CAPTURE_GUIDE_MAX_WIDTH_RATIO,
} from '@/components/media/mediaCaptureTokens';
import { ui } from '@/constants/appUi';

type Props = {
  onGuideLayout?: (layout: { x: number; y: number; width: number; height: number }) => void;
};

/**
 * Very light framing guide for tools / equipment — no heavy dim, no full-bleed mask.
 */
export function CropGuideOverlay({ onGuideLayout }: Props) {
  const { width: winW } = useWindowDimensions();
  const boxW = Math.min(winW * MEDIA_CAPTURE_GUIDE_MAX_WIDTH_RATIO, winW - 32);
  const boxH = boxW / MEDIA_CAPTURE_GUIDE_ASPECT;

  return (
    <View style={styles.fill} pointerEvents="none">
      <View
        style={[styles.guideWrap, { width: boxW, height: boxH }]}
        onLayout={(e: LayoutChangeEvent) => {
          onGuideLayout?.(e.nativeEvent.layout);
        }}
      >
        <View style={styles.guide} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideWrap: {},
  guide: {
    flex: 1,
    borderRadius: ui.radiusProminent,
    borderWidth: StyleSheet.hairlineWidth * 3,
    borderColor: 'rgba(255,255,255,0.38)',
    backgroundColor: 'transparent',
  },
});

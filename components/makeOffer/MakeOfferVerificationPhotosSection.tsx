import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import type { PickupPhotoCategory } from '@/lib/pickupVerificationPhotoBuckets';

const TILE_ICON: Record<PickupPhotoCategory, keyof typeof Ionicons.glyphMap> = {
  item: 'cube-outline',
  serial: 'barcode-outline',
  timestamp_proof: 'shield-checkmark-outline',
  additional: 'images-outline',
};

const TILE_LABEL: Record<PickupPhotoCategory, string> = {
  item: 'Item Photos',
  serial: 'Serial / Model',
  timestamp_proof: 'Verification Photo',
  additional: 'Additional Photos',
};

/** Make Offer: compact tiles only (no “Additional” bucket on this screen). Order: verification first. */
const VISIBLE_TILE_ORDER: PickupPhotoCategory[] = ['timestamp_proof', 'item', 'serial'];

const THUMB = 28;
const THUMB_GAP = 4;

type Props = {
  evidenceBuckets: Record<PickupPhotoCategory, string[]>;
  uploading: boolean;
  onAddCategory: (category: PickupPhotoCategory) => void;
  onRemove: (category: PickupPhotoCategory, index: number) => void;
  onPreviewUrl: (url: string) => void;
};

export function MakeOfferVerificationPhotosSection({
  evidenceBuckets,
  uploading,
  onAddCategory,
  onRemove,
  onPreviewUrl,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Verification Photos</Text>
      <Text style={styles.helper}>
        Photos help verify item condition and reduce disputes. They carry forward to pickup handoff as evidence.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tileRow}
      >
        {VISIBLE_TILE_ORDER.map((category) => {
          const urls = evidenceBuckets[category] ?? [];
          const count = urls.length;
          return (
            <Pressable
              key={category}
              onPress={() => onAddCategory(category)}
              disabled={uploading}
              style={({ pressed }) => [
                styles.tile,
                pressed && !uploading && { opacity: 0.92 },
                uploading && { opacity: 0.65 },
              ]}
              pressOpacityFeedback={false}
              accessibilityRole="button"
              accessibilityLabel={`${TILE_LABEL[category]}, ${count} photo${count === 1 ? '' : 's'}. Tap to add.`}
            >
              <View style={styles.tileTop}>
                <Ionicons name={TILE_ICON[category]} size={18} color={ui.textMuted} />
                <View style={styles.countPill}>
                  <Text style={styles.countText}>{count}</Text>
                </View>
              </View>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {TILE_LABEL[category]}
              </Text>
              {urls.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.thumbScroll}
                  contentContainerStyle={styles.thumbRow}
                >
                  {urls.map((uri, idx) => (
                    <View key={`${uri}-${idx}`} style={styles.thumbWrap}>
                      <Pressable onPress={() => onPreviewUrl(uri)} style={styles.thumbHit}>
                        <Image source={{ uri }} style={styles.thumb} contentFit="cover" transition={0} />
                      </Pressable>
                      <Pressable
                        onPress={() => onRemove(category, idx)}
                        style={styles.thumbRemove}
                        hitSlop={6}
                        accessibilityLabel="Remove photo"
                      >
                        <Ionicons name="close" size={11} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.emptySlot}>
                  <Text style={styles.emptySlotText}>+</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const TILE_W = 112;
const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: ui.background,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  helper: {
    fontSize: 12,
    lineHeight: 17,
    color: ui.textSecondary,
    marginBottom: 10,
    fontWeight: '500',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
    paddingRight: 4,
  },
  tile: {
    width: TILE_W,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(26,43,74,0.14)',
    backgroundColor: ui.surfaceInput,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  countPill: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(11,31,58,0.08)',
    alignItems: 'center',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textSecondary,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textPrimary,
    lineHeight: 14,
    marginBottom: 6,
  },
  thumbScroll: {
    maxHeight: THUMB + 6,
  },
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THUMB_GAP,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumbHit: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 6,
    backgroundColor: '#1F2937',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26,43,74,0.12)',
  },
  thumbRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(17,24,39,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlot: {
    marginTop: 2,
    height: THUMB + 4,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(26,43,74,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  emptySlotText: {
    fontSize: 18,
    fontWeight: '300',
    color: ui.textMuted,
    marginTop: -2,
  },
});

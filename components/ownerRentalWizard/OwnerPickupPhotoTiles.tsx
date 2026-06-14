import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';
import {
  bucketOwnerPickupPhotos,
  OWNER_ITEM_PHOTO_TARGET,
  OWNER_PICKUP_REQUIRED_ITEM_MIN,
  OWNER_SERIAL_PHOTO_TARGET,
  OWNER_TIMESTAMP_PROOF_TARGET,
  type PickupPhotoCategory,
} from '@/lib/pickupVerificationPhotoBuckets';
import { TIMESTAMP_POSSESSION_PROOF_TILE_LABEL, CURRENT_CONDITION_PHOTOS_LABEL, OPERATIONAL_VIDEO_LABEL } from '@/lib/timestampPossessionProofCopy';

type TileDef = {
  category: PickupPhotoCategory;
  label: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  target: number;
  count: number;
  complete: boolean;
};

export type OwnerPickupPhotoTilesProps = {
  photos: readonly PickupEvidencePhoto[];
  onPressCategory: (category: PickupPhotoCategory) => void;
  disabled?: boolean;
};

export function OwnerPickupPhotoTiles({
  photos,
  onPressCategory,
  disabled = false,
}: OwnerPickupPhotoTilesProps) {
  const buckets = useMemo(() => bucketOwnerPickupPhotos([...photos]), [photos]);

  const tiles: TileDef[] = [
    {
      category: 'item',
      label: CURRENT_CONDITION_PHOTOS_LABEL,
      icon: 'camera-outline',
      target: OWNER_ITEM_PHOTO_TARGET,
      count: buckets.item.length,
      complete: buckets.item.length >= OWNER_PICKUP_REQUIRED_ITEM_MIN,
    },
    {
      category: 'serial',
      label: 'Serial / model',
      icon: 'barcode-outline',
      target: OWNER_SERIAL_PHOTO_TARGET,
      count: buckets.serial.length,
      complete: buckets.serial.length >= 1,
    },
    {
      category: 'timestamp_proof',
      label: TIMESTAMP_POSSESSION_PROOF_TILE_LABEL,
      icon: 'shield-checkmark-outline',
      target: OWNER_TIMESTAMP_PROOF_TARGET,
      count: buckets.timestampProof.length,
      complete: buckets.timestampProof.length >= 1,
    },
    {
      category: 'additional',
      label: OPERATIONAL_VIDEO_LABEL,
      subtitle: 'Show the item operating before pickup',
      icon: 'videocam-outline',
      target: 0,
      count: buckets.additional.length,
      complete: buckets.additional.length >= 1,
    },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.helper}>
        Tap a tile to add evidence for this rental. A short operating video is optional but helpful.
      </Text>
      <View style={styles.row}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.category}
            pressOpacityFeedback={false}
            disabled={disabled}
            onPress={() => onPressCategory(tile.category)}
            style={({ pressed }) => [
              styles.tile,
              tile.complete && styles.tileComplete,
              disabled && styles.tileDisabled,
              pressed && !disabled && { opacity: 0.92 },
            ]}
          >
            <Ionicons
              name={tile.complete ? 'checkmark-circle' : tile.icon}
              size={22}
              color={tile.complete ? '#16A34A' : ui.textSecondary}
            />
            <Text style={styles.tileLabel}>{tile.label}</Text>
            {tile.subtitle ? (
              <Text style={styles.tileSubtitle}>{tile.subtitle}</Text>
            ) : null}
            <Text style={[styles.tileCount, tile.complete && styles.tileCountComplete]}>
              {tile.target > 0
                ? `${tile.count} / ${tile.target}`
                : tile.category === 'additional'
                  ? tile.count > 0
                    ? '1 video'
                    : '0'
                  : `${tile.count}`}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  helper: { fontSize: 13, color: ui.textSecondary, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '47%',
    minWidth: 140,
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignItems: 'center',
  },
  tileComplete: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  tileDisabled: { opacity: 0.65 },
  tileLabel: { fontSize: 13, fontWeight: '700', color: ui.textPrimary, textAlign: 'center' },
  tileSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },
  tileCount: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  tileCountComplete: { color: '#16A34A' },
});

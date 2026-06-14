import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RentalEvidenceVideoThumb } from '@/components/rentalEvidence/RentalEvidenceVideoThumb';
import { RentalEvidenceThumbnail } from '@/components/RentalEvidenceThumbnail';
import { ui } from '@/constants/appUi';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';
import { bucketOwnerPickupPhotos } from '@/lib/pickupVerificationPhotoBuckets';
import {
  CURRENT_CONDITION_PHOTOS_LABEL,
  OPERATIONAL_VIDEO_LABEL,
  TIMESTAMP_POSSESSION_PROOF_TILE_LABEL,
} from '@/lib/timestampPossessionProofCopy';

export type OwnerPickupEvidenceManageSectionProps = {
  photos: readonly PickupEvidencePhoto[];
  disabled?: boolean;
  onDeletePhoto: (photo: PickupEvidencePhoto) => void;
};

type GroupDef = {
  label: string;
  photos: PickupEvidencePhoto[];
};

export function OwnerPickupEvidenceManageSection({
  photos,
  disabled = false,
  onDeletePhoto,
}: OwnerPickupEvidenceManageSectionProps) {
  const groups = useMemo((): GroupDef[] => {
    const buckets = bucketOwnerPickupPhotos([...photos]);
    return [
      { label: CURRENT_CONDITION_PHOTOS_LABEL, photos: buckets.item },
      { label: 'Serial / model', photos: buckets.serial },
      { label: TIMESTAMP_POSSESSION_PROOF_TILE_LABEL, photos: buckets.timestampProof },
      { label: OPERATIONAL_VIDEO_LABEL, photos: buckets.additional },
    ].filter((g) => g.photos.length > 0);
  }, [photos]);

  if (groups.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Uploaded evidence</Text>
      <Text style={styles.helper}>Tap × on any upload to remove it and upload again.</Text>
      {groups.map((group) => (
        <View key={group.label} style={styles.group}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gallery}
          >
            {group.photos.map((photo) =>
              photo.mediaKind === 'video' ? (
                <RentalEvidenceVideoThumb
                  key={photo.id}
                  size="handoffItem"
                  onPress={() => {}}
                  onDelete={disabled ? undefined : () => onDeletePhoto(photo)}
                />
              ) : (
                <RentalEvidenceThumbnail
                  key={photo.id}
                  uri={photo.signedUrl}
                  size="handoffItem"
                  category={photo.pickupPhotoCategory ?? undefined}
                  canDelete={!disabled}
                  onPress={() => {}}
                  onDelete={() => onDeletePhoto(photo)}
                />
              )
            )}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  title: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  helper: { fontSize: 12, color: ui.textSecondary, lineHeight: 17 },
  group: { gap: 6, marginTop: 4 },
  groupLabel: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  gallery: { gap: 10, paddingVertical: 2 },
});

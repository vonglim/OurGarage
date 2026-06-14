import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { RentalEvidenceVideoThumb } from '@/components/rentalEvidence/RentalEvidenceVideoThumb';
import { RentalEvidenceThumbnail } from '@/components/RentalEvidenceThumbnail';
import { ui } from '@/constants/appUi';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';
import {
  bucketOwnerPickupPhotos,
  OWNER_ITEM_PHOTO_TARGET,
  OWNER_SERIAL_PHOTO_TARGET,
  OWNER_TIMESTAMP_PROOF_TARGET,
  type OwnerPickupBuckets,
} from '@/lib/pickupVerificationPhotoBuckets';
import {
  TIMESTAMP_POSSESSION_PROOF_EMPTY_BODY,
  TIMESTAMP_POSSESSION_PROOF_EMPTY_TITLE,
  TIMESTAMP_POSSESSION_PROOF_HELPER,
  TIMESTAMP_POSSESSION_PROOF_TILE_LABEL,
  CURRENT_CONDITION_PHOTOS_LABEL,
  OPERATIONAL_VIDEO_LABEL,
} from '@/lib/timestampPossessionProofCopy';

const HANDOFF_ITEM_PREVIEW_MAX = 4;

function formatEvidenceUploadedAt(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function ItemPhotoRow({
  photos,
  onPressPhoto,
}: {
  photos: PickupEvidencePhoto[];
  onPressPhoto: (id: string) => void;
}) {
  const overlayExtra = photos.length > HANDOFF_ITEM_PREVIEW_MAX ? photos.length - HANDOFF_ITEM_PREVIEW_MAX : 0;
  const visible = photos.slice(0, Math.min(HANDOFF_ITEM_PREVIEW_MAX, photos.length));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
      {visible.map((p, i) => {
        const showMore = overlayExtra > 0 && i === visible.length - 1;
        return (
          <View key={p.id} style={styles.itemCell}>
            <RentalEvidenceThumbnail
              uri={p.signedUrl}
              size="handoffItem"
              category="item"
              canDelete={false}
              onPress={() => onPressPhoto(p.id)}
              onDelete={() => {}}
            />
            {showMore ? (
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => onPressPhoto(p.id)}
                style={styles.itemMoreOverlay}
                accessibilityRole="button"
                accessibilityLabel={`${overlayExtra} more photos, open gallery`}
              >
                <Text style={styles.itemMoreOverlayText}>+{overlayExtra}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function EvidenceGroup({
  label,
  helper,
  photos,
  emptyTitle,
  emptyBody,
  thumbnailSize,
  category,
  onPressPhoto,
  trustHeader,
}: {
  label: string;
  helper?: string;
  photos: PickupEvidencePhoto[];
  emptyTitle: string;
  emptyBody: string;
  thumbnailSize: 'handoffWideHero' | 'handoffSquare';
  category: string;
  onPressPhoto: (id: string) => void;
  trustHeader?: boolean;
}) {
  return (
    <View style={styles.group}>
      {trustHeader ? (
        <View style={styles.trustHeader}>
          <View style={styles.trustTitleRow}>
            <Ionicons name="shield-checkmark" size={16} color="#166534" />
            <Text style={styles.trustTitle}>{label}</Text>
          </View>
          {photos.length > 0 ? (
            <View style={styles.trustPill}>
              <Text style={styles.trustPillText}>Username + date</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.groupLabel}>{label}</Text>
      )}
      {helper ? <Text style={styles.groupHelper}>{helper}</Text> : null}
      {photos.length > 0 ? (
        category === 'item' ? (
          <ItemPhotoRow photos={photos} onPressPhoto={onPressPhoto} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
            {photos.map((p) => (
              <RentalEvidenceThumbnail
                key={p.id}
                uri={p.signedUrl}
                size={thumbnailSize}
                category={category}
                canDelete={false}
                onPress={() => onPressPhoto(p.id)}
                onDelete={() => {}}
              />
            ))}
          </ScrollView>
        )
      ) : (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyBody}>{emptyBody}</Text>
        </View>
      )}
      {photos.length > 0 ? (
        <Text style={styles.uploadedMeta}>
          {photos.length} photo{photos.length === 1 ? '' : 's'}
          {formatEvidenceUploadedAt(photos[photos.length - 1]?.createdAt)
            ? ` · latest ${formatEvidenceUploadedAt(photos[photos.length - 1]?.createdAt)}`
            : ''}
        </Text>
      ) : null}
    </View>
  );
}

export type PickupEvidenceReviewSectionsProps = {
  photos: PickupEvidencePhoto[];
  ownerDisplayName: string;
  onPressPhoto: (id: string) => void;
};

export function bucketPickupEvidenceForReview(photos: PickupEvidencePhoto[]): OwnerPickupBuckets<PickupEvidencePhoto> {
  return bucketOwnerPickupPhotos(photos);
}

export function PickupEvidenceReviewSections({
  photos,
  ownerDisplayName,
  onPressPhoto,
}: PickupEvidenceReviewSectionsProps) {
  const buckets = bucketPickupEvidenceForReview(photos);
  const ownerName = ownerDisplayName.trim() || 'Owner';

  return (
    <View style={styles.root}>
      <Text style={styles.intro}>
        Review these fresh photos before meetup. These photos were uploaded specifically for this rental.
      </Text>
      <View style={styles.freshnessPill}>
        <Ionicons name="time-outline" size={14} color="#166534" />
        <Text style={styles.freshnessText}>
          Uploaded by {ownerName} for this handoff — not listing gallery photos.
        </Text>
      </View>

      <EvidenceGroup
        label={CURRENT_CONDITION_PHOTOS_LABEL}
        helper={`Up to ${OWNER_ITEM_PHOTO_TARGET} angles of the exact item you'll receive.`}
        photos={buckets.item}
        emptyTitle={`No ${CURRENT_CONDITION_PHOTOS_LABEL.toLowerCase()} yet`}
        emptyBody="The owner still needs to upload condition photos of the item."
        thumbnailSize="handoffWideHero"
        category="item"
        onPressPhoto={onPressPhoto}
      />

      <EvidenceGroup
        label="Serial / model verification"
        helper="Confirm the serial or model matches what you expect."
        photos={buckets.serial}
        emptyTitle="No serial photo yet"
        emptyBody="Waiting for a clear serial or model label photo."
        thumbnailSize="handoffWideHero"
        category="serial"
        onPressPhoto={onPressPhoto}
      />

      <EvidenceGroup
        label={TIMESTAMP_POSSESSION_PROOF_TILE_LABEL}
        helper={`${TIMESTAMP_POSSESSION_PROOF_HELPER} (${OWNER_TIMESTAMP_PROOF_TARGET} photo).`}
        photos={buckets.timestampProof}
        emptyTitle={TIMESTAMP_POSSESSION_PROOF_EMPTY_TITLE}
        emptyBody={TIMESTAMP_POSSESSION_PROOF_EMPTY_BODY}
        thumbnailSize="handoffWideHero"
        category="timestamp_proof"
        onPressPhoto={onPressPhoto}
        trustHeader
      />

      <EvidenceGroup
        label={OPERATIONAL_VIDEO_LABEL}
        helper="Short clip showing the item operating before pickup."
        photos={buckets.additional}
        emptyTitle="No video yet"
        emptyBody="Waiting for the owner to upload an operating video."
        thumbnailSize="handoffWideHero"
        category="additional"
        onPressPhoto={onPressPhoto}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  intro: { fontSize: 15, color: ui.textPrimary, lineHeight: 22, fontWeight: '500' },
  freshnessPill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 10,
  },
  freshnessText: { flex: 1, fontSize: 13, color: '#166534', lineHeight: 18 },
  group: { gap: 8 },
  groupLabel: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  groupHelper: { fontSize: 13, color: ui.textSecondary, lineHeight: 18 },
  trustHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  trustTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  trustTitle: { fontSize: 14, fontWeight: '700', color: '#166534' },
  trustPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  trustPillText: { fontSize: 11, fontWeight: '600', color: '#166534' },
  gallery: { gap: 10, paddingVertical: 4 },
  itemCell: { position: 'relative' },
  itemMoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMoreOverlayText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  emptyBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  emptyBody: { fontSize: 13, color: ui.textSecondary, marginTop: 4, lineHeight: 18 },
  uploadedMeta: { fontSize: 12, color: ui.textSecondary },
});

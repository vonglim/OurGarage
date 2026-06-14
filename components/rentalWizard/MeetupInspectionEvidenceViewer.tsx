import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RentalEvidenceVideoPlaybackModal } from '@/components/rentalEvidence/RentalEvidenceVideoPlaybackModal';
import { PickupEvidenceReviewSections } from '@/components/rentalWizard/PickupEvidenceReviewSections';
import { RentalEvidenceGalleryModal, type GalleryModalPhoto } from '@/components/RentalEvidenceGalleryModal';
import { ui } from '@/constants/appUi';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';
import {
  bucketOwnerPickupPhotos,
  type PickupPhotoCategory,
} from '@/lib/pickupVerificationPhotoBuckets';
import { pickupPhotoCategoryDisplayLabel } from '@/lib/timestampPossessionProofCopy';

function slideLabel(category: PickupPhotoCategory | null | undefined, index: number, total: number): string {
  return `${pickupPhotoCategoryDisplayLabel(category)} · ${index + 1} of ${total}`;
}

export type MeetupInspectionEvidenceViewerProps = {
  photos: PickupEvidencePhoto[];
  ownerDisplayName: string;
  onEvidenceOpened?: () => void;
  onTimestampProofViewed?: () => void;
};

export function MeetupInspectionEvidenceViewer({
  photos,
  ownerDisplayName,
  onEvidenceOpened,
  onTimestampProofViewed,
}: MeetupInspectionEvidenceViewerProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [imageRetryKey, setImageRetryKey] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  const galleryPhotos: GalleryModalPhoto[] = useMemo(() => {
    const buckets = bucketOwnerPickupPhotos(photos);
    const ordered = [
      ...buckets.item,
      ...buckets.serial,
      ...buckets.timestampProof,
      ...buckets.additional,
    ];
    return ordered.map((p) => ({
      id: p.id,
      signedUrl: p.signedUrl,
      pickupPhotoCategory: p.pickupPhotoCategory,
      createdAt: p.createdAt,
    }));
  }, [photos]);

  const openPhoto = useCallback(
    (id: string) => {
      onEvidenceOpened?.();
      const photo = photos.find((p) => p.id === id);
      if (photo?.pickupPhotoCategory === 'timestamp_proof') {
        onTimestampProofViewed?.();
      }
      if (photo?.mediaKind === 'video' && photo.signedUrl) {
        setVideoUri(photo.signedUrl);
        setVideoOpen(true);
        return;
      }
      const idx = galleryPhotos.findIndex((p) => p.id === id);
      if (idx < 0) return;
      setGalleryIndex(idx);
      setGalleryError(null);
      setGalleryLoading(true);
      setGalleryOpen(true);
    },
    [galleryPhotos, onEvidenceOpened, onTimestampProofViewed, photos]
  );

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Verification photos</Text>
        <Text style={styles.sectionLead}>
          Review owner-uploaded evidence before completing the checklist below.
        </Text>
        <PickupEvidenceReviewSections
          photos={photos}
          ownerDisplayName={ownerDisplayName}
          onPressPhoto={openPhoto}
        />
      </View>

      <RentalEvidenceVideoPlaybackModal
        visible={videoOpen}
        uri={videoUri}
        title="Video (Optional)"
        onClose={() => {
          setVideoOpen(false);
          setVideoUri(null);
        }}
      />

      <RentalEvidenceGalleryModal
        visible={galleryOpen}
        onClose={() => {
          setGalleryOpen(false);
          setGalleryError(null);
          setGalleryLoading(false);
        }}
        phase="pickup"
        photos={galleryPhotos}
        index={galleryIndex}
        onIndexChange={setGalleryIndex}
        slideLabel={(i) =>
          slideLabel(galleryPhotos[i]?.pickupPhotoCategory as PickupPhotoCategory | null, i, galleryPhotos.length)
        }
        metaLine="Owner pickup evidence for this rental"
        canDelete={false}
        onDelete={() => {}}
        imageRetryKey={imageRetryKey}
        loading={galleryLoading}
        error={galleryError}
        onRetry={() => {
          setGalleryError(null);
          setGalleryLoading(true);
          setImageRetryKey((k) => k + 1);
        }}
        onImageLoadStart={() => setGalleryLoading(true)}
        onImageLoad={() => setGalleryLoading(false)}
        onImageError={(msg) => {
          setGalleryLoading(false);
          setGalleryError(msg);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: ui.textPrimary },
  sectionLead: { fontSize: 13, color: ui.textSecondary, lineHeight: 18, marginBottom: 4 },
});

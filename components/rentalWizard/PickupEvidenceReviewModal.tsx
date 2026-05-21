import React, { useCallback, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { PickupEvidenceReviewSections } from '@/components/rentalWizard/PickupEvidenceReviewSections';
import { RentalEvidenceGalleryModal, type GalleryModalPhoto } from '@/components/RentalEvidenceGalleryModal';
import { ui } from '@/constants/appUi';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';
import {
  bucketOwnerPickupPhotos,
  type PickupPhotoCategory,
} from '@/lib/pickupVerificationPhotoBuckets';

export type PickupEvidenceReviewModalProps = {
  visible: boolean;
  photos: PickupEvidencePhoto[];
  ownerDisplayName: string;
  onClose: () => void;
  onApprove: () => void;
  onRequestNewPhotos: () => void;
  onReportConcern?: () => void;
  approveDisabled?: boolean;
  busy?: boolean;
};

function slideLabel(category: PickupPhotoCategory | null | undefined, index: number, total: number): string {
  const name =
    category === 'item'
      ? 'Item'
      : category === 'serial'
        ? 'Serial'
        : category === 'timestamp_proof'
          ? 'Live check'
          : category === 'additional'
            ? 'Additional'
            : 'Photo';
  return `${name} · ${index + 1} of ${total}`;
}

export function PickupEvidenceReviewModal({
  visible,
  photos,
  ownerDisplayName,
  onClose,
  onApprove,
  onRequestNewPhotos,
  onReportConcern,
  approveDisabled = false,
  busy = false,
}: PickupEvidenceReviewModalProps) {
  const insets = useSafeAreaInsets();
  const [galleryOpen, setGalleryOpen] = useState(false);
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
      const idx = galleryPhotos.findIndex((p) => p.id === id);
      if (idx < 0) return;
      setGalleryIndex(idx);
      setGalleryError(null);
      setGalleryLoading(true);
      setGalleryOpen(true);
    },
    [galleryPhotos]
  );

  const closeGallery = useCallback(() => {
    setGalleryOpen(false);
    setGalleryError(null);
    setGalleryLoading(false);
  }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}>
          <Pressable pressOpacityFeedback={false} onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Close</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Review photos</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <PickupEvidenceReviewSections
            photos={photos}
            ownerDisplayName={ownerDisplayName}
            onPressPhoto={openPhoto}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            pressOpacityFeedback={false}
            disabled={busy || approveDisabled}
            onPress={onApprove}
            style={({ pressed }) => [
              styles.primaryBtn,
              (busy || approveDisabled) && styles.primaryBtnDisabled,
              pressed && !busy && !approveDisabled && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.primaryBtnText}>{busy ? 'Saving…' : 'Looks good · Approve photos'}</Text>
          </Pressable>
          <Pressable
            pressOpacityFeedback={false}
            disabled={busy}
            onPress={onRequestNewPhotos}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.88 }]}
          >
            <Text style={styles.secondaryBtnText}>Request new photos</Text>
          </Pressable>
          {onReportConcern ? (
            <Pressable pressOpacityFeedback={false} onPress={onReportConcern} style={styles.tertiaryHit}>
              <Text style={styles.tertiaryText}>Report concern</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <RentalEvidenceGalleryModal
        visible={galleryOpen}
        onClose={closeGallery}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: ui.textPrimary },
  headerBtn: { minWidth: 56 },
  headerBtnText: { fontSize: 15, fontWeight: '600', color: ui.primary },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  footer: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    backgroundColor: '#FFFFFF',
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: ui.textPrimary },
  tertiaryHit: { alignItems: 'center', paddingVertical: 6 },
  tertiaryText: { fontSize: 14, fontWeight: '600', color: ui.textSecondary },
});

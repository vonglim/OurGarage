import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { RentalAgreementReviewSheet } from '@/components/rentalWizard/modals/RentalAgreementReviewSheet';
import { PickupEvidenceReviewModal } from '@/components/rentalWizard/PickupEvidenceReviewModal';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { ui } from '@/constants/appUi';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import {
  logPickupEvidenceRealtime,
  resolveRenterPreparePickupStepState,
} from '@/lib/pickupEvidenceReadiness';
import { canReviewAgreementBeforeMeetup } from '@/lib/rentalAuthorization/authorizationProgress';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';

function StatusBanner({
  tone,
  title,
  body,
}: {
  tone: 'waiting' | 'ready' | 'info';
  title: string;
  body: string;
}) {
  const bg = tone === 'ready' ? '#ECFDF5' : tone === 'waiting' ? '#EEF2FF' : '#F5F3FF';
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons
        name={tone === 'ready' ? 'checkmark-circle' : 'time-outline'}
        size={18}
        color={tone === 'ready' ? '#16A34A' : ui.primary}
      />
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{title}</Text>
        {body ? <Text style={styles.bannerBody}>{body}</Text> : null}
      </View>
    </View>
  );
}

export function PreparePickupStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx, hasPendingLifecyclePrompt } = w;
  const meta = WIZARD_STEP_META.prepare_pickup;
  const [reviewOpen, setReviewOpen] = useState(false);
  const [agreementSheetOpen, setAgreementSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const readiness = ctx.pickupEvidenceReadiness;
  const reviewOpenedAt = ctx.wizardProgress.renter_pickup_evidence_review_opened_at;
  const photosApprovedAt = ctx.wizardProgress.renter_approved_pickup_photos_at;

  const prepareState = useMemo(
    () =>
      resolveRenterPreparePickupStepState({
        readiness,
        reviewOpenedAt,
        photosApprovedAt,
      }),
    [readiness, reviewOpenedAt, photosApprovedAt]
  );

  const reviewOpened = Boolean(reviewOpenedAt?.trim());

  useEffect(() => {
    logPickupEvidenceRealtime(ctx.rentalId, {
      triggerSource: 'prepare_pickup_render',
      readiness,
      renterPrepareStepState: prepareState,
      reviewOpened,
    });
  }, [
    ctx.rentalId,
    readiness,
    prepareState,
    reviewOpened,
    readiness.evidenceRowCount,
    readiness.lastEvidenceUpdateAt,
    readiness.ownerEvidenceReady,
  ]);

  const openReview = useCallback(async () => {
    if (!readiness.renterEvidenceReady) return;
    await w.markPickupEvidenceReviewOpened();
    setReviewOpen(true);
    logPickupEvidenceRealtime(ctx.rentalId, {
      triggerSource: 'review_modal_opened',
      readiness,
      renterPrepareStepState: 'review_opened',
      reviewOpened: true,
    });
  }, [ctx.rentalId, readiness, w]);

  const handleApproveFromModal = useCallback(async () => {
    setBusy(true);
    try {
      setReviewOpen(false);
      await w.markPhotosApproved();
    } finally {
      setBusy(false);
    }
  }, [w]);

  const handleRequestNewPhotos = useCallback(() => {
    Alert.alert(
      'Request new photos',
      'Message the owner and ask them to upload fresh pickup photos for this rental.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open messages',
          onPress: () => {
            setReviewOpen(false);
            w.openMessages();
          },
        },
      ]
    );
  }, [w]);

  const handleReportConcern = useCallback(() => {
    Alert.alert(
      'Report a concern',
      'Describe the issue in Messages so both parties have a record before handoff.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open messages',
          onPress: () => {
            setReviewOpen(false);
            w.openMessages();
          },
        },
      ]
    );
  }, [w]);

  let primaryLabel = 'Waiting for owner photos';
  let primaryDisabled = true;
  let onPrimary: (() => void) | undefined;

  if (prepareState === 'ready_for_review') {
    primaryLabel = 'Review photos';
    primaryDisabled = hasPendingLifecyclePrompt;
    onPrimary = () => void openReview();
  } else if (prepareState === 'review_opened') {
    primaryLabel = 'Approve photos';
    primaryDisabled = hasPendingLifecyclePrompt || !readiness.renterEvidenceReady;
    onPrimary = () => void w.markPhotosApproved();
  } else if (prepareState === 'waiting_owner' && readiness.ownerPhotoCount > 0) {
    primaryLabel = 'Review partial photos';
    primaryDisabled = hasPendingLifecyclePrompt;
    onPrimary = () => void openReview();
  }

  const banner =
    prepareState === 'waiting_owner'
      ? {
          tone: 'waiting' as const,
          title:
            readiness.ownerPhotoCount > 0
              ? 'Owner still uploading photos'
              : 'Waiting on owner',
          body:
            readiness.ownerPhotoCount > 0
              ? `The owner has ${readiness.ownerPhotoCount} photo${readiness.ownerPhotoCount === 1 ? '' : 's'} so far. You'll be notified here when item, serial, and live possession proof are complete.`
              : 'The owner will upload fresh photos of the exact item before pickup.',
        }
      : prepareState === 'ready_for_review'
        ? {
            tone: 'ready' as const,
            title: 'Photos ready for review',
            body: 'Open the review screen and check every section before you approve.',
          }
        : {
            tone: 'info' as const,
            title: 'Review in progress',
            body: reviewOpened
              ? 'You opened the review screen. Approve when everything looks right, or request new photos.'
              : 'Open the review screen to inspect owner evidence before approving.',
          };

  const footerNote =
    prepareState === 'waiting_owner'
      ? 'This screen updates automatically when the owner uploads photos.'
      : prepareState === 'ready_for_review'
        ? 'Approve is available after you open the review screen at least once.'
        : undefined;

  return (
    <>
      <WizardLightShell
        title={meta.title}
        onBack={() => router.back()}
        onOpenMessages={w.openMessages}
        primaryLabel={primaryLabel}
        primaryDisabled={primaryDisabled}
        onPrimary={onPrimary ?? (() => {})}
        footerNote={footerNote}
        footerInlineActions={[
          ...(canReviewAgreementBeforeMeetup(ctx)
            ? [
                {
                  label: 'Review rental agreement',
                  onPress: () => setAgreementSheetOpen(true),
                  disabled: hasPendingLifecyclePrompt,
                },
              ]
            : []),
          ...(readiness.renterEvidenceReady || readiness.ownerPhotoCount > 0
            ? [
                {
                  label: 'Open messages',
                  onPress: w.openMessages,
                  disabled: hasPendingLifecyclePrompt,
                },
              ]
            : []),
        ]}
      >
        <WizardItemCard
          title={ctx.displayTitle}
          ownerLine={formatBorrowingFromOwner(ctx.ownerDisplayName)}
          rentalCode={ctx.rentalCodeLabel}
          thumbUri={ctx.heroImageUrl}
        />
        <StatusBanner tone={banner.tone} title={banner.title} body={banner.body} />
        {readiness.renterEvidenceReady ? (
          <Pressable
            pressOpacityFeedback={false}
            disabled={hasPendingLifecyclePrompt}
            onPress={() => void openReview()}
            style={({ pressed }) => [styles.reviewCard, pressed && { opacity: 0.92 }]}
          >
            <Ionicons name="images-outline" size={22} color={ui.primary} />
            <View style={styles.reviewCardText}>
              <Text style={styles.reviewCardTitle}>Evidence review</Text>
              <Text style={styles.reviewCardBody}>
                Item · Serial · Live possession proof
                {readiness.bucketCounts.additional > 0
                  ? ' · optional video included'
                  : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ui.textSecondary} />
          </Pressable>
        ) : null}
      </WizardLightShell>

      <PickupEvidenceReviewModal
        visible={reviewOpen}
        photos={ctx.ownerPickupEvidence}
        ownerDisplayName={ctx.ownerDisplayName}
        onClose={() => setReviewOpen(false)}
        onApprove={() => void handleApproveFromModal()}
        onRequestNewPhotos={handleRequestNewPhotos}
        onReportConcern={handleReportConcern}
        approveDisabled={!readiness.renterEvidenceReady}
        busy={busy}
      />

      <RentalAgreementReviewSheet
        visible={agreementSheetOpen}
        ctx={ctx}
        onClose={() => setAgreementSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  bannerBody: { fontSize: 13, color: ui.textSecondary, marginTop: 4, lineHeight: 18 },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  reviewCardText: { flex: 1 },
  reviewCardTitle: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  reviewCardBody: { fontSize: 13, color: ui.textSecondary, marginTop: 2 },
});

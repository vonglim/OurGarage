import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { PickupEvidenceReviewModal } from '@/components/rentalWizard/PickupEvidenceReviewModal';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { WizardPickupChecklistRow } from '@/components/rentalWizard/WizardPickupChecklistRow';
import { ui } from '@/constants/appUi';
import {
  buildPickupHandoffCompletionInputFromWizard,
  resolvePickupHandoffCompletionState,
} from '@/lib/pickupHandoffCompletion';
import { resolvePickupHandoffPresenceState } from '@/lib/pickupHandoffLive';
import { evaluatePickupInspectionFlow, logPickupInspectionFlow } from '@/lib/pickupInspectionFlow';
import {
  deriveWizardRenterViewerFlags,
  pickupAutoRowHelper,
  RENTER_PICKUP_ITEMS,
  renterPickupManualFromVerificationRows,
} from '@/lib/rentalPickupChecklist';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { formatWizardDateTime, formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';

function InspectionStatusBanner({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.banner}>
      <Ionicons name="information-circle-outline" size={18} color={ui.primary} />
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
    </View>
  );
}

export function MeetupInspectionStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const meta = WIZARD_STEP_META.owner_confirmed_arrival;
  const [reviewOpen, setReviewOpen] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);

  const ownerLine = formatBorrowingFromOwner(ctx.ownerDisplayName);
  const itemCardProps = {
    title: ctx.displayTitle,
    ownerLine,
    rentalCode: ctx.rentalCodeLabel,
    thumbUri: ctx.heroImageUrl,
  };

  const completion = useMemo(
    () => resolvePickupHandoffCompletionState(buildPickupHandoffCompletionInputFromWizard(ctx)),
    [ctx]
  );

  const presence = useMemo(
    () =>
      resolvePickupHandoffPresenceState({
        rental: ctx.rental,
        renterPickupImHereAt: ctx.wizardProgress.renter_pickup_im_here_at,
        renterApprovedPickupPhotosAt: ctx.wizardProgress.renter_approved_pickup_photos_at,
        pickupAck: ctx.pickupAck,
        ownerPickupPrepComplete: false,
        handoffApprovalStarted: Boolean(
          ctx.rental.handoff_approval_started_at?.trim() || ctx.rental.handoff_approved_by_owner
        ),
        handoffCompleted: ctx.pickupHandoffComplete,
        renterConfirmedReceipt: completion.renterConfirmedReceipt,
        ownerConfirmedHandoff: completion.ownerConfirmedHandoff,
        viewerRole: 'renter',
      }),
    [completion, ctx]
  );

  const evidenceReviewed = Boolean(
    ctx.wizardProgress.renter_approved_pickup_photos_at?.trim() ||
      ctx.wizardProgress.renter_pickup_evidence_review_opened_at?.trim()
  );

  const viewerFlags = useMemo(
    () =>
      deriveWizardRenterViewerFlags({
        renterApprovedPickupPhotosAt: ctx.wizardProgress.renter_approved_pickup_photos_at,
        renterPickupEvidenceReviewOpenedAt: ctx.wizardProgress.renter_pickup_evidence_review_opened_at,
        renterViewedTimestampProofAt: ctx.wizardProgress.renter_viewed_timestamp_proof_at,
      }),
    [ctx.wizardProgress]
  );

  const manualChecklist = useMemo(
    () => renterPickupManualFromVerificationRows(ctx.verificationRows, ctx.viewerUserId),
    [ctx.verificationRows, ctx.viewerUserId]
  );

  const inspection = useMemo(
    () =>
      evaluatePickupInspectionFlow({
        bothPresent: presence.bothPresent,
        handoffApprovalStarted: Boolean(
          ctx.rental.handoff_approval_started_at?.trim() || ctx.rental.handoff_approved_by_owner
        ),
        handoffCompleted: ctx.pickupHandoffComplete,
        renterArrived: presence.renterArrived,
        evidenceReviewed,
        renterConfirmedReceipt: completion.renterConfirmedReceipt,
        manualChecklist,
        viewerFlags,
        pickupRenterConfirmed: ctx.pickupAck.renter,
      }),
    [
      completion.renterConfirmedReceipt,
      ctx.pickupAck.renter,
      ctx.pickupHandoffComplete,
      ctx.rental.handoff_approval_started_at,
      ctx.rental.handoff_approved_by_owner,
      evidenceReviewed,
      manualChecklist,
      presence.bothPresent,
      presence.renterArrived,
      viewerFlags,
    ]
  );

  useEffect(() => {
    logPickupInspectionFlow(ctx.rentalId, {
      triggerSource: 'meetup_inspection_render',
      state: inspection,
      surface: 'rental_wizard',
    });
  }, [ctx.rentalId, inspection]);

  const requiredDone = useMemo(
    () =>
      RENTER_PICKUP_ITEMS.filter((i) => i.required !== false).filter(
        (i) => inspection.checklistCompletionState[i.id]
      ).length,
    [inspection.checklistCompletionState]
  );
  const requiredTotal = RENTER_PICKUP_ITEMS.filter((i) => i.required !== false).length;

  const onConfirmReceipt = useCallback(async () => {
    if (!inspection.receiptButtonEnabled) {
      Alert.alert(
        'Finish your inspection',
        !evidenceReviewed
          ? 'Review the owner’s pickup photos first.'
          : 'Complete every inspection item in person before confirming receipt.'
      );
      return;
    }
    setReceiptBusy(true);
    try {
      await w.confirmPickupReceipt();
    } finally {
      setReceiptBusy(false);
    }
  }, [evidenceReviewed, inspection.receiptButtonEnabled, w]);

  const primaryLabel = completion.renterConfirmedReceipt
    ? 'Continue'
    : inspection.receiptButtonEnabled
      ? 'I received the item'
      : 'I received the item';
  const primaryDisabled =
    completion.renterConfirmedReceipt ? false : !inspection.receiptButtonEnabled || receiptBusy;
  const primaryOnPress = completion.renterConfirmedReceipt
    ? () => void w.goToResolvedNext()
    : () => void onConfirmReceipt();

  const primaryFootnote = !completion.renterConfirmedReceipt
    ? !inspection.receiptButtonEnabled
      ? !evidenceReviewed
        ? 'Open and review owner photos to start your inspection checklist.'
        : `Complete ${requiredDone}/${requiredTotal} inspection items to unlock receipt confirmation.`
      : 'Confirm you physically received the item at the meetup.'
    : '';

  return (
    <>
      <WizardLightShell
        title={meta.title}
        onBack={() => router.back()}
        onOpenMessages={w.openMessages}
        primaryLabel={receiptBusy ? 'Saving…' : primaryLabel}
        primaryDisabled={primaryDisabled}
        onPrimary={primaryOnPress}
        secondaryLabel="Message owner"
        onSecondary={w.openMessages}
        footerNote={primaryFootnote}
      >
        <WizardItemCard {...itemCardProps} />
        <View style={styles.successHero}>
          <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
          <Text style={styles.successTitle}>The owner is here!</Text>
          <Text style={styles.successBody}>
            Inspect the item in person, complete the checklist below, then confirm receipt.
          </Text>
        </View>

        <InspectionStatusBanner
          title="Take your time"
          body="Walk through each item while you have the equipment in front of you."
        />

        <View style={styles.checklistCard}>
          <View style={styles.checklistHeader}>
            <Text style={styles.checklistTitle}>In-person inspection</Text>
            <Text style={styles.checklistProgress}>
              {requiredDone} / {requiredTotal} complete
            </Text>
          </View>

          {RENTER_PICKUP_ITEMS.map((item) => (
            <WizardPickupChecklistRow
              key={item.id}
              label={item.label}
              checked={Boolean(inspection.checklistCompletionState[item.id])}
              readOnly={item.control === 'auto'}
              helperText={item.control === 'auto' ? pickupAutoRowHelper(item.id) : undefined}
              onToggle={
                item.control === 'manual' ? () => void w.toggleRenterPickupChecklistItem(item.id) : undefined
              }
              onPressReadOnly={
                item.id === 'rp-review-photos'
                  ? () => setReviewOpen(true)
                  : item.id === 'rp-verify-note'
                    ? () => {
                        setReviewOpen(true);
                        void w.markViewedTimestampProof();
                      }
                    : undefined
              }
            />
          ))}
        </View>

        <InfoPanel
          icon="location-outline"
          title="Meetup location"
          value={formatWizardLocation(ctx.rental.meetup_location)}
        />
        <InfoPanel icon="calendar-outline" title="Pickup time" value={formatWizardDateTime(ctx.pickupIso)} />
      </WizardLightShell>

      <PickupEvidenceReviewModal
        visible={reviewOpen}
        photos={ctx.ownerPickupEvidence}
        ownerDisplayName={ctx.ownerDisplayName}
        onClose={() => setReviewOpen(false)}
        onApprove={async () => {
          await w.markPickupEvidenceReviewOpened();
          if (!ctx.wizardProgress.renter_approved_pickup_photos_at) {
            await w.markPhotosApproved();
          }
          setReviewOpen(false);
        }}
        onRequestNewPhotos={() => {
          setReviewOpen(false);
          w.openMessages();
        }}
        approveDisabled={!ctx.pickupEvidenceReadiness.renterEvidenceReady}
        busy={w.proposalBusy}
      />
    </>
  );
}

function InfoPanel({
  icon,
  title,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
}) {
  return (
    <View style={styles.infoPanel}>
      <Ionicons name={icon} size={18} color={ui.primary} />
      <View style={styles.infoText}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  successHero: { alignItems: 'center', paddingVertical: 8, gap: 8 },
  successTitle: { fontSize: 22, fontWeight: '800', color: ui.textPrimary, textAlign: 'center' },
  successBody: { fontSize: 15, color: ui.textSecondary, textAlign: 'center', lineHeight: 22 },
  banner: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    marginBottom: 12,
  },
  bannerText: { flex: 1, minWidth: 0 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  bannerBody: { fontSize: 13, color: ui.textSecondary, marginTop: 4, lineHeight: 18 },
  checklistCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  checklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checklistTitle: { fontSize: 16, fontWeight: '700', color: ui.textPrimary },
  checklistProgress: { fontSize: 13, fontWeight: '600', color: ui.textSecondary },
  infoPanel: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  infoValue: { fontSize: 15, fontWeight: '600', color: ui.textPrimary, marginTop: 2 },
});

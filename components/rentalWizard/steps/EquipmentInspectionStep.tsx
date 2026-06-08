import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { MeetupLifecycleShell } from '@/components/rentalLifecycle/MeetupLifecycleShell';
import { PickupEvidenceReviewModal } from '@/components/rentalWizard/PickupEvidenceReviewModal';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { Pressable } from '@/components/Pressable';
import {
  buildPickupHandoffCompletionInputFromWizard,
  resolvePickupHandoffCompletionState,
} from '@/lib/pickupHandoffCompletion';
import { resolvePickupHandoffPresenceState } from '@/lib/pickupHandoffLive';
import { evaluatePickupInspectionFlow } from '@/lib/pickupInspectionFlow';
import { resolveMeetupLifecyclePresentation } from '@/lib/rentalLifecycle/meetupLifecycle';
import {
  deriveWizardRenterViewerFlags,
  RENTER_PICKUP_ITEMS,
  renterPickupManualFromVerificationRows,
} from '@/lib/rentalPickupChecklist';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { formatWizardDateTime } from '@/lib/rentalWizard/formatWizardSchedule';

const INSPECTION_ROW_LABELS: Record<string, string> = {
  'rp-review-photos': 'Equipment matches listing photos',
  'rp-verify-serial': 'Serial number verified',
  'rp-verify-accessories': 'Accessories included',
  'rp-condition-ok': 'Condition acceptable at pickup',
  'rp-verify-note': 'Live possession photo reviewed',
};

export function EquipmentInspectionStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const presentation = useMemo(
    () => resolveMeetupLifecyclePresentation(ctx, 'renter'),
    [ctx]
  );

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
        viewerFlags: deriveWizardRenterViewerFlags({
          renterApprovedPickupPhotosAt: ctx.wizardProgress.renter_approved_pickup_photos_at,
          renterPickupEvidenceReviewOpenedAt: ctx.wizardProgress.renter_pickup_evidence_review_opened_at,
          renterViewedTimestampProofAt: ctx.wizardProgress.renter_viewed_timestamp_proof_at,
        }),
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
      ctx.wizardProgress,
    ]
  );

  const requiredTotal = RENTER_PICKUP_ITEMS.filter((i) => i.required !== false).length;
  const requiredDone = RENTER_PICKUP_ITEMS.filter((i) => i.required !== false).filter(
    (i) => inspection.checklistCompletionState[i.id]
  ).length;

  const onComplete = useCallback(async () => {
    if (!presence.bothPresent) {
      Alert.alert('Waiting for owner', 'Both parties need to be at the meetup before completing inspection.');
      return;
    }
    if (!inspection.receiptButtonEnabled) {
      Alert.alert(
        'Finish inspection',
        !evidenceReviewed
          ? 'Review the owner’s pickup photos first.'
          : `Complete all inspection items (${requiredDone}/${requiredTotal}).`
      );
      return;
    }
    setBusy(true);
    try {
      await w.confirmPickupReceipt();
    } finally {
      setBusy(false);
    }
  }, [evidenceReviewed, inspection.receiptButtonEnabled, presence.bothPresent, requiredDone, requiredTotal, w]);

  const waitingForOwner = presence.renterArrived && !presence.ownerArrived;
  const primaryLabel = completion.renterConfirmedReceipt
    ? 'Continue to authorization'
    : waitingForOwner
      ? 'Waiting for owner'
      : busy
        ? 'Saving…'
        : 'Complete equipment inspection';
  const primaryDisabled =
    waitingForOwner ||
    busy ||
    (!completion.renterConfirmedReceipt && !inspection.receiptButtonEnabled);
  const primaryOnPress = completion.renterConfirmedReceipt
    ? () => void w.goToResolvedNext()
    : () => void onComplete();

  const showInspectionComplete = completion.renterConfirmedReceipt;

  return (
    <>
      <MeetupLifecycleShell
        phase="equipment_inspection"
        progressIndex={0}
        title={showInspectionComplete ? 'Inspection complete' : 'Equipment inspection'}
        subtitle={
          showInspectionComplete
            ? 'You confirmed the equipment in person. Next: review the agreement and authorize your rental.'
            : presentation.renterSupport
        }
        onBack={() => router.back()}
        onOpenMessages={w.openMessages}
        primaryLabel={primaryLabel}
        onPrimary={primaryOnPress}
        primaryDisabled={primaryDisabled}
        primaryBusy={busy}
        secondaryLabel="Message owner"
        onSecondary={w.openMessages}
        footerNote={
          !completion.renterConfirmedReceipt && presence.bothPresent
            ? `${requiredDone} of ${requiredTotal} checks complete`
            : undefined
        }
      >
        {showInspectionComplete ? (
          <View style={styles.completeHero}>
            <Ionicons name="checkmark-circle" size={56} color={presentation.theme.primary} />
            <Text style={styles.completeTitle}>Inspection complete</Text>
            <Text style={styles.completeBody}>
              Equipment verified and received. Continue to authorization when you are ready.
            </Text>
          </View>
        ) : null}

        <View style={styles.itemCard}>
          {ctx.heroImageUrl ? (
            <Image source={{ uri: ctx.heroImageUrl }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="cube-outline" size={28} color="#94A3B8" />
            </View>
          )}
          <View style={styles.itemText}>
            <Text style={styles.itemTitle}>{ctx.displayTitle}</Text>
            <Text style={styles.itemSub}>{formatBorrowingFromOwner(ctx.ownerDisplayName)}</Text>
            <Text style={styles.itemMeta}>{ctx.rentalCodeLabel}</Text>
            <Text style={styles.itemMeta}>{formatWizardDateTime(ctx.pickupIso)}</Text>
          </View>
        </View>

        {!showInspectionComplete ? (
        <View style={styles.checklistCard}>
          {RENTER_PICKUP_ITEMS.map((item) => {
            const done = Boolean(inspection.checklistCompletionState[item.id]);
            const label = INSPECTION_ROW_LABELS[item.id] ?? item.label;
            const isPhotos = item.id === 'rp-review-photos';
            return (
              <Pressable
                key={item.id}
                pressOpacityFeedback={false}
                disabled={item.control === 'auto' && !isPhotos}
                onPress={() => {
                  if (isPhotos) setReviewOpen(true);
                  else if (item.control === 'manual') {
                    void w.toggleRenterPickupChecklistItem(item.id);
                  }
                }}
                style={styles.checkRow}
              >
                <Ionicons
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={done ? presentation.theme.primary : '#CBD5E1'}
                />
                <Text style={[styles.checkLabel, done && styles.checkLabelDone]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        ) : null}
      </MeetupLifecycleShell>

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

const styles = StyleSheet.create({
  completeHero: { alignItems: 'center', gap: 10, paddingVertical: 20, marginBottom: 8 },
  completeTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  completeBody: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },
  itemCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#F1F5F9' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  itemSub: { fontSize: 14, color: '#64748B' },
  itemMeta: { fontSize: 13, color: '#94A3B8' },
  checklistCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  checkLabel: { flex: 1, fontSize: 15, color: '#0F172A', lineHeight: 21 },
  checkLabelDone: { color: '#475569' },
});

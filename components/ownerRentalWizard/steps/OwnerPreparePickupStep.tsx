import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { OwnerPickupEvidenceManageSection } from '@/components/ownerRentalWizard/OwnerPickupEvidenceManageSection';
import { LivePossessionExplainerSheet } from '@/components/ownerRentalWizard/LivePossessionExplainerSheet';
import { OwnerPickupPhotoTiles } from '@/components/ownerRentalWizard/OwnerPickupPhotoTiles';
import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { WizardJourneyChecklist } from '@/components/ownerRentalWizard/WizardJourneyChecklist';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { OWNER_WIZARD_STEP_META } from '@/lib/ownerRentalWizard/ownerWizardStepMeta';
import {
  buildOwnerPickupPrepChecklistDone,
  isOwnerPickupPrepChecklistComplete,
  OWNER_PICKUP_PREP_CHECKLIST,
  OWNER_PICKUP_PREP_MANUAL_ITEM_ID,
} from '@/lib/ownerPickupPrepChecklist';
import {
  readLivePossessionExplainerSkipped,
  setLivePossessionExplainerSkipped,
} from '@/lib/livePossessionExplainerPreference';
import { deleteRentalEvidencePhoto } from '@/lib/deleteRentalEvidencePhoto';
import {
  alertOwnerPickupEvidenceLocked,
  isOwnerPickupEvidenceLocked,
} from '@/lib/pickupEvidenceLock';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';
import {
  getOwnerOptionalAdditionalEvidence,
  promptOwnerOptionalOperationalVideo,
} from '@/lib/ownerOptionalVideoEvidence';
import {
  openOwnerPickupEvidenceCamera,
  processPendingOwnerWizardEvidenceUploads,
} from '@/lib/ownerWizardEvidenceFlow';
import { getSupabase } from '@/lib/supabase';
import { evaluatePickupEvidenceReadiness } from '@/lib/pickupEvidenceReadiness';
import type { PickupPhotoCategory } from '@/lib/pickupVerificationPhotoBuckets';
import {
  fetchVerificationRows,
  mergeChecklistMapsFromRows,
  persistChecklistState,
} from '@/lib/rentalVerification';
import { TIMESTAMP_POSSESSION_PROOF_OWNER_PREP, OPERATIONAL_VIDEO_LABEL } from '@/lib/timestampPossessionProofCopy';
import { formatWizardDateTime, formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';
import { StyleSheet, Text, View } from 'react-native';
import { ui } from '@/constants/appUi';

export function OwnerPreparePickupStep() {
  const router = useRouter();
  const w = useOwnerRentalWizard();
  const { ctx } = w;
  const meta = OWNER_WIZARD_STEP_META.owner_prepare_pickup;

  const readiness = evaluatePickupEvidenceReadiness(ctx.ownerPickupEvidence);
  const ownerReady =
    ctx.rental.owner_pickup_ready === true || ctx.rental.handoff_approved_by_owner === true;
  const pickupEvidenceLocked = isOwnerPickupEvidenceLocked(ctx.wizardProgress);
  const evidenceMutationsDisabled = ownerReady || pickupEvidenceLocked || w.actionBusy;

  const [storedManual, setStoredManual] = useState<Record<string, boolean>>({});
  const [itemReadyConfirmed, setItemReadyConfirmed] = useState(false);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [livePossessionExplainerOpen, setLivePossessionExplainerOpen] = useState(false);
  const [skipLivePossessionExplainer, setSkipLivePossessionExplainer] = useState(false);

  const loadChecklist = useCallback(async () => {
    setChecklistLoading(true);
    try {
      const rows = await fetchVerificationRows(getSupabase(), ctx.rentalId);
      const maps = mergeChecklistMapsFromRows(rows, 'pickup');
      setStoredManual(maps.owner);
    } finally {
      setChecklistLoading(false);
    }
  }, [ctx.rentalId]);

  useEffect(() => {
    void loadChecklist();
  }, [loadChecklist, ctx.ownerPickupEvidence.length, readiness.lastEvidenceUpdateAt]);

  useEffect(() => {
    let cancelled = false;
    void readLivePossessionExplainerSkipped().then((skip) => {
      if (!cancelled) setSkipLivePossessionExplainer(skip);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const checklistDone = useMemo(
    () =>
      buildOwnerPickupPrepChecklistDone({
        ownerPickupPhotos: ctx.ownerPickupEvidence,
        storedManual,
        meetupDetailsConfirmed: Boolean(ctx.pickupIso && ctx.rental.meetup_location),
        itemReadyConfirmed,
      }),
    [ctx.ownerPickupEvidence, ctx.pickupIso, ctx.rental.meetup_location, itemReadyConfirmed, storedManual]
  );

  const prepComplete = isOwnerPickupPrepChecklistComplete(checklistDone);

  const toggleManualItem = useCallback(
    async (itemId: string) => {
      const next = { ...storedManual, [itemId]: !storedManual[itemId] };
      setStoredManual(next);
      const ok = await persistChecklistState(
        getSupabase(),
        ctx.rentalId,
        'pickup',
        ctx.viewerUserId,
        { [itemId]: next[itemId] ?? false }
      );
      if (!ok) {
        Alert.alert('Could not save', 'Try again in a moment.');
        void loadChecklist();
      }
    },
    [ctx.rentalId, ctx.viewerUserId, loadChecklist, storedManual]
  );

  const openCamera = useCallback(
    (category: PickupPhotoCategory) => {
      openOwnerPickupEvidenceCamera(router, ctx.rentalId, category, pickupEvidenceLocked);
    },
    [ctx.rentalId, pickupEvidenceLocked, router]
  );

  const confirmDeleteEvidence = useCallback(
    (photo: PickupEvidencePhoto) => {
      if (pickupEvidenceLocked) {
        alertOwnerPickupEvidenceLocked();
        return;
      }
      if (ownerReady || w.actionBusy) return;
      const noun = photo.mediaKind === 'video' ? 'video' : 'photo';
      Alert.alert(`Remove this ${noun}?`, 'You can upload a new one after removing.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const res = await deleteRentalEvidencePhoto({
                client: getSupabase(),
                photoId: photo.id,
                uploadedByUserId: photo.uploadedBy,
                actorUserId: ctx.viewerUserId,
                storagePath: photo.storagePath,
                pickupEvidenceLocked,
              });
              if (!res.ok) {
                Alert.alert('Could not remove', res.error);
                return;
              }
              await w.refresh();
            })();
          },
        },
      ]);
    },
    [ctx.viewerUserId, ownerReady, pickupEvidenceLocked, w]
  );

  const onPressPhotoCategory = useCallback(
    (category: PickupPhotoCategory) => {
      if (pickupEvidenceLocked) {
        alertOwnerPickupEvidenceLocked();
        return;
      }
      if (category === 'additional') {
        const additionalEvidence = getOwnerOptionalAdditionalEvidence(ctx.ownerPickupEvidence);
        if (additionalEvidence.length > 0) {
          const existing = additionalEvidence[0]!;
          const noun = existing.mediaKind === 'video' ? 'video' : 'photo';
          Alert.alert(
            OPERATIONAL_VIDEO_LABEL,
            `Remove the existing ${noun} to record or choose a new one.`,
            [
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => confirmDeleteEvidence(existing),
              },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
          return;
        }
        promptOwnerOptionalOperationalVideo({
          router,
          rentalId: ctx.rentalId,
          ownerPickupEvidence: ctx.ownerPickupEvidence,
          pickupEvidenceLocked,
          onVideoReady: async () => {
            await processPendingOwnerWizardEvidenceUploads({
              client: getSupabase(),
              rentalId: ctx.rentalId,
              ownerUserId: ctx.viewerUserId,
              renterUserId: ctx.rental.renter_user_id ?? '',
              pickupEvidenceLocked,
            });
            await w.refresh();
          },
        });
        return;
      }
      if (category === 'timestamp_proof' && !skipLivePossessionExplainer) {
        setLivePossessionExplainerOpen(true);
        return;
      }
      openCamera(category);
    },
    [confirmDeleteEvidence, ctx.ownerPickupEvidence, ctx.rental.renter_user_id, ctx.rentalId, ctx.viewerUserId, openCamera, pickupEvidenceLocked, router, skipLivePossessionExplainer, w]
  );

  const handleLivePossessionExplainerContinue = useCallback(
    async (dontShowAgain: boolean) => {
      setLivePossessionExplainerOpen(false);
      if (dontShowAgain) {
        setSkipLivePossessionExplainer(true);
        await setLivePossessionExplainerSkipped(true);
      }
      openCamera('timestamp_proof');
    },
    [openCamera]
  );

  const primaryLabel = ownerReady
    ? 'Continue'
    : w.actionBusy
      ? 'Saving…'
      : 'Mark item ready';
  const primaryDisabled = ownerReady
    ? false
    : !prepComplete || w.actionBusy || checklistLoading;

  return (
    <>
    <WizardLightShell
      title={meta.title}
      subtitle={TIMESTAMP_POSSESSION_PROOF_OWNER_PREP}
      onBack={() => w.goToResolvedNext()}
      onOpenMessages={w.openMessages}
      primaryLabel={primaryLabel}
      primaryDisabled={primaryDisabled}
      onPrimary={() => {
        if (ownerReady) {
          void w.goToResolvedNext();
          return;
        }
        void w.confirmItemReady();
      }}
      footerNote={
        !ownerReady && !prepComplete
          ? 'Complete every checklist item before marking the item ready.'
          : undefined
      }
    >
      <WizardItemCard
        title={ctx.displayTitle}
        ownerLine={`Rented by ${ctx.counterpartyDisplayName}`}
        rentalCode={ctx.rentalCodeLabel}
        thumbUri={ctx.heroImageUrl}
      />

      <View style={styles.meetupCard}>
        <Text style={styles.meetupLabel}>Pickup meetup</Text>
        <Text style={styles.meetupValue}>{formatWizardDateTime(ctx.pickupIso)}</Text>
        <Text style={styles.meetupSub}>{formatWizardLocation(ctx.rental.meetup_location)}</Text>
      </View>

      <OwnerPickupPhotoTiles
        photos={ctx.ownerPickupEvidence}
        onPressCategory={onPressPhotoCategory}
        disabled={evidenceMutationsDisabled}
      />

      <OwnerPickupEvidenceManageSection
        photos={ctx.ownerPickupEvidence}
        disabled={evidenceMutationsDisabled}
        onDeletePhoto={confirmDeleteEvidence}
      />

      <WizardJourneyChecklist
        items={OWNER_PICKUP_PREP_CHECKLIST.map((item) => {
          const done = Boolean(checklistDone[item.id]);
          if (item.id === OWNER_PICKUP_PREP_MANUAL_ITEM_ID) {
            return {
              id: item.id,
              label: item.label,
              detail: item.detail,
              done,
              onPress: ownerReady ? undefined : () => void toggleManualItem(OWNER_PICKUP_PREP_MANUAL_ITEM_ID),
            };
          }
          if (item.id === 'prep-item-ready') {
            return {
              id: item.id,
              label: item.label,
              detail: item.detail,
              done,
              onPress:
                ownerReady || done
                  ? undefined
                  : () => setItemReadyConfirmed(true),
            };
          }
          if (item.id === 'prep-photos') {
            return { id: item.id, label: item.label, detail: item.detail, done };
          }
          return { id: item.id, label: item.label, detail: item.detail, done };
        })}
      />
    </WizardLightShell>

    <LivePossessionExplainerSheet
      visible={livePossessionExplainerOpen}
      onContinue={(dontShowAgain) => void handleLivePossessionExplainerContinue(dontShowAgain)}
      onCancel={() => setLivePossessionExplainerOpen(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  meetupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  meetupLabel: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  meetupValue: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  meetupSub: { fontSize: 14, color: ui.textSecondary },
});

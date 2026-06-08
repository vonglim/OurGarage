import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { WizardJourneyChecklist } from '@/components/ownerRentalWizard/WizardJourneyChecklist';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { RentalEvidenceThumbnail } from '@/components/RentalEvidenceThumbnail';
import { ui } from '@/constants/appUi';
import {
  buildOwnerReturnPrepChecklistDone,
  isOwnerReturnPrepChecklistComplete,
  OWNER_RETURN_PREP_CHECKLIST,
  OWNER_RETURN_PREP_MANUAL_ITEM_ID,
} from '@/lib/ownerReturnPrepChecklist';
import { OWNER_WIZARD_STEP_META } from '@/lib/ownerRentalWizard/ownerWizardStepMeta';
import { formatWizardDateTime, formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';
import {
  fetchVerificationPhotos,
  fetchVerificationRows,
  mergeChecklistMapsFromRows,
  persistChecklistState,
  signedUrlForEvidencePath,
} from '@/lib/rentalVerification';
import { getSupabase } from '@/lib/supabase';

type ReturnPhotoPreview = {
  id: string;
  signedUrl?: string;
};

export function OwnerPrepareReturnStep() {
  const router = useRouter();
  const w = useOwnerRentalWizard();
  const { ctx } = w;
  const meta = OWNER_WIZARD_STEP_META.owner_prepare_return;

  const [storedManual, setStoredManual] = useState<Record<string, boolean>>({});
  const [returnPhotos, setReturnPhotos] = useState<ReturnPhotoPreview[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReturnPrepState = useCallback(async () => {
    setLoading(true);
    try {
      const client = getSupabase();
      const [rows, photoRows] = await Promise.all([
        fetchVerificationRows(client, ctx.rentalId),
        fetchVerificationPhotos(client, ctx.rentalId, 'return'),
      ]);
      const maps = mergeChecklistMapsFromRows(rows, 'return');
      setStoredManual(maps.owner);

      const renterPhotos = photoRows.filter((p) => p.role === 'renter');
      const previews: ReturnPhotoPreview[] = [];
      for (const row of renterPhotos) {
        const signedUrl = row.storage_path
          ? await signedUrlForEvidencePath(client, row.storage_path)
          : null;
        previews.push({ id: row.id, signedUrl: signedUrl ?? undefined });
      }
      setReturnPhotos(previews);
    } finally {
      setLoading(false);
    }
  }, [ctx.rentalId]);

  useEffect(() => {
    void loadReturnPrepState();
  }, [loadReturnPrepState]);

  const returnLocation = ctx.rental.return_location ?? ctx.rental.meetup_location;
  const meetupDetailsConfirmed = Boolean(ctx.returnIso && returnLocation);

  const checklistDone = useMemo(
    () =>
      buildOwnerReturnPrepChecklistDone({
        meetupDetailsConfirmed,
        renterReturnPhotoCount: returnPhotos.length,
        storedManual,
      }),
    [meetupDetailsConfirmed, returnPhotos.length, storedManual]
  );

  const prepComplete = isOwnerReturnPrepChecklistComplete(checklistDone);

  const toggleManualItem = useCallback(async () => {
    const nextValue = !storedManual[OWNER_RETURN_PREP_MANUAL_ITEM_ID];
    const next = { ...storedManual, [OWNER_RETURN_PREP_MANUAL_ITEM_ID]: nextValue };
    setStoredManual(next);
    const ok = await persistChecklistState(
      getSupabase(),
      ctx.rentalId,
      'return',
      ctx.viewerUserId,
      { [OWNER_RETURN_PREP_MANUAL_ITEM_ID]: nextValue }
    );
    if (!ok) {
      Alert.alert('Could not save', 'Try again in a moment.');
      void loadReturnPrepState();
    }
  }, [ctx.rentalId, ctx.viewerUserId, loadReturnPrepState, storedManual]);

  return (
    <WizardLightShell
      title={meta.title}
      subtitle="Review return details and be ready when the renter arrives."
      onBack={() => router.back()}
      onOpenMessages={w.openMessages}
      primaryLabel="Ready for return meetup"
      primaryDisabled={!prepComplete || loading}
      onPrimary={() => void w.goToResolvedNext()}
      footerNote={
        !prepComplete
          ? returnPhotos.length === 0
            ? 'Return photos appear here when the renter uploads them.'
            : 'Complete the checklist before continuing.'
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
        <Text style={styles.meetupLabel}>Return meetup</Text>
        <Text style={styles.meetupValue}>{formatWizardDateTime(ctx.returnIso)}</Text>
        <Text style={styles.meetupSub}>{formatWizardLocation(returnLocation)}</Text>
      </View>

      {returnPhotos.length > 0 ? (
        <View style={styles.photoCard}>
          <Text style={styles.photoTitle}>Renter return photos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
            {returnPhotos.map((photo) => (
              <RentalEvidenceThumbnail
                key={photo.id}
                uri={photo.signedUrl}
                size="handoffItem"
                category="item"
                canDelete={false}
                onPress={() => {}}
                onDelete={() => {}}
              />
            ))}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.photoCard}>
          <Text style={styles.photoTitle}>Renter return photos</Text>
          <Text style={styles.photoEmpty}>
            Waiting for the renter to upload return photos. This screen updates when they do.
          </Text>
        </View>
      )}

      <WizardJourneyChecklist
        items={OWNER_RETURN_PREP_CHECKLIST.map((item) => {
          const done = Boolean(checklistDone[item.id]);
          if (item.id === OWNER_RETURN_PREP_MANUAL_ITEM_ID) {
            return {
              id: item.id,
              label: item.label,
              detail: item.detail,
              done,
              onPress: done ? undefined : () => void toggleManualItem(),
            };
          }
          return { id: item.id, label: item.label, detail: item.detail, done };
        })}
      />
    </WizardLightShell>
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
  photoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  photoTitle: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  photoEmpty: { fontSize: 13, color: ui.textSecondary, lineHeight: 18 },
  photoRow: { gap: 10, paddingVertical: 4 },
});

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { MeetupLifecycleShell } from '@/components/rentalLifecycle/MeetupLifecycleShell';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { INSPECTION_INCOMPLETE_AUTH_MESSAGE } from '@/lib/rentalAuthorization/bindingAuthorizationGate';
import { resolveAuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';
import { canAccessBindingAuthorizationForContext } from '@/lib/pickupHandoffCompletion';
import { formatWizardDateTime, formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';

/** Green phase — final activation tap before enjoy-rental (usually skipped if sign step auto-activates). */
export function RentalActivationStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const progress = useMemo(() => resolveAuthorizationProgress(ctx), [ctx]);
  const inspectionComplete = useMemo(
    () => canAccessBindingAuthorizationForContext(ctx),
    [ctx]
  );

  const onPrimary = () => {
    if (!inspectionComplete) {
      Alert.alert('Inspection required', INSPECTION_INCOMPLETE_AUTH_MESSAGE);
      return;
    }
    if (progress.rentalActivated) {
      void w.goToResolvedNext();
    } else {
      void w.activateRentalStep();
    }
  };

  return (
    <MeetupLifecycleShell
      phase="rental_active"
      progressIndex={2}
      title="Activate rental"
      subtitle="Everything is on file. Tap below to start your official rental period."
      onBack={() => router.back()}
      onOpenMessages={w.openMessages}
      primaryLabel={
        progress.rentalActivated
          ? 'Continue'
          : w.authorizationBusy
            ? 'Activating…'
            : 'Activate rental'
      }
      primaryDisabled={!progress.activationReady || w.authorizationBusy || !inspectionComplete}
      primaryBusy={w.authorizationBusy}
      onPrimary={onPrimary}
      footerNote={
        inspectionComplete
          ? 'Protection becomes active when your rental starts.'
          : INSPECTION_INCOMPLETE_AUTH_MESSAGE
      }
    >
      <View style={styles.hero}>
        <Ionicons name="shield-checkmark" size={48} color="#16A34A" />
        <Text style={styles.heroTitle}>You’re ready</Text>
        <Text style={styles.heroBody}>Inspection, agreement, hold, and signature are complete.</Text>
      </View>
      <View style={styles.detailCard}>
        <DetailRow label="Pickup" value={formatWizardDateTime(ctx.pickupIso)} />
        <DetailRow label="Return" value={formatWizardDateTime(ctx.returnIso)} />
        <DetailRow label="Location" value={formatWizardLocation(ctx.rental.meetup_location)} />
      </View>
    </MeetupLifecycleShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  heroBody: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#BBF7D0',
  },
  detailRow: { gap: 4 },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
});

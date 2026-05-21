import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { ui } from '@/constants/appUi';
import { resolveRentalActivationState } from '@/lib/rentalActivation';
import { buildPickupHandoffCompletionInputFromWizard } from '@/lib/pickupHandoffCompletion';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';

function authorizationStatusTone(phase: string): { bg: string; text: string } {
  if (phase === 'authorized') return { bg: '#E8F5E9', text: '#1B5E20' };
  if (phase === 'failed_authorization') return { bg: '#FFEBEE', text: '#B71C1C' };
  if (phase.startsWith('pending')) return { bg: '#FFF8E1', text: '#E65100' };
  return { bg: ui.surfaceStriped, text: ui.textSecondary };
}

export function RentalAuthorizationStep() {
  const router = useRouter();
  const { ctx, openAdvancedDetails } = useRentalWizard();
  const meta = WIZARD_STEP_META.rental_authorization;

  const activation = useMemo(
    () => resolveRentalActivationState(buildPickupHandoffCompletionInputFromWizard(ctx)),
    [ctx]
  );
  const auth = activation.authorization;
  const tone = authorizationStatusTone(auth.phase);

  const primaryLabel =
    auth.phase === 'pending_agreement_review'
      ? 'Review agreement'
      : auth.phase === 'pending_preauthorization'
        ? 'Continue to authorization'
        : auth.phase === 'pending_signature'
          ? 'Sign & authorize'
          : auth.phase === 'failed_authorization'
            ? 'Try again'
            : 'Open rental workspace';

  return (
    <WizardLightShell
      title={meta.title}
      onBack={() => router.back()}
      onOpenMessages={() => openAdvancedDetails()}
      primaryLabel={primaryLabel}
      onPrimary={() => openAdvancedDetails('pickup')}
      footerNote="Your rental activates only after you review the agreement, authorize the security hold, and sign."
    >
      <WizardItemCard
        title={ctx.displayTitle}
        ownerLine={formatBorrowingFromOwner(ctx.ownerDisplayName)}
        thumbUri={ctx.heroImageUrl}
        rentalCode={ctx.rentalCodeLabel}
      />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rental authorization</Text>
        <Text style={styles.cardBody}>
          Physical pickup is complete. Finish the official steps below to activate your rental.
        </Text>
        <View style={[styles.pill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.pillText, { color: tone.text }]}>{auth.phaseLabel}</Text>
        </View>
        <View style={styles.checklist}>
          <AuthRow done={activation.physical.physicalPossessionConfirmed} label="Pickup inspection complete" />
          <AuthRow done={auth.agreementAcknowledged} label="Agreement reviewed" />
          <AuthRow done={auth.preauthorizationSucceeded} label="Payment hold authorized" />
          <AuthRow done={auth.signaturesComplete} label="Signature & liability accepted" />
        </View>
      </View>
    </WizardLightShell>
  );
}

function AuthRow({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowMark}>{done ? '✓' : '○'}</Text>
      <Text style={[styles.rowLabel, done && styles.rowLabelDone]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: ui.textPrimary },
  cardBody: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 13, fontWeight: '600' },
  checklist: { marginTop: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowMark: { width: 18, fontSize: 15, fontWeight: '700', color: ui.textSecondary },
  rowLabel: { flex: 1, fontSize: 14, color: ui.textPrimary },
  rowLabelDone: { color: ui.textSecondary },
});

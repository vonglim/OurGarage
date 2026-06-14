import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { MeetupLifecycleShell } from '@/components/rentalLifecycle/MeetupLifecycleShell';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { ui } from '@/constants/appUi';
import { INSPECTION_INCOMPLETE_AUTH_MESSAGE } from '@/lib/rentalAuthorization/bindingAuthorizationGate';
import { resolveAuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';
import { canAccessBindingAuthorizationForContext } from '@/lib/pickupHandoffCompletion';

export function DigitalSignatureStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const progress = useMemo(() => resolveAuthorizationProgress(ctx), [ctx]);
  const inspectionComplete = useMemo(
    () => canAccessBindingAuthorizationForContext(ctx),
    [ctx]
  );
  const [legalName, setLegalName] = useState(ctx.rental.signed_name ?? '');

  const canSign =
    inspectionComplete &&
    legalName.trim().length >= 2 &&
    progress.securityHoldAuthorized &&
    !progress.digitalSignatureComplete;

  const onPrimary = () => {
    if (!inspectionComplete) {
      Alert.alert('Inspection required', INSPECTION_INCOMPLETE_AUTH_MESSAGE);
      return;
    }
    if (progress.digitalSignatureComplete) {
      void w.goToResolvedNext();
    } else {
      void w.signAndActivateRental(legalName.trim());
    }
  };

  return (
    <MeetupLifecycleShell
      phase="rental_authorization"
      progressIndex={1}
      title="Sign & activate"
      subtitle="Type your full legal name below. This is your binding electronic signature."
      onBack={() => router.back()}
      onOpenMessages={w.openMessages}
      primaryLabel={
        progress.digitalSignatureComplete
          ? 'Continue'
          : w.authorizationBusy
            ? 'Signing…'
            : 'Sign & activate rental'
      }
      primaryDisabled={(!canSign && !progress.digitalSignatureComplete) || !inspectionComplete}
      primaryBusy={w.authorizationBusy}
      onPrimary={onPrimary}
      footerNote={
        inspectionComplete
          ? 'By signing, you agree your typed name is a valid electronic signature.'
          : INSPECTION_INCOMPLETE_AUTH_MESSAGE
      }
    >
      {!inspectionComplete ? (
        <View style={styles.inspectionGate}>
          <Text style={styles.inspectionGateText}>{INSPECTION_INCOMPLETE_AUTH_MESSAGE}</Text>
        </View>
      ) : null}

      <View style={styles.padCard}>
        <Text style={styles.padLabel}>Signature</Text>
        <TextInput
          value={legalName}
          onChangeText={setLegalName}
          placeholder="Full legal name"
          autoCapitalize="words"
          style={styles.padInput}
          editable={!progress.digitalSignatureComplete && inspectionComplete}
        />
        {legalName.trim().length >= 2 ? (
          <Text style={styles.scriptPreview}>{legalName.trim()}</Text>
        ) : (
          <Text style={styles.padHint}>Sign with your full legal name as shown on your ID</Text>
        )}
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="document-text-outline" size={18} color="#EA580C" />
        <Text style={styles.metaText}>
          {ctx.displayTitle} · {ctx.rentalCodeLabel}
        </Text>
      </View>
    </MeetupLifecycleShell>
  );
}

const styles = StyleSheet.create({
  inspectionGate: { paddingBottom: 8 },
  inspectionGateText: { fontSize: 14, color: '#9A3412', lineHeight: 20 },
  padCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FED7AA',
    padding: 16,
    minHeight: 180,
    gap: 8,
  },
  padLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#9A3412',
  },
  padInput: {
    fontSize: 22,
    fontWeight: '600',
    color: ui.textPrimary,
    paddingVertical: 8,
  },
  scriptPreview: {
    fontSize: 32,
    fontStyle: 'italic',
    color: '#0F172A',
    paddingVertical: 12,
  },
  padHint: { fontSize: 14, color: '#94A3B8', lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  metaText: { flex: 1, fontSize: 14, color: '#64748B' },
});

import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DevToolkitActionRow, DevToolkitSection } from '@/components/devtools/DevToolkitActionRow';
import { RentalLifecycleInspector } from '@/components/devtools/RentalLifecycleInspector';
import { RentalScenarioAuditPanel } from '@/components/devtools/RentalScenarioAuditPanel';
import { RentalLifecycleStateMap } from '@/components/devtools/RentalLifecycleStateMap';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { buildRentalWizardDebugInfo } from '@/lib/devTools/rentalDevToolkit';
import {
  devAutofillRenterJourney,
  devApproveMeetupProposal,
  devClearWizardTransitions,
  devResetOperationalStateOnly,
  devResetRentalSimulation,
  devResetWizardStateOnly,
  devSimulateActivateRental,
  devSimulateCompleteReturn,
  devSimulateImHerePickup,
  devSimulateOwnerConfirmArrival,
  devSimulateOwnerPickupPhotos,
  devSimulatePickupScheduleConfirmed,
  devSimulateRenterApprovePhotos,
  devSimulateReturnFlow,
  devSimulateSignAgreement,
  devForceCancelledRental,
  devForceCancellationAcceptedRental,
  devForceCancellationDeclinedRental,
  devForceCancellationRequestedRental,
  devResetCancellationState,
  RENTAL_SIMULATION_JUMPS,
} from '@/lib/rentalSimulation';
import { getAuthUserIdSync } from '@/lib/authUser';
import { useDevToolsStore } from '@/store/devToolsStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { useRentalSimulationStore } from '@/store/rentalSimulationStore';

type Props = {
  visible: boolean;
  onClose: () => void;
  pathname: string;
};

export function RentalDevToolkitPanel({ visible, onClose, pathname }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = getAuthUserIdSync().trim();
  const [customDateInput, setCustomDateInput] = useState('');
  const [busy, setBusy] = useState(false);

  const registered = useRentalSimulationStore((s) => s.registered);
  const simulationJump = useRentalSimulationStore((s) => s.simulationJump);
  const writeToDatabase = useRentalSimulationStore((s) => s.writeToDatabase);
  const lifecycleOverride = useDevToolsStore((s) => s.rentalLifecycleOverride);
  const applyJump = useRentalSimulationStore((s) => s.applySimulationJump);
  const advanceClock = useRentalSimulationStore((s) => s.advanceClock);
  const rewindClock = useRentalSimulationStore((s) => s.rewindClock);
  const setCustomNow = useRentalSimulationStore((s) => s.setCustomNow);
  const resetClock = useRentalSimulationStore((s) => s.resetClock);
  const setWriteToDatabase = useRentalSimulationStore((s) => s.setWriteToDatabase);
  const clearSimulation = useRentalSimulationStore((s) => s.clearSimulation);
  const getNowMs = useRentalSimulationStore((s) => s.getNowMs);
  const clearLifecycleOverride = useDevToolsStore((s) => s.clearRentalLifecycleOverride);

  const rentalId = registered?.rentalId ?? '';
  const clockLabel = useMemo(() => new Date(getNowMs()).toLocaleString(), [getNowMs, visible]);

  const run = useCallback(
    async (label: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
      if (!rentalId) {
        showFeedbackToast('Open a rental or wizard screen first');
        return;
      }
      setBusy(true);
      try {
        const res = await fn();
        showFeedbackToast(res.ok ? res.message ?? label : res.message ?? 'Failed');
        if (res.ok && registered?.refresh) await registered.refresh();
      } catch (e) {
        if (__DEV__) console.warn('[dev-toolkit]', e);
        showFeedbackToast(`${label} failed`);
      } finally {
        setBusy(false);
      }
    },
    [registered, rentalId]
  );

  const debugInfo = useMemo(() => {
    if (!registered?.wizardCtx) return null;
    return buildRentalWizardDebugInfo(registered.wizardCtx, simulationJump);
  }, [registered?.wizardCtx, simulationJump]);

  const displayPhase =
    lifecycleOverride ?? registered?.wizardCtx?.lifecyclePhase ?? 'pickup';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Rental dev toolkit</Text>
            <Text style={styles.meta} numberOfLines={2}>
              {pathname}
            </Text>
            {rentalId ? (
              <Text style={styles.rentalId} numberOfLines={1}>
                Rental {rentalId.slice(0, 8)}…
              </Text>
            ) : (
              <Text style={styles.warn}>No rental context — open /rental/[id] or /rental-wizard/[id]</Text>
            )}
          </View>
          <Pressable onPress={onClose} style={styles.closeChip}>
            <Text style={styles.closeChipText}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Write simulation to Supabase</Text>
          <Switch value={writeToDatabase} onValueChange={setWriteToDatabase} />
        </View>

        <RentalLifecycleStateMap
          phase={displayPhase}
          simulationJump={simulationJump}
        />

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
          <DevToolkitSection title="Quick lifecycle jump">
            <View style={styles.chipGrid}>
              {RENTAL_SIMULATION_JUMPS.map((j) => (
                <Pressable
                  key={j.id}
                  disabled={busy}
                  onPress={() => {
                    applyJump(j.id);
                    showFeedbackToast(`Jump → ${j.label}`);
                    if (registered?.refresh) void registered.refresh();
                    if (rentalId && j.wizardStep) {
                      router.replace(
                        `/rental-wizard/${rentalId}/s/${j.wizardStep}` as `/rental-wizard/${string}/s/${string}`
                      );
                    }
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    simulationJump === j.id && styles.chipActive,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.chipText, simulationJump === j.id && styles.chipTextActive]} numberOfLines={2}>
                    {j.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <DevToolkitActionRow
              title="Clear lifecycle override"
              subtitle="Use DB-derived phase again"
              onPress={() => {
                clearLifecycleOverride();
                clearSimulation();
                showFeedbackToast('Overrides cleared');
              }}
            />
          </DevToolkitSection>

          <DevToolkitSection title="Simulate renter actions">
            <DevToolkitActionRow
              title="Propose / confirm pickup schedule"
              disabled={busy || !rentalId}
              onPress={() => void run('Pickup schedule', () => devSimulatePickupScheduleConfirmed(rentalId, me))}
            />
            <DevToolkitActionRow
              title="Approve verification photos"
              disabled={busy || !rentalId}
              onPress={() => void run('Approve photos', () => devSimulateRenterApprovePhotos(rentalId, me))}
            />
            <DevToolkitActionRow
              title={`Tap "I'm here" (pickup)`}
              disabled={busy || !rentalId}
              onPress={() => void run("I'm here", () => devSimulateImHerePickup(rentalId, me))}
            />
            <DevToolkitActionRow
              title="Sign agreement"
              disabled={busy || !rentalId}
              onPress={() => void run('Sign', () => devSimulateSignAgreement(rentalId, me))}
            />
            <DevToolkitActionRow
              title="Upload return photos / confirm return"
              disabled={busy || !rentalId}
              onPress={() => void run('Return', () => devSimulateReturnFlow(rentalId, me))}
            />
          </DevToolkitSection>

          <DevToolkitSection title="Simulate owner actions">
            <DevToolkitActionRow
              title="Approve meetup / pickup"
              disabled={busy || !rentalId}
              onPress={() => void run('Approve meetup', () => devApproveMeetupProposal(rentalId, me))}
            />
            <DevToolkitActionRow
              title="Upload verification photos"
              disabled={busy || !rentalId}
              onPress={() => void run('Owner photos', () => devSimulateOwnerPickupPhotos(rentalId))}
            />
            <DevToolkitActionRow
              title="Confirm arrival"
              disabled={busy || !rentalId}
              onPress={() => void run('Arrival', () => devSimulateOwnerConfirmArrival(rentalId))}
            />
            <DevToolkitActionRow
              title="Confirm return complete"
              disabled={busy || !rentalId}
              onPress={() => void run('Return complete', () => devSimulateCompleteReturn(rentalId))}
            />
            <DevToolkitActionRow
              title="Activate rental (status active)"
              disabled={busy || !rentalId}
              onPress={() => void run('Activate', () => devSimulateActivateRental(rentalId))}
            />
          </DevToolkitSection>

          <DevToolkitSection title="Cancellation (DEV)">
            <DevToolkitActionRow
              title="Force cancellation requested"
              subtitle="cancellation_status=requested + system chat line"
              disabled={busy || !rentalId}
              onPress={() =>
                void run('Requested', () => devForceCancellationRequestedRental(rentalId, me))
              }
            />
            <DevToolkitActionRow
              title="Force cancellation accepted"
              subtitle="Accepts pending request; purges wizard drafts"
              disabled={busy || !rentalId}
              onPress={() =>
                void run('Accepted', () => devForceCancellationAcceptedRental(rentalId, me))
              }
            />
            <DevToolkitActionRow
              title="Force cancellation declined"
              subtitle="Declines pending request"
              disabled={busy || !rentalId}
              onPress={() =>
                void run('Declined', () => devForceCancellationDeclinedRental(rentalId, me))
              }
            />
            <DevToolkitActionRow
              title="Force cancelled (terminal)"
              subtitle="Sets cancellation_status=cancelled, status=cancelled"
              disabled={busy || !rentalId}
              onPress={() => void run('Force cancelled', () => devForceCancelledRental(rentalId, me))}
            />
            <DevToolkitActionRow
              title="Reset cancellation state"
              subtitle="Clears cancellation_* fields; restores status if was cancelled"
              disabled={busy || !rentalId}
              onPress={() => void run('Reset cancellation', () => devResetCancellationState(rentalId))}
            />
          </DevToolkitSection>

          <DevToolkitSection title="Time controls">
            <Text style={styles.clockLabel}>Effective now: {clockLabel}</Text>
            <DevToolkitActionRow title="Advance 1 hour" onPress={() => advanceClock(60 * 60 * 1000)} />
            <DevToolkitActionRow title="Advance 1 day" onPress={() => advanceClock(24 * 60 * 60 * 1000)} />
            <DevToolkitActionRow title="Rewind 1 day" onPress={() => rewindClock(24 * 60 * 60 * 1000)} />
            <TextInput
              style={styles.dateInput}
              placeholder="Custom ISO date (2026-05-15T12:00:00Z)"
              placeholderTextColor={ui.textMuted}
              value={customDateInput}
              onChangeText={setCustomDateInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <DevToolkitActionRow
              title="Set custom simulated date"
              onPress={() => {
                setCustomNow(customDateInput.trim() || null);
                showFeedbackToast('Simulation clock updated');
              }}
            />
            <DevToolkitActionRow title="Reset timestamps" tone="danger" onPress={() => resetClock()} />
          </DevToolkitSection>

          <DevToolkitSection title="Auto test flows">
            <DevToolkitActionRow
              title="Autofill entire renter journey"
              tone="primary"
              disabled={busy || !rentalId}
              onPress={() => void run('Autofill journey', () => devAutofillRenterJourney(rentalId, me))}
            />
          </DevToolkitSection>

          {registered?.wizardCtx ? (
            <DevToolkitSection title="Lifecycle inspector">
              <RentalLifecycleInspector ctx={registered.wizardCtx} />
            </DevToolkitSection>
          ) : null}

          <DevToolkitSection title="Scenario audit (QA)">
            <RentalScenarioAuditPanel ctx={registered?.wizardCtx ?? null} />
          </DevToolkitSection>

          {debugInfo ? (
            <DevToolkitSection title="Wizard debugging (legacy)">
              <View style={styles.debugBox}>
                <DebugLine label="Logical step" value={debugInfo.logicalStep} />
                <DebugLine label="Effective step" value={debugInfo.effectiveStep} />
                <DebugLine label="Lifecycle" value={debugInfo.lifecyclePhase} />
                <DebugLine label="Blocker" value={debugInfo.blocker ?? '—'} />
                <DebugLine label="Seen transitions" value={debugInfo.seenTransitions.join(', ') || '—'} />
                <DebugLine label="Next route" value={debugInfo.nextRoute ?? '—'} />
                {debugInfo.hasStepOverride ? (
                  <Text style={styles.debugOverride}>⚠ Wizard step override active</Text>
                ) : null}
              </View>
            </DevToolkitSection>
          ) : null}

          <DevToolkitSection title="Reset / cleanup">
            <DevToolkitActionRow
              title="Reset wizard state only"
              subtitle="Clears seen transitions + wizard_progress drafts"
              disabled={busy || !rentalId}
              onPress={() => void run('Reset wizard', () => devResetWizardStateOnly(rentalId, me))}
            />
            <DevToolkitActionRow
              title="Reset operational state only"
              subtitle="Clears handoff flags + operational states on rentals row"
              disabled={busy || !rentalId}
              onPress={() => void run('Reset operational', () => devResetOperationalStateOnly(rentalId))}
            />
            <DevToolkitActionRow
              title="Clear wizard transitions (legacy)"
              disabled={busy || !rentalId}
              onPress={() => void run('Clear transitions', () => devClearWizardTransitions(rentalId, me))}
            />
            <DevToolkitActionRow
              title="Reset rental simulation (all)"
              tone="danger"
              disabled={busy || !rentalId}
              onPress={() => void run('Reset all', () => devResetRentalSimulation(rentalId, me))}
            />
          </DevToolkitSection>
        </ScrollView>
      </View>
    </Modal>
  );
}

function DebugLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.debugRow}>
      <Text style={styles.debugLabel}>{label}</Text>
      <Text style={styles.debugValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', color: ui.textPrimary },
  meta: { marginTop: 4, fontSize: 12, color: ui.textSecondary },
  rentalId: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#4F46E5' },
  warn: { marginTop: 6, fontSize: 12, color: '#B45309', fontWeight: '600' },
  closeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  closeChipText: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 8,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: ui.textPrimary, flex: 1 },
  scroll: { flex: 1, marginTop: 8 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '48%',
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: '#818CF8' },
  chipText: { fontSize: 12, fontWeight: '600', color: ui.textPrimary },
  chipTextActive: { color: '#4338CA' },
  clockLabel: { fontSize: 13, color: ui.textSecondary, marginBottom: 8 },
  dateInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: ui.textPrimary,
    marginBottom: 8,
  },
  debugBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
  },
  debugRow: { marginBottom: 8 },
  debugLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  debugValue: { fontSize: 13, color: '#F8FAFC', fontFamily: 'Menlo', marginTop: 2 },
  debugOverride: { marginTop: 6, fontSize: 12, color: '#FCD34D', fontWeight: '600' },
});

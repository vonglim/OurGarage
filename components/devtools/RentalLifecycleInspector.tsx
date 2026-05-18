import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { DevToolkitActionRow } from '@/components/devtools/DevToolkitActionRow';
import { buildLifecycleInspectorBundle } from '@/lib/devTools/buildLifecycleInspector';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { ui } from '@/constants/appUi';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

type Props = {
  ctx: RentalWizardContext;
};

export function RentalLifecycleInspector({ ctx }: Props) {
  const bundle = buildLifecycleInspectorBundle(ctx);

  const shareSnapshot = async () => {
    try {
      await Share.share({
        message: bundle.text,
        title: 'Rental lifecycle snapshot',
      });
    } catch {
      showFeedbackToast('Could not share snapshot');
    }
  };

  const logReasoning = () => {
    console.log('[rental-lifecycle] inspector snapshot', bundle.snapshot);
    console.log('[rental-lifecycle] reasoning:\n', bundle.snapshot.reasoning.join('\n'));
    showFeedbackToast('Lifecycle snapshot logged to console');
  };

  return (
    <View style={styles.wrap}>
      {bundle.validationIssueCount > 0 ? (
        <Text style={styles.warn}>
          {bundle.validationIssueCount} lifecycle validation issue
          {bundle.validationIssueCount === 1 ? '' : 's'} — see console
        </Text>
      ) : (
        <Text style={styles.ok}>Lifecycle validation: no issues detected</Text>
      )}

      <InspectorLine label="rental.status" value={bundle.snapshot.rental_status} />
      <InspectorLine label="agreement_status" value={bundle.snapshot.agreement_status} />
      <InspectorLine label="cancellation_status" value={bundle.snapshot.cancellation_status} />
      <InspectorLine label="logical step" value={bundle.snapshot.logical_wizard_step} />
      <InspectorLine label="transition" value={bundle.snapshot.transition_step ?? '—'} />
      <InspectorLine label="effective step" value={bundle.snapshot.effective_wizard_step} />
      <InspectorLine label="canonical phase" value={bundle.snapshot.canonical_phase} />
      <InspectorLine label="card estimate" value={bundle.snapshot.estimated_card_phase} />
      <InspectorLine label="last_proposed_by" value={bundle.snapshot.last_proposed_by ?? '—'} />
      <InspectorLine label="agreed_pickup_datetime" value={bundle.snapshot.agreed_pickup_datetime ?? '—'} />
      <InspectorLine label="meetup_location" value={bundle.snapshot.meetup_location ?? '—'} />
      <InspectorLine
        label="pickup_return_coordination_ack_at"
        value={bundle.snapshot.pickup_return_coordination_ack_at ?? '—'}
      />
      <InspectorLine
        label="pickup_handoff_complete"
        value={bundle.snapshot.pickup_handoff_complete ? 'true' : 'false'}
      />
      <InspectorLine
        label="return_handoff_complete"
        value={bundle.snapshot.return_handoff_complete ? 'true' : 'false'}
      />
      <InspectorLine
        label="seen_transitions"
        value={bundle.snapshot.seen_transitions.join(', ') || '—'}
      />

      <Text style={styles.reasoningTitle}>Why this step resolved</Text>
      {bundle.snapshot.reasoning.map((line) => (
        <Text key={line} style={styles.reasoningLine}>
          • {line}
        </Text>
      ))}

      <DevToolkitActionRow title="Copy / share lifecycle snapshot" onPress={() => void shareSnapshot()} />
      <DevToolkitActionRow title="Log resolver reasoning to console" onPress={logReasoning} />
    </View>
  );
}

function InspectorLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  warn: { fontSize: 12, fontWeight: '700', color: '#B45309', marginBottom: 6 },
  ok: { fontSize: 12, fontWeight: '600', color: '#15803D', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  label: { width: 168, fontSize: 11, fontWeight: '600', color: ui.textMuted },
  value: { flex: 1, fontSize: 11, color: ui.textPrimary },
  reasoningTitle: { marginTop: 10, fontSize: 12, fontWeight: '800', color: ui.textPrimary },
  reasoningLine: { fontSize: 11, lineHeight: 16, color: ui.textSecondary, marginTop: 4 },
});

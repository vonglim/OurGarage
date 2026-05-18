import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DevToolkitSection } from '@/components/devtools/DevToolkitActionRow';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { CONFLICT_RESOLUTION_RULES } from '@/lib/rentalLifecycle/conflictResolution';
import { getActiveRealtimeSubscriptionCount } from '@/lib/rentalLifecycle/realtimeSubscriptionRegistry';
import {
  validateCardWizardAlignment,
  validateSuiteAgainstContext,
} from '@/lib/rentalLifecycle/scenarioAudit';
import { ALL_SCENARIO_SUITES } from '@/lib/rentalLifecycle/scenarioSuites';
import { buildLifecycleInspectorBundle } from '@/lib/devTools/buildLifecycleInspector';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

type Props = {
  ctx: RentalWizardContext | null;
};

export function RentalScenarioAuditPanel({ ctx }: Props) {
  const [expandedSuiteId, setExpandedSuiteId] = useState<string | null>('happy_path');

  const cardAlign = useMemo(
    () => (ctx ? validateCardWizardAlignment(ctx) : null),
    [ctx]
  );

  const suiteResults = useMemo(() => {
    if (!ctx) return null;
    return ALL_SCENARIO_SUITES.map((s) => validateSuiteAgainstContext(ctx, s));
  }, [ctx]);

  if (!ctx) {
    return (
      <Text style={styles.hint}>Open rental wizard to run scenario validation against live context.</Text>
    );
  }

  const bundle = buildLifecycleInspectorBundle(ctx);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sub}>
        Manual QA: walk steps in docs/rental-lifecycle-scenario-audit.md. Automated checks below are
        heuristic (card estimate lacks transition keys).
      </Text>

      <Text style={styles.metric}>
        Realtime subscriptions active: {getActiveRealtimeSubscriptionCount()}
      </Text>

      {cardAlign ? (
        <Text style={cardAlign.aligned ? styles.ok : styles.warn}>
          Card/wizard phase: {cardAlign.cardPhase} / {cardAlign.wizardPhase}
          {cardAlign.aligned ? ' ✓' : ' — mismatch (expected if on transition)'}
        </Text>
      ) : null}

      {suiteResults?.map((sr) => {
        const suite = ALL_SCENARIO_SUITES.find((s) => s.id === sr.suiteId)!;
        const open = expandedSuiteId === sr.suiteId;
        return (
          <View key={sr.suiteId} style={styles.suiteBlock}>
            <Pressable
              onPress={() => setExpandedSuiteId(open ? null : sr.suiteId)}
              style={({ pressed }) => [styles.suiteHeader, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.suiteTitle}>
                {suite.title} ({sr.passCount}/{sr.total})
              </Text>
            </Pressable>
            {open ? (
              <View style={styles.suiteBody}>
                {sr.results.map((r) => (
                  <View key={r.step.id} style={styles.stepRow}>
                    <Text style={r.pass ? styles.stepPass : styles.stepFail}>
                      {r.pass ? '✓' : '○'} {r.step.label}
                    </Text>
                    {r.notes.map((n) => (
                      <Text key={n} style={styles.stepNote}>
                        {n}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      <DevToolkitSection title="Conflict resolution (reference)">
        {CONFLICT_RESOLUTION_RULES.slice(0, 4).map((r) => (
          <Text key={r.id} style={styles.conflictLine}>
            • {r.id}: {r.expectedBehavior.slice(0, 120)}…
          </Text>
        ))}
        <Text style={styles.conflictMore}>See lib/rentalLifecycle/conflictResolution.ts</Text>
      </DevToolkitSection>

      <Text style={styles.logHint}>
        Console filters: [rental-lifecycle] [rental-realtime] [rental-routing] [rental-notification]
        [rental-transition]
      </Text>
      <Text style={styles.logHint}>Inspector issues: {bundle.validationIssueCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hint: { fontSize: 12, color: ui.textSecondary, lineHeight: 18 },
  sub: { fontSize: 11, color: ui.textMuted, lineHeight: 16, marginBottom: 4 },
  metric: { fontSize: 12, fontWeight: '600', color: ui.textPrimary },
  ok: { fontSize: 12, color: '#15803D', fontWeight: '600' },
  warn: { fontSize: 12, color: '#B45309', fontWeight: '600' },
  suiteBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  suiteHeader: { padding: 10, backgroundColor: '#F8FAFC' },
  suiteTitle: { fontSize: 13, fontWeight: '700', color: ui.textPrimary },
  suiteBody: { padding: 10, gap: 8 },
  stepRow: { gap: 2 },
  stepPass: { fontSize: 12, fontWeight: '600', color: ui.textPrimary },
  stepFail: { fontSize: 12, fontWeight: '600', color: '#B45309' },
  stepNote: { fontSize: 11, color: ui.textSecondary, marginLeft: 14 },
  conflictLine: { fontSize: 11, color: ui.textSecondary, lineHeight: 16, marginTop: 4 },
  conflictMore: { fontSize: 11, color: ui.textMuted, marginTop: 6 },
  logHint: { fontSize: 11, color: ui.textMuted, marginTop: 8 },
});

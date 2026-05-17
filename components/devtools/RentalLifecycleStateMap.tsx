import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RentalLifecyclePhase } from '@/lib/rentalLifecyclePhase';
import { ui } from '@/constants/appUi';

const NODES: { key: RentalLifecyclePhase | 'request'; label: string }[] = [
  { key: 'request', label: 'Request' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'active', label: 'Active' },
  { key: 'return', label: 'Return' },
  { key: 'completed', label: 'Done' },
];

export function RentalLifecycleStateMap({
  phase,
  simulationJump,
}: {
  phase: RentalLifecyclePhase | 'request';
  simulationJump: string | null;
}) {
  const activeKey =
    simulationJump === 'request_pending'
      ? 'request'
      : phase === 'completed'
        ? 'completed'
        : phase;

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {NODES.map((node, i) => {
          const on = node.key === activeKey;
          return (
            <React.Fragment key={node.key}>
              {i > 0 ? <View style={[styles.line, on && styles.lineOn]} /> : null}
              <View style={[styles.node, on && styles.nodeOn]}>
                <Text style={[styles.nodeText, on && styles.nodeTextOn]}>{node.label}</Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
      {simulationJump ? (
        <Text style={styles.jumpHint} numberOfLines={1}>
          Sim: {simulationJump.replace(/_/g, ' ')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  track: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { flex: 1, height: 2, backgroundColor: '#E2E8F0', marginHorizontal: 4 },
  lineOn: { backgroundColor: '#818CF8' },
  node: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  nodeOn: { backgroundColor: '#4F46E5' },
  nodeText: { fontSize: 10, fontWeight: '700', color: ui.textSecondary },
  nodeTextOn: { color: '#FFFFFF' },
  jumpHint: { marginTop: 6, fontSize: 11, color: '#6366F1', fontWeight: '600' },
});

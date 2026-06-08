import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type WizardJourneyChecklistItem = {
  id: string;
  label: string;
  detail?: string;
  done: boolean;
  onPress?: () => void;
};

export function WizardJourneyChecklist({
  title = 'Checklist',
  items,
}: {
  title?: string;
  items: WizardJourneyChecklistItem[];
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {items.map((item) => {
        const row = (
          <View style={styles.row}>
            <Ionicons
              name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={item.done ? '#16A34A' : ui.textSecondary}
            />
            <View style={styles.textWrap}>
              <Text style={[styles.label, item.done && styles.labelDone]}>{item.label}</Text>
              {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
            </View>
          </View>
        );

        if (item.onPress && !item.done) {
          return (
            <Pressable key={item.id} pressOpacityFeedback={false} onPress={item.onPress}>
              {row}
            </Pressable>
          );
        }

        return <View key={item.id}>{row}</View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  title: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  textWrap: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: '600', color: ui.textPrimary },
  labelDone: { color: ui.textSecondary },
  detail: { fontSize: 13, color: ui.textSecondary, lineHeight: 18 },
});

import { Pressable } from '@/components/Pressable';
import { primarySolidPressed, ui } from '@/constants/appUi';
import type { RentalWorkflowBannerModel } from '@/lib/rentalWorkflowBannerModel';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  model: RentalWorkflowBannerModel;
  onOpenMessages: () => void;
};

export function RentalWorkflowBanner({ model, onOpenMessages }: Props) {
  if (model.kind === 'hidden') return null;

  const showCta = model.kind === 'coordinate' && model.showMessagesCta;

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.title}>{model.title}</Text>
      <Text style={styles.body}>{model.body}</Text>
      {showCta ? (
        <Pressable
          pressOpacityFeedback={false}
          haptic
          onPress={onOpenMessages}
          style={({ pressed }) => [styles.cta, pressed && primarySolidPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open Messages"
        >
          <Text style={styles.ctaLabel}>Open Messages</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 14,
    paddingHorizontal: ui.padCard,
    borderRadius: ui.radiusCard,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11, 31, 58, 0.12)',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 20,
  },
  cta: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
  },
  ctaLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primaryOn,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { RENTAL_CANCELLATION_REASONS } from '@/lib/rentalCancellation';

export function CancelledSummaryStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const reasonKey = ctx.rental.cancellation_reason;
  const reasonLabel =
    RENTAL_CANCELLATION_REASONS.find((r) => r.key === reasonKey)?.label ?? null;

  return (
    <ScreenWrapper style={styles.wrap} innerStyle={styles.inner}>
      <View style={styles.header}>
        <Pressable
          haptic
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="chevron-back" size={24} color={ui.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Rental cancelled</Text>
        <Pressable
          haptic
          onPress={w.openMessages}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={ui.primary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="close-circle" size={48} color="#DC2626" />
        </View>
        <Text style={styles.headline}>This rental has been cancelled</Text>
        <Text style={styles.sub}>
          The guided rental flow is closed. You can still view details and message the other party.
        </Text>
        {reasonLabel ? (
          <Text style={styles.reason}>Reason: {reasonLabel}</Text>
        ) : null}
        <WizardItemCard
          title={ctx.displayTitle}
          ownerLine={formatBorrowingFromOwner(ctx.ownerDisplayName)}
          rentalCode={ctx.rentalCodeLabel}
          thumbUri={ctx.heroImageUrl}
        />
        <View style={styles.actions}>
          <Pressable
            haptic
            onPress={() =>
              router.push({
                pathname: '/rental/[id]',
                params: { id: ctx.rentalId },
              })
            }
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.secondaryBtnText}>View details</Text>
          </Pressable>
          <Pressable
            haptic
            onPress={w.openMessages}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.primaryBtnText}>Open messages</Text>
          </Pressable>
        </View>
        <Text style={styles.stub}>Refunds and payment adjustments — coming soon.</Text>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: ui.surfaceGrouped },
  inner: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: ui.textPrimary, textAlign: 'center' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 16 },
  iconWrap: { alignItems: 'center', paddingVertical: 8 },
  headline: { fontSize: 22, fontWeight: '800', color: ui.textPrimary, textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 22, color: ui.textSecondary, textAlign: 'center', paddingHorizontal: 8 },
  reason: { fontSize: 14, fontWeight: '600', color: ui.textPrimary, textAlign: 'center' },
  actions: { gap: 10, marginTop: 8 },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '700', color: ui.primary },
  stub: { fontSize: 12, color: ui.textMuted, textAlign: 'center', marginTop: 4 },
});

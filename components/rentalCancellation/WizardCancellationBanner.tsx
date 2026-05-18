import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import {
  acceptRentalCancellation,
  cancellationRequesterRole,
  cancellationRequestedByOther,
  cancellationRequestedByViewer,
  declineRentalCancellation,
  isCancellationRequested,
  isRentalCancelled,
} from '@/lib/rentalCancellation';
import { getSupabase } from '@/lib/supabase';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type WizardCancellationBannerProps = {
  ctx: RentalWizardContext;
  onRefresh: () => Promise<void>;
  onOpenMessages: () => void;
};

export function WizardCancellationBanner({
  ctx,
  onRefresh,
  onOpenMessages,
}: WizardCancellationBannerProps) {
  const [busy, setBusy] = useState(false);
  const rental = ctx.rental;
  const me = ctx.viewerUserId;

  if (!isCancellationRequested(rental) || isRentalCancelled(rental)) {
    return null;
  }

  const requesterRole = cancellationRequesterRole(
    rental,
    rental.owner_user_id,
    rental.renter_user_id
  );
  const headline =
    requesterRole === 'owner'
      ? 'Cancellation requested by owner'
      : requesterRole === 'renter'
        ? 'Cancellation requested by renter'
        : 'Cancellation requested';

  const forRecipient = cancellationRequestedByOther(rental, me);
  const forRequester = cancellationRequestedByViewer(rental, me);

  const runAction = async (
    label: string,
    fn: () => Promise<{ ok: boolean; message?: string }>
  ) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) {
        await onRefresh();
      } else {
        Alert.alert('Could not update', res.message ?? 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.banner}>
      <Text style={styles.headline}>{headline}</Text>
      {forRequester ? (
        <Text style={styles.sub}>
          Waiting for the other person to respond. You can still message and coordinate in the
          meantime.
        </Text>
      ) : forRecipient ? (
        <Text style={styles.sub}>
          The rental stays active until you accept or decline. You can keep coordinating meanwhile.
        </Text>
      ) : null}

      <View style={styles.actions}>
        {forRecipient ? (
          <>
            <Pressable
              haptic
              disabled={busy}
              onPress={() =>
                void runAction('Cancellation accepted', () =>
                  acceptRentalCancellation(getSupabase(), ctx.rentalId, me, {
                    rentalTitle: ctx.displayTitle,
                  })
                )
              }
              style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>Accept cancellation</Text>
              )}
            </Pressable>
            <Pressable
              haptic
              disabled={busy}
              onPress={() =>
                void runAction('Cancellation declined', () =>
                  declineRentalCancellation(getSupabase(), ctx.rentalId, me, {
                    rentalTitle: ctx.displayTitle,
                  })
                )
              }
              style={({ pressed }) => [styles.btnOutline, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.btnOutlineText}>Decline</Text>
            </Pressable>
          </>
        ) : null}
        <Pressable
          haptic
          disabled={busy}
          onPress={onOpenMessages}
          style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnGhostText}>Open messages</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDBA74',
    gap: 8,
  },
  headline: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9A3412',
  },
  sub: {
    fontSize: 13,
    lineHeight: 18,
    color: ui.textSecondary,
  },
  actions: { gap: 8, marginTop: 4 },
  btnPrimary: {
    backgroundColor: ui.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  btnOutline: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  btnOutlineText: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  btnGhost: {
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnGhostText: { fontSize: 14, fontWeight: '700', color: ui.primary },
});

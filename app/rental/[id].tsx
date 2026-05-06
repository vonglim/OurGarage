import { router, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { formatUsd } from '@/lib/money';
import { getSupabase } from '@/lib/supabase';
import { primarySolidPressed, shadowCard, shadowKey, ui } from '@/constants/appUi';

type RentalRow = {
  id: string;
  request_id: string;
  offer_id: string;
  renter_user_id: string;
  owner_user_id: string;
  status: string | null;
  price: number | null;
  duration_type?: string | null;
};

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function RentalScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const supabase = getSupabase();
  const rentalId = (firstParam(params.id) ?? '').trim();
  const [rental, setRental] = useState<RentalRow | null>(null);
  const [request, setRequest] = useState<any>(null);

  useEffect(() => {
    if (!rentalId) return;
    let cancelled = false;
    const load = async () => {
      const { data: rentalData } = await supabase
        .from('rentals')
        .select('*')
        .eq('id', rentalId)
        .single();
      if (cancelled || rentalData == null) return;
      const r = rentalData as RentalRow;
      setRental(r);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [rentalId, supabase]);

  useEffect(() => {
    if (!rental?.request_id) return;

    const fetchRequest = async () => {
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('id', rental.request_id)
        .single();

      if (error) {
        console.error('REQUEST FETCH ERROR', error);
        return;
      }

      console.log('REQUEST FETCH SUCCESS', data);

      setRequest(data);
    };

    void fetchRequest();
  }, [rental?.request_id, supabase]);

  const requestTimestamp = useMemo(() => {
    const n = Number(request?.timestamp);
    return Number.isFinite(n) ? n : null;
  }, [request?.timestamp]);

  if (!rentalId) {
    return (
      <KeyboardDismissScreen style={styles.centered}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>Invalid rental.</Text>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  if (!rental) return null;

  const finalPrice =
    typeof rental.price === 'number'
      ? rental.price
      : typeof request.accepted_price === 'number'
        ? request.accepted_price
        : request.acceptedPrice;

  return (
    <KeyboardDismissScreen>
      <ScreenEntrance style={styles.entranceFlex}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.statusMatched}>Matched</Text>
            <Text style={styles.toolName}>
              {request?.title || 'Item'}
            </Text>

            <View style={styles.row}>
              <Text style={styles.label}>Duration</Text>
              <Text style={styles.value}>{request?.when || rental.duration_type || '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Final agreed price</Text>
              <Text style={styles.valueEmphasis}>{formatUsd(finalPrice ?? 0)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Delivery method</Text>
              <Text style={styles.value}>{request?.deliveryMethod || 'No delivery needed'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Approx. location</Text>
              <Text style={styles.value}>{request?.pickupRadius || '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Distance from you</Text>
              <Text style={styles.value}>~ nearby</Text>
            </View>

            <View style={styles.nextSteps}>
              <Text style={styles.nextStepsTitle}>Next Steps</Text>
              <Text style={styles.nextStepsBody}>
                Coordinate pickup or delivery with your match.
              </Text>

              <View style={{ marginTop: 12 }}>
                <Text>• Confirm identity</Text>
                <Text>• Agree on meeting location</Text>
                <Text>• Review item condition</Text>
              </View>

              <View style={{ marginTop: 16, gap: 12 }}>
                <Pressable
                  onPress={() => {
                    router.push({
                      pathname: '/rental-checklist/[id]',
                      params: { id: rental.id },
                    });
                  }}
                  style={({ pressed }) => [
                    {
                      marginTop: 8,
                      padding: 14,
                      borderRadius: 12,
                      backgroundColor: '#f2f2f2',
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={{ fontWeight: '600' }}>
                    Open Meet-up Checklist
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              pressOpacityFeedback={false}
              haptic
              style={({ pressed }) => [styles.messageButton, pressed && styles.messageButtonPressed]}
              onPress={() => {
                if (!rental?.id) {
                  console.warn('Missing rental id');
                  return;
                }
                router.push({
                  pathname: '/chat/[id]',
                  params: { id: rental.id },
                });
              }}
            >
              <Text style={styles.messageButtonText}>Message</Text>
            </Pressable>
            <Text style={{ marginTop: 10, fontSize: 13, color: '#666', textAlign: 'center' }}>
              Complete the full checklist before starting the rental.
            </Text>

            {requestTimestamp != null ? (
              <Pressable
                pressOpacityFeedback={false}
                style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
                onPress={() => {
                  router.push({
                    pathname: '/handoff-confirmation',
                    params: { requestId: String(requestTimestamp) },
                  });
                }}
              >
                <Text style={styles.startButtonText}>Start Rental</Text>
              </Pressable>
            ) : (
              <Text style={styles.rentalStartedNote}>Rental details loaded. Request timeline unavailable.</Text>
            )}

            <Pressable
              pressOpacityFeedback={false}
              haptic
              style={({ pressed }) => [styles.homeButton, pressed && styles.homeButtonPressed]}
              onPress={() => router.replace('/(tabs)/home')}
            >
              <Text style={styles.homeButtonText}>Back To Home</Text>
            </Pressable>
          </View>
        </ScrollView>
      </ScreenEntrance>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  entranceFlex: {
    flex: 1,
  },
  entranceFillCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: ui.surfaceStriped,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: ui.spaceLg,
    paddingHorizontal: ui.spaceSection,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: ui.surfaceStriped,
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    padding: ui.spaceSection,
    ...shadowCard,
    elevation: 2,
  },
  statusMatched: {
    alignSelf: 'center',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#1B5E20',
    backgroundColor: '#E8F5E9',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 16,
  },
  toolName: {
    fontSize: 22,
    fontWeight: '800',
    color: ui.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
  },
  row: {
    marginBottom: 16,
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
    textAlign: 'center',
  },
  value: {
    fontSize: ui.fontPrice,
    color: ui.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
  },
  valueEmphasis: {
    fontSize: ui.fontTitleCard,
    fontWeight: '700',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  nextSteps: {
    marginTop: 8,
    marginBottom: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: ui.border,
    alignItems: 'center',
  },
  nextStepsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  nextStepsBody: {
    fontSize: 15,
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  messageButton: {
    backgroundColor: ui.primary,
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    marginBottom: 12,
    ...shadowKey,
  },
  messageButtonPressed: {
    ...primarySolidPressed,
  },
  messageButtonText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
  startButton: {
    backgroundColor: ui.primary,
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    marginBottom: 12,
    ...shadowKey,
  },
  startButtonPressed: {
    ...primarySolidPressed,
  },
  startButtonText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
  rentalStartedNote: {
    fontSize: 14,
    color: ui.textSubtle,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  homeButton: {
    marginTop: 12,
    backgroundColor: ui.primary,
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    ...shadowKey,
  },
  homeButtonPressed: {
    ...primarySolidPressed,
  },
  homeButtonText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
    lineHeight: 22,
  },
});

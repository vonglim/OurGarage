import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { formatHowDisplay } from './lib/deliveryFormat';
import { formatDurationDisplay } from './lib/durationFormat';
import { formatUsd } from './lib/money';
import { formatDistanceFromYou } from './lib/requestDistance';
import { openChatForRequest } from './lib/openRequestChat';
import { getEffectiveRentalStatus, getRequestByTimestamp } from './store/requestsStore';
import { primarySolidPressed, shadowCard, shadowKey, ui } from '@/constants/appUi';

function dashLocation(loc: unknown): string {
  if (loc == null) return '—';
  const s = String(loc).trim();
  return s === '' ? '—' : s;
}

export default function MatchSummaryScreen() {
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const rawId = params.requestId;
  const requestIdStr = Array.isArray(rawId) ? rawId[0] : rawId;
  const [tick, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
    }, [])
  );

  const request = useMemo(() => {
    void tick;
    const id = Number(requestIdStr);
    if (!Number.isFinite(id)) return undefined;
    return getRequestByTimestamp(id);
  }, [requestIdStr, tick]);

  if (!requestIdStr || !Number.isFinite(Number(requestIdStr))) {
    return (
      <KeyboardDismissScreen style={styles.centered}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>Invalid request.</Text>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  if (!request) {
    return (
      <KeyboardDismissScreen style={styles.centered}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>Request not found.</Text>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  if (!request.matched) {
    return (
      <KeyboardDismissScreen style={styles.centered}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>No match on this request yet.</Text>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  const listedArea = dashLocation(request.location);
  const distanceLine = formatDistanceFromYou(request);

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
        <Text style={styles.toolName}>{request.toolName || 'No name'}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Duration</Text>
          <Text style={styles.value}>{formatDurationDisplay(request)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Final agreed price</Text>
          <Text style={styles.valueEmphasis}>{formatUsd(request.acceptedPrice)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Delivery method</Text>
          <Text style={styles.value}>{formatHowDisplay(request)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Approx. location</Text>
          <Text style={styles.value}>{listedArea}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Distance from you</Text>
          <Text style={styles.value}>{distanceLine}</Text>
        </View>

        <View style={styles.nextSteps}>
          <Text style={styles.nextStepsTitle}>Next Steps</Text>
          <Text style={styles.nextStepsBody}>
            Message your match to coordinate pickup or delivery.
          </Text>
        </View>

        <Pressable
          pressOpacityFeedback={false}
          haptic
          style={({ pressed }) => [styles.messageButton, pressed && styles.messageButtonPressed]}
          onPress={() => openChatForRequest(router, request.timestamp)}
        >
          <Text style={styles.messageButtonText}>Message</Text>
        </Pressable>

        {getEffectiveRentalStatus(request) === 'active' ? (
          <Text style={styles.rentalStartedNote}>Rental is active. Handoff was confirmed.</Text>
        ) : (
          <Pressable
            pressOpacityFeedback={false}
            style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
            onPress={() =>
              router.push({
                pathname: '/handoff-confirmation',
                params: { requestId: String(request.timestamp) },
              })
            }
          >
            <Text style={styles.startButtonText}>Start Rental</Text>
          </Pressable>
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

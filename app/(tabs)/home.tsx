import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ui } from '@/constants/appUi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '../components/MainTabFab';
import { formatDurationDisplay } from '../lib/durationFormat';
import { formatUsd, getNumericTotalPrice } from '../lib/money';
import { milesFromViewerToRequest } from '../lib/requestDistance';
import { getOnboardingTermsAccepted } from '../store/agreementsStore';
import { touchLastActive } from '../store/profileStore';
import { useRequestsStore } from '../store/requestsStore';

const MAX_RECENT = 5;

function linePrice(req: {
  matched?: boolean;
  acceptedPrice?: unknown;
  totalPrice?: unknown;
  budget?: unknown;
}): string {
  if (req.matched && req.acceptedPrice != null) {
    return formatUsd(req.acceptedPrice);
  }
  const total = getNumericTotalPrice(req);
  return total != null ? formatUsd(total) : '—';
}

function distanceLine(req: { requestLat?: unknown; requestLng?: unknown }): string {
  const mi = milesFromViewerToRequest(req);
  if (mi == null) return '';
  const rounded = Math.round(mi * 10) / 10;
  return `${rounded.toFixed(1)} mi`;
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fabBottomReserve = useMainTabFabBottomReserve();
  const [searchQuery, setSearchQuery] = useState('');
  /** Once terms are accepted, skip re-reading AsyncStorage on every tab focus. */
  const onboardingOkRef = useRef<boolean | null>(null);

  const requests = useRequestsStore((s) => s.requests);
  const recent = useMemo(
    () =>
      [...requests]
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        .slice(0, MAX_RECENT),
    [requests]
  );

  useFocusEffect(
    useCallback(() => {
      touchLastActive();
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (onboardingOkRef.current === true) return;
      let cancelled = false;
      (async () => {
        const ok = await getOnboardingTermsAccepted();
        if (cancelled) return;
        if (ok) {
          onboardingOkRef.current = true;
          return;
        }
        router.replace('/onboarding-terms');
      })();
      return () => {
        cancelled = true;
      };
    }, [router])
  );

  const submitHomeSearch = useCallback(() => {
    Keyboard.dismiss();
    router.push({
      pathname: '/browse',
      params: {
        query: searchQuery,
        mode: 'tools',
      },
    });
  }, [router, searchQuery]);

  return (
    <KeyboardDismissScreen>
      <View style={styles.screenInner}>
      <ScrollView
      style={styles.outer}
      contentContainerStyle={[
        styles.scrollInner,
        { paddingTop: 16 + insets.top, paddingBottom: fabBottomReserve },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        <Text style={styles.title}>OurGarage</Text>

        <View style={styles.focusSection}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="What tool do you need?"
            placeholderTextColor="#8E8E93"
            style={styles.searchInput}
            autoCapitalize="sentences"
            autoCorrect
            returnKeyType="search"
            blurOnSubmit
            onSubmitEditing={submitHomeSearch}
          />
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={() => router.push('/request-a-tool')}
          >
            <Text style={styles.primaryButtonText}>Request A Tool</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Recent Requests</Text>
        {recent.length === 0 ? (
          <Text style={styles.emptyRecent}>No requests yet</Text>
        ) : (
          <View style={styles.recentList}>
            {recent.map((req) => {
              const title = String(req.toolName ?? '').trim() || 'Untitled';
              const duration = formatDurationDisplay(req);
              const price = linePrice(req);
              const dist = distanceLine(req);
              return (
                <View key={String(req.timestamp)} style={styles.compactCard}>
                  <Text style={styles.cardToolName} numberOfLines={2}>
                    {title}
                  </Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardMeta}>{price}</Text>
                    <Text style={styles.cardMetaSep}> · </Text>
                    <Text style={styles.cardMeta}>{duration}</Text>
                  </View>
                  {dist ? <Text style={styles.cardDistance}>{dist}</Text> : null}
                </View>
              );
            })}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.viewMoreButton,
            pressed && styles.viewMoreButtonPressed,
          ]}
          onPress={() => router.push('/(tabs)/browse')}
        >
          <Text style={styles.viewMoreText}>View More Requests</Text>
        </Pressable>

        <Text style={styles.secondaryText}>Have a tool? Rent it out</Text>
      </View>
    </ScrollView>
      <MainTabFab />
      </View>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screenInner: {
    flex: 1,
  },
  outer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollInner: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  column: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 28,
    color: '#000',
    textAlign: 'center',
  },
  focusSection: {
    width: '100%',
    marginBottom: 8,
  },
  searchInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#C7C7CC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    backgroundColor: '#F2F2F7',
    marginBottom: 14,
    color: '#000',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: ui.pressOpacity,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  emptyRecent: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 12,
    textAlign: 'left',
  },
  recentList: {
    width: '100%',
    marginBottom: 12,
  },
  compactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardToolName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
    lineHeight: 20,
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  cardMeta: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  cardMetaSep: {
    fontSize: 14,
    color: '#8E8E93',
  },
  cardDistance: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#8E8E93',
  },
  viewMoreButton: {
    marginTop: 4,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: ui.radiusButton,
    borderWidth: 1,
    borderColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  viewMoreButtonPressed: {
    opacity: ui.pressOpacity,
    backgroundColor: 'rgba(0,122,255,0.06)',
  },
  viewMoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.primary,
  },
  secondaryText: {
    fontSize: 15,
    color: '#000',
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 8,
  },
});

import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '../components/MainTabFab';
import {
  RequestListCardInner,
  requestListCardSurface,
} from '../components/RequestListCardInner';
import { countOffersForRequest, removeOffersForRequest } from '../store/offersStore';
import { getRequests, removeRequest } from '../store/requestsStore';
import { ui } from '@/constants/appUi';

type Segment = 'requests' | 'tools';

function formatOffersReceived(n: number): string {
  if (n === 1) return '1 offer received';
  return `${n} offers received`;
}

function getTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('requests');
  const [requests, setRequests] = useState<ReturnType<typeof getRequests>>([]);
  const swipeRefs = useRef(new Map<number, Swipeable>());
  const fabBottomReserve = useMainTabFabBottomReserve();

  useFocusEffect(
    useCallback(() => {
      setRequests(getRequests().sort((a, b) => b.timestamp - a.timestamp));
    }, [])
  );

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <View style={styles.screenInner}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.screenTitle}>Activity</Text>
        <View style={styles.toggle}>
          <Pressable
            onPress={() => setSegment('requests')}
            style={({ pressed }) => [
              styles.toggleOption,
              segment === 'requests' && styles.toggleOptionActive,
              pressed && styles.toggleOptionPressed,
            ]}
          >
            <Text
              style={[styles.toggleLabel, segment === 'requests' && styles.toggleLabelActive]}
            >
              Requests
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSegment('tools')}
            style={({ pressed }) => [
              styles.toggleOption,
              segment === 'tools' && styles.toggleOptionActive,
              pressed && styles.toggleOptionPressed,
            ]}
          >
            <Text style={[styles.toggleLabel, segment === 'tools' && styles.toggleLabelActive]}>
              My Tools
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: fabBottomReserve },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {segment === 'requests' ? (
          <View style={styles.section}>
            {requests.length === 0 ? (
              <Text style={styles.emptyText}>
                No requests yet. Tap + to request a tool.
              </Text>
            ) : (
              requests.map((req, idx) => {
                const matched = !!req.matched;
                const rowKey = req.timestamp ?? idx;
                const card = (
                  <Pressable
                    style={({ pressed }) => [
                      requestListCardSurface.card,
                      matched && styles.requestCardMatched,
                      pressed && styles.requestCardPressed,
                    ]}
                    onPress={() => {
                      if (req.timestamp == null) return;
                      router.push({
                        pathname: '/request-details',
                        params: { requestId: String(req.timestamp) },
                      });
                    }}
                  >
                    <RequestListCardInner
                      req={req}
                      matched={matched}
                      timeAgoText={
                        req.timestamp != null ? getTimeAgo(req.timestamp) : null
                      }
                    />
                    {req.timestamp != null && (
                      <Text style={styles.offersReceived}>
                        {formatOffersReceived(countOffersForRequest(req.timestamp))}
                      </Text>
                    )}
                  </Pressable>
                );

                if (matched) {
                  return (
                    <View key={rowKey} style={styles.cardRowWrap}>
                      {card}
                    </View>
                  );
                }

                return (
                  <View key={rowKey} style={styles.cardRowWrap}>
                    <Swipeable
                      ref={(el) => {
                        const ts = req.timestamp;
                        if (ts == null) return;
                        if (el) swipeRefs.current.set(ts, el);
                        else swipeRefs.current.delete(ts);
                      }}
                      overshootRight={false}
                      renderRightActions={() => (
                        <View style={styles.rightActionsRow}>
                          <Pressable
                            style={styles.editAction}
                            onPress={() => {
                              if (req.timestamp == null) return;
                              swipeRefs.current.get(req.timestamp)?.close();
                              router.push({
                                pathname: '/request-a-tool',
                                params: { editTimestamp: String(req.timestamp) },
                              });
                            }}
                          >
                            <Text style={styles.editActionText}>Edit</Text>
                          </Pressable>
                          <Pressable
                            style={styles.deleteAction}
                            onPress={() => {
                              if (req.timestamp == null) return;
                              removeOffersForRequest(req.timestamp);
                              removeRequest(req.timestamp);
                              setRequests(getRequests());
                            }}
                          >
                            <Text style={styles.deleteActionText}>Delete</Text>
                          </Pressable>
                        </View>
                      )}
                    >
                      {card}
                    </Swipeable>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.placeholderTitle}>My tools</Text>
            <Text style={styles.emptyText}>
              Listing tools for others to rent is coming soon. Tap + and choose List My Tool to open
              the placeholder screen.
            </Text>
          </View>
        )}
      </ScrollView>

      <MainTabFab />
      </View>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  screenInner: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#F2F2F7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#E5E5EA',
    borderRadius: 10,
    padding: 3,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleOptionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleOptionPressed: {
    opacity: 0.92,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6D6D72',
  },
  toggleLabelActive: {
    color: '#000',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  section: {
    paddingBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  cardRowWrap: {
    marginBottom: 14,
  },
  requestCardMatched: {
    backgroundColor: '#F4FAF4',
    borderColor: '#C5E0C7',
  },
  requestCardPressed: {
    opacity: ui.pressOpacity,
  },
  offersReceived: {
    fontSize: 12,
    color: '#868686',
    marginTop: 8,
    fontWeight: '500',
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  editAction: {
    backgroundColor: ui.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  editActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAction: {
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

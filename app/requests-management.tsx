import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { getRequestCardUiStatus } from './lib/requestCardStatus';
import { formatUsd, getNumericTotalPrice } from './lib/money';
import { getRequests, isLeaveReviewEligible } from './store/requestsStore';
import { useUserReviews } from './store/userReviewsStore';

import { ui } from '@/constants/appUi';

type Req = ReturnType<typeof getRequests>[number];

export default function RequestsManagementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Req[]>([]);
  const userReviews = useUserReviews();

  useFocusEffect(
    useCallback(() => {
      setList(getRequests());
    }, [])
  );

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Manage Requests</Text>
        <Text style={styles.headerSub}>
          Equipment requests you’ve posted on this device.
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {list.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No requests yet</Text>
            <Text style={styles.emptyBody}>
              Create a request from the Request equipment flow to see it here.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {list.map((req, index) => {
              const title = String(req.toolName ?? '').trim() || 'Untitled';
              const status = getRequestCardUiStatus(req);
              const total = getNumericTotalPrice(req);
              const price =
                req.matched && req.acceptedPrice != null
                  ? formatUsd(req.acceptedPrice)
                  : total != null
                    ? formatUsd(total)
                    : '—';
              const when = req.when != null ? String(req.when) : '—';
              const isLast = index === list.length - 1;
              const ts = req.timestamp;
              const canReview = ts != null && isLeaveReviewEligible(req);
              const reviewed =
                ts != null &&
                userReviews.some((r) => r.requestTimestamp === ts);
              return (
                <View
                  key={String(req.timestamp ?? index)}
                  style={[styles.row, !isLast && styles.rowBorder]}
                >
                  <Pressable
                    style={({ pressed }) => [styles.rowMainHit, pressed && styles.rowPressed]}
                    onPress={() => {
                      if (ts == null) return;
                      router.push({
                        pathname: '/request-details',
                        params: { requestId: String(ts) },
                      });
                    }}
                  >
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {when} · {price}
                    </Text>
                    <View style={styles.statusRow}>
                      <View style={[styles.statusDot, { backgroundColor: status.dotColor }]} />
                      <Text style={styles.statusText}>{status.label}</Text>
                    </View>
                  </Pressable>
                  {canReview ? (
                    reviewed ? (
                      <Text style={styles.reviewedNote}>Review submitted</Text>
                    ) : (
                      <Pressable
                        onPress={() =>
                          router.push(
                            `/leave-review?requestTimestamp=${encodeURIComponent(String(ts))}&type=renter`
                          )
                        }
                        style={({ pressed }) => [
                          styles.leaveReviewBtn,
                          pressed && styles.leaveReviewBtnPressed,
                        ]}
                      >
                        <Text style={styles.leaveReviewBtnText}>Leave Review</Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  backHit: {
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: ui.primary,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.3,
  },
  headerSub: {
    marginTop: 6,
    fontSize: 14,
    color: '#6D6D72',
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: '#6D6D72',
    lineHeight: 21,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowMainHit: {
    alignSelf: 'stretch',
  },
  rowPressed: {
    opacity: 0.92,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  rowMeta: {
    fontSize: 14,
    color: '#6D6D72',
    marginBottom: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555555',
  },
  leaveReviewBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.primary,
  },
  leaveReviewBtnPressed: {
    opacity: 0.85,
  },
  leaveReviewBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.primary,
  },
  reviewedNote: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '500',
    color: '#6D6D72',
  },
});

import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { getRequestCardUiStatus } from '@/lib/requestCardStatus';
import { formatUsd, getNumericTotalPrice } from '@/lib/money';
import { getRequests, isLeaveReviewEligible } from '@/store/requestsStore';
import { useUserReviews } from '@/store/userReviewsStore';

import { outlinePrimaryPressed, ui } from '@/constants/appUi';

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
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <View style={[styles.header, { paddingTop: 8 }]}>
        <ScreenBackButton onPress={() => router.back()} style={styles.backHit} />
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
              const detailsId = getRequestSupabaseRowId(req as Record<string, unknown>);
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
                      if (!detailsId) return;
                      router.push({
                        pathname: '/request-details',
                        params: { requestId: detailsId },
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
                        pressOpacityFeedback={false}
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
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  header: {
    paddingHorizontal: 0,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  backHit: {
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.3,
  },
  headerSub: {
    marginTop: 6,
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 16,
  },
  emptyCard: {
    backgroundColor: ui.background,
    borderRadius: 12,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 21,
  },
  listCard: {
    backgroundColor: ui.background,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
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
    borderBottomColor: ui.border,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  rowMeta: {
    fontSize: 14,
    color: ui.textSecondary,
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
    color: ui.textSecondary,
  },
  leaveReviewBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: ui.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.primary,
  },
  leaveReviewBtnPressed: {
    ...outlinePrimaryPressed,
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
    color: ui.textSecondary,
  },
});

import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import type { UserReview } from '@/store/userReviewsStore';
import { useUserReviews } from '@/store/userReviewsStore';
import { UserActivityDot } from '@/components/UserActivityDot';

type ReviewType = 'renter' | 'rentee';

type ReviewRow = {
  id: string;
  type: ReviewType;
  name: string;
  initials: string;
  avatarColor: string;
  rating: number;
  body: string;
  createdAt: number;
  lastActive: number;
};

function starLineFromRating(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

const AVATAR_PALETTE = ['#5C6BC0', '#00897B', '#E53935', '#8E24AA', '#F9A825', '#3949AB', '#6D4C41'];

function avatarColorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function reviewerLastActive(): number {
  return Date.now();
}

function userReviewToRow(r: UserReview): ReviewRow {
  const name = r.reviewerName.trim() || 'You';
  const first = name.trim().slice(0, 1).toUpperCase();
  const initials = first || '?';
  const body = r.comment.trim() ? r.comment.trim() : '(No comment)';
  return {
    id: `user-${r.id}`,
    type: r.type,
    name,
    initials,
    avatarColor: avatarColorForName(name),
    rating: r.rating,
    body,
    createdAt: r.timestamp,
    lastActive: Date.now() - 7 * 60 * 1000,
  };
}

type FilterKey = 'all' | ReviewType;
type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest';

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'renter', label: 'Renter' },
  { key: 'rentee', label: 'Rentee' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'highest', label: 'Highest Rated' },
  { key: 'lowest', label: 'Lowest Rated' },
];

function applyFilter(list: ReviewRow[], filter: FilterKey): ReviewRow[] {
  if (filter === 'all') return [...list];
  return list.filter((r) => r.type === filter);
}

function applySort(list: ReviewRow[], sort: SortKey): ReviewRow[] {
  const copy = [...list];
  if (sort === 'newest') {
    copy.sort((a, b) => b.createdAt - a.createdAt);
  } else if (sort === 'oldest') {
    copy.sort((a, b) => a.createdAt - b.createdAt);
  } else if (sort === 'highest') {
    copy.sort((a, b) => b.rating - a.rating || b.createdAt - a.createdAt);
  } else {
    copy.sort((a, b) => a.rating - b.rating || b.createdAt - a.createdAt);
  }
  return copy;
}

type PickerKind = 'filter' | 'sort';

export default function ReviewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const storedReviews = useUserReviews();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [pickerKind, setPickerKind] = useState<PickerKind | null>(null);

  const combined = useMemo(
    () =>
      storedReviews.map((r) => ({
        ...userReviewToRow(r),
        lastActive: reviewerLastActive(),
      })),
    [storedReviews]
  );

  const summaryStats = useMemo(() => {
    if (combined.length === 0) {
      return { avg: 0, starLine: '☆☆☆☆☆', count: 0 };
    }
    const sum = combined.reduce((s, r) => s + r.rating, 0);
    const avg = sum / combined.length;
    return {
      avg: Math.round(avg * 10) / 10,
      count: combined.length,
      starLine: starLineFromRating(Math.round(avg)),
    };
  }, [combined]);

  const visibleReviews = useMemo(() => {
    const filtered = applyFilter(combined, filter);
    return applySort(filtered, sort);
  }, [combined, filter, sort]);

  const filterLabel =
    FILTER_OPTIONS.find((o) => o.key === filter)?.label ?? 'All';
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Newest';

  const totalCount = summaryStats.count;
  const visibleCount = visibleReviews.length;

  const pickerOptions =
    pickerKind === 'filter'
      ? FILTER_OPTIONS
      : pickerKind === 'sort'
        ? SORT_OPTIONS
        : [];

  const closePicker = () => setPickerKind(null);

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <View style={[styles.navHeader, { paddingTop: 8 }]}>
        <ScreenBackButton onPress={() => router.back()} style={styles.backHit} />
        <Text style={styles.navTitle}>Reviews</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryRating}>{summaryStats.avg.toFixed(1)}</Text>
          <Text style={styles.summaryStars}>{summaryStats.starLine}</Text>
          <Text style={styles.summaryCaption}>
            Based on {totalCount} review{totalCount === 1 ? '' : 's'}
          </Text>
        </View>

        <View style={styles.selectorRow}>
          <View style={styles.selectorCol}>
            <Text style={styles.selectorLabel}>Filter</Text>
            <Pressable
              onPress={() => setPickerKind('filter')}
              style={({ pressed }) => [
                styles.selectorTrigger,
                pressed && styles.selectorTriggerPressed,
              ]}
            >
              <Text style={styles.selectorValue} numberOfLines={1}>
                {filterLabel}
              </Text>
              <Text style={styles.selectorCaret}>▾</Text>
            </Pressable>
          </View>
          <View style={styles.selectorCol}>
            <Text style={[styles.selectorLabel, styles.selectorLabelRight]}>Sort</Text>
            <Pressable
              onPress={() => setPickerKind('sort')}
              style={({ pressed }) => [
                styles.selectorTrigger,
                pressed && styles.selectorTriggerPressed,
              ]}
            >
              <Text style={styles.selectorValue} numberOfLines={1}>
                {sortLabel}
              </Text>
              <Text style={styles.selectorCaret}>▾</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.listHeading}>
          {visibleCount} review{visibleCount === 1 ? '' : 's'}
          {filter !== 'all' ? ` · ${filter === 'renter' ? 'Renter' : 'Rentee'}` : ''}
        </Text>

        {visibleCount === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No reviews</Text>
            <Text style={styles.emptyBody}>Try another filter.</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {visibleReviews.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.reviewRow,
                  index < visibleReviews.length - 1 && styles.reviewRowBorder,
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
                  <Text style={styles.avatarInitial}>{item.initials}</Text>
                </View>
                <View style={styles.reviewBody}>
                  <View style={styles.nameRow}>
                    <UserActivityDot lastActive={item.lastActive} />
                    <Text style={styles.reviewerName}>{item.name}</Text>
                    <Text style={styles.roleTag}>
                      {item.type === 'renter' ? 'Renter' : 'Rentee'}
                    </Text>
                  </View>
                  <Text style={styles.reviewStars}>{starLineFromRating(item.rating)}</Text>
                  <Text style={styles.reviewText}>{item.body}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={pickerKind != null}
        transparent
        animationType="fade"
        onRequestClose={closePicker}
      >
        <Pressable style={styles.modalBackdrop} onPress={closePicker}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {pickerKind === 'filter' ? 'Filter' : 'Sort'}
            </Text>
            {pickerOptions.map((opt) => {
              const selected =
                pickerKind === 'filter'
                  ? opt.key === filter
                  : opt.key === sort;
              return (
                <Pressable
                  key={String(opt.key)}
                  onPress={() => {
                    if (pickerKind === 'filter') {
                      setFilter(opt.key as FilterKey);
                    } else {
                      setSort(opt.key as SortKey);
                    }
                    closePicker();
                  }}
                  style={({ pressed }) => [
                    styles.modalOption,
                    pressed && styles.modalOptionPressed,
                  ]}
                >
                  <Text
                    style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}
                  >
                    {opt.label}
                  </Text>
                  {selected ? <Text style={styles.modalCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
            <Pressable onPress={closePicker} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  navHeader: {
    paddingHorizontal: 0,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  backHit: {
    marginBottom: 4,
  },
  navTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 16,
  },
  summaryCard: {
    backgroundColor: ui.background,
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    marginBottom: 14,
  },
  summaryRating: {
    fontSize: 52,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -2,
    marginBottom: 4,
  },
  summaryStars: {
    fontSize: 22,
    color: '#F9A825',
    letterSpacing: 2,
    marginBottom: 8,
  },
  summaryCaption: {
    fontSize: 14,
    color: ui.textSecondary,
    fontWeight: '500',
  },
  selectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  selectorCol: {
    flex: 1,
    minWidth: 0,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    marginBottom: 6,
    alignSelf: 'stretch',
  },
  selectorLabelRight: {
    textAlign: 'right',
  },
  selectorTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: ui.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  selectorTriggerPressed: {
    opacity: 0.88,
    backgroundColor: ui.surfaceInput,
  },
  selectorValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    marginRight: 6,
  },
  selectorCaret: {
    fontSize: 12,
    color: ui.textSecondary,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: ui.background,
    borderRadius: 14,
    paddingTop: 16,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    maxHeight: '72%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
  },
  modalOptionPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  modalOptionText: {
    fontSize: 17,
    color: ui.textPrimary,
  },
  modalOptionTextSelected: {
    fontWeight: '600',
    color: ui.primary,
  },
  modalCheck: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
    marginLeft: 12,
  },
  modalCancel: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 17,
    fontWeight: '500',
    color: ui.textSecondary,
  },
  listHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  listCard: {
    backgroundColor: ui.background,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
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
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 15,
    color: ui.textSecondary,
  },
  reviewRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
  },
  reviewRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  reviewBody: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 4,
    marginBottom: 4,
    minWidth: 0,
  },
  reviewerName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  roleTag: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    backgroundColor: ui.surfaceGrouped,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  reviewStars: {
    fontSize: 13,
    color: '#F9A825',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  reviewText: {
    fontSize: 15,
    lineHeight: 22,
    color: ui.textPrimary,
  },
});

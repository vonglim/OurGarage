import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/app/components/KeyboardDismissScreen';
import { ui } from '@/constants/appUi';
import type { UserReview } from '@/app/store/userReviewsStore';
import { useUserReviews } from '@/app/store/userReviewsStore';
import { UserActivityDot } from '@/app/components/UserActivityDot';

type ReviewType = 'renter' | 'rentee';

type MockReview = {
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

const MS_DAY = 24 * 60 * 60 * 1000;
const MOCK_TIME_BASE = 1_735_000_800_000;

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

function mockReviewerLastActive(id: string): number {
  const n = Math.abs(id.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const minsAgo = [8, 180, 20, 400, 12, 90][n % 6];
  return Date.now() - minsAgo * 60 * 1000;
}

function userReviewToMock(r: UserReview): MockReview {
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

type MockReviewSeed = Omit<MockReview, 'lastActive'>;

const MOCK_REVIEWS: MockReviewSeed[] = [
  {
    id: '1',
    type: 'renter',
    name: 'Jordan Lee',
    initials: 'J',
    avatarColor: '#5C6BC0',
    rating: 5,
    body: 'Great experience—tool was exactly as described and pickup was easy.',
    createdAt: MOCK_TIME_BASE - 2 * MS_DAY,
  },
  {
    id: '2',
    type: 'rentee',
    name: 'Sam Rivera',
    initials: 'S',
    avatarColor: '#00897B',
    rating: 4,
    body: 'Solid renter, quick responses. Would rent again.',
    createdAt: MOCK_TIME_BASE - 9 * MS_DAY,
  },
  {
    id: '3',
    type: 'renter',
    name: 'Taylor Kim',
    initials: 'T',
    avatarColor: '#E53935',
    rating: 5,
    body: 'Five stars. Communication was clear and the item worked perfectly for my project.',
    createdAt: MOCK_TIME_BASE - 1 * MS_DAY,
  },
  {
    id: '4',
    type: 'rentee',
    name: 'Riley Chen',
    initials: 'R',
    avatarColor: '#8E24AA',
    rating: 4,
    body: 'Good overall. A small delay on return time but we sorted it out.',
    createdAt: MOCK_TIME_BASE - 14 * MS_DAY,
  },
  {
    id: '5',
    type: 'renter',
    name: 'Casey Morgan',
    initials: 'C',
    avatarColor: '#F9A825',
    rating: 5,
    body: 'Friendly and professional. The garage pickup option saved me a trip.',
    createdAt: MOCK_TIME_BASE - 5 * MS_DAY,
  },
];

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

function applyFilter(list: MockReview[], filter: FilterKey): MockReview[] {
  if (filter === 'all') return [...list];
  return list.filter((r) => r.type === filter);
}

function applySort(list: MockReview[], sort: SortKey): MockReview[] {
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
    () => [
      ...storedReviews.map(userReviewToMock),
      ...MOCK_REVIEWS.map((r) => ({ ...r, lastActive: mockReviewerLastActive(r.id) })),
    ],
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
    <KeyboardDismissScreen style={styles.screen}>
      <View style={[styles.navHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
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
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
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
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  navHeader: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  backHit: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: ui.primary,
  },
  navTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    marginBottom: 14,
  },
  summaryRating: {
    fontSize: 52,
    fontWeight: '800',
    color: '#000',
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
    color: '#6D6D72',
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
    color: '#6D6D72',
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
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  selectorTriggerPressed: {
    opacity: 0.88,
    backgroundColor: '#F9F9F9',
  },
  selectorValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginRight: 6,
  },
  selectorCaret: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingTop: 16,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    maxHeight: '72%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
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
    borderTopColor: '#ECECEC',
  },
  modalOptionPressed: {
    backgroundColor: '#F6F6F7',
  },
  modalOptionText: {
    fontSize: 17,
    color: '#111',
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
    color: '#8E8E93',
  },
  listHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
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
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 15,
    color: '#6D6D72',
  },
  reviewRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
  },
  reviewRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
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
    color: '#FFFFFF',
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
    color: '#000',
  },
  roleTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    backgroundColor: '#F2F2F7',
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
    color: '#3A3A3C',
  },
});

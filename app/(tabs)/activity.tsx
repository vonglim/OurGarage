import { RootScreenHeader } from '@/components/AppHeaders';
import { ActivityOwnerRequestCard } from '@/components/activity/ActivityOwnerRequestCard';
import { ActivityListingOfferCard } from '@/components/activity/ActivityListingOfferCard';
import { ActivityRequestSectionHeader } from '@/components/activity/ActivityRequestSectionHeader';
import { ActivitySegmentedTabs } from '@/components/activity/ActivitySegmentedTabs';
import { CardPressable } from '@/components/CardPressable';
import { MainTabFab, useMainTabFabBottomReserve } from '@/components/MainTabFab';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import {
  cardChrome,
  primarySolidPressed,
  shadowKey,
  shadowSegmentActive,
  shadowSegmentAttention,
  ui,
} from '@/constants/appUi';
import {
  activityRequestInvolvesUser,
  getRequestOwnerId,
  offerCountsForActivityRow,
} from '@/lib/activityScope';
import { isRequestExpired } from '@/lib/requestCardStatus';
import { useAuthUserId } from '@/lib/authUser';
import {
  fetchPendingRentalRequestsForOwner,
  type PendingListingRentalRow,
} from '@/lib/fetchPendingRentalRequestsForOwner';
import {
  fetchUnifiedRentalsForUser,
  unifiedRentalTitle,
  type UnifiedRentalRow,
} from '@/lib/fetchUnifiedRentalsForUser';
import { pickRentalWorkspaceNudgeRow } from '@/lib/rentalWorkspaceNudge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { markAllNonMessageNotificationsAsRead } from '@/lib/markNotificationsRead';
import { buildRequestPricingContextFromRequest } from '@/lib/negotiationTermSnapshot';
import { formatUsd, getNumericOfferPrice } from '@/lib/money';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { getPublicProfileForView } from '@/lib/publicProfiles';
import { formatMilesShort } from '@/lib/requestDistance';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { getSupabase } from '@/lib/supabase';
import {
  activityRentalsIntentPendingSyncRef,
  readAndClearActivityPendingIntent,
} from '@/lib/activityPendingIntent';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { hydrateListingOffersFromSupabase } from '@/lib/hydrateListingOffersFromSupabase';
import { refreshActivityScreenFromSupabase } from '@/lib/supabaseActivityRefresh';
import { updateRentalRequestStatus } from '@/lib/updateRentalRequestStatus';
import { ownerSetListingOfferStatus } from '@/lib/listingOfferLifecycleActions';
import { formatListingPriceWithUnit, useListingsStore } from '@/store/listingsStore';
import { useListingOffersActivityStore } from '@/store/listingOffersActivityStore';
import { useMessageUnreadStore, useUnreadMessagesTotal } from '@/store/messageUnreadStore';
import type { AppNotification } from '@/store/notificationsStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import type { Offer } from '@/store/offersStore';
import { getOffersForRequest, useOffersStore } from '@/store/offersStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  deactivateRequest,
  getEffectiveRentalStatus,
  isOwnerRequestHiddenFromActivity,
  resolveRequestFromRouteId,
  useRequestsStore,
} from '@/store/requestsStore';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  Alert,
  Modal,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { RectButton, ScrollView as GHScrollView, Swipeable } from 'react-native-gesture-handler';

declare const __DEV__: boolean;

function visibleUnreadForUser(n: AppNotification, userId: string): boolean {
  return !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === userId);
}

function formatSectionCount(n: number): string {
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

function rentalsSubTabBadgeCount(n: number): string {
  return n > 99 ? '99+' : String(Math.max(0, n));
}

/** Rentals tab: borrower vs equipment-owner segments (`rentals` table). */
type RentalsSubView = 'renting' | 'listing';

/** Marketplace-style short name (e.g. "Mike R.") for rental counterparty line. */
function formatShortDisplayName(full: string): string {
  const t = full.trim();
  if (!t || t === PROFILE_NAME_FALLBACK || t === '—') return '';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const initial = last[0]?.toUpperCase() ?? '';
  if (!initial) return first;
  return `${first} ${initial}.`;
}

function formatRatingSegment(ratingNumber: number): string | null {
  if (!Number.isFinite(ratingNumber) || ratingNumber <= 0) return null;
  return `★ ${ratingNumber.toFixed(1)}`;
}

/**
 * Human-centered counterparty line: "Mike R. • ★ 4.9", "Owner • ★ 4.9", etc.
 */
function rentalCounterpartyMetaLine(otherUserId: string, role: RentalsSubView): string {
  const pub = getPublicProfileForView(String(otherUserId ?? '').trim());
  const shortName = formatShortDisplayName(pub.name);
  const ratingSeg = formatRatingSegment(pub.ratingNumber);
  const roleLabel = role === 'renting' ? 'Owner' : 'Renter';

  if (shortName && ratingSeg) return `${shortName} • ${ratingSeg}`;
  if (shortName) return shortName;
  if (ratingSeg) return `${roleLabel} • ${ratingSeg}`;
  return role === 'renting' ? 'Owner' : 'Renter';
}

function workspaceNudgeCounterpartyFirstName(row: UnifiedRentalRow, viewerUserId: string): string {
  const me = viewerUserId.trim();
  const otherId =
    row.renter_user_id === me
      ? String(row.owner_user_id ?? '').trim()
      : String(row.renter_user_id ?? '').trim();
  const pub = getPublicProfileForView(otherId);
  const raw = pub.name.trim();
  if (!raw || raw === PROFILE_NAME_FALLBACK || raw === '—') return 'the other party';
  const first = raw.split(/\s+/)[0];
  return first && first.length > 0 ? first : 'the other party';
}

/** Product copy for the compact status pill (no "Status:" prefix). */
function formatRentalStatusPillLabel(raw: string): string {
  const key = raw.trim();
  const map: Record<string, string> = {
    'Awaiting confirmation': 'Awaiting Confirmation',
    'Awaiting response': 'Awaiting Response',
    'Respond to proposal': 'Respond to Proposal',
    Completed: 'Completed',
    'Return scheduled': 'Return Due',
    'Awaiting return': 'Return Due',
    'Rental active': 'Active',
    'Meetup scheduled': 'Meetup Scheduled',
    'Ready for pickup': 'Pickup Pending',
  };
  if (map[key]) return map[key]!;
  if (!key) return '';
  return key
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function byTimestampDesc(
  a: { timestamp?: number | null },
  b: { timestamp?: number | null }
): number {
  return (b.timestamp ?? 0) - (a.timestamp ?? 0);
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

function listingRentalDurationLabel(durationType: string): string {
  switch (durationType) {
    case 'half':
      return 'Half day';
    case 'full':
      return 'Full day';
    case 'week':
      return 'Weekly';
    default:
      return durationType;
  }
}

function pendingListingTitle(row: PendingListingRentalRow): string {
  const t = row.listings?.title;
  const name = typeof t === 'string' ? t.trim() : '';
  return name || row.listing_id;
}

type OutgoingOfferStatus =
  | 'pending'
  | 'countered'
  | 'awaiting_poster'
  | 'proposal_declined'
  | 'accepted'
  | 'declined';

function getOutgoingOfferStatus(o: Offer, req: unknown): OutgoingOfferStatus {
  if (o.status === 'declined' || o.status === 'closed') return 'declined';
  if (o.status === 'accepted') return 'accepted';
  if (o.status === 'pending_confirmation') return 'awaiting_poster';
  if (!req || typeof (req as { timestamp?: number }).timestamp !== 'number') return 'pending';
  const r = req as { matched?: boolean; acceptedOfferId?: string | null };
  if (r.matched === true && typeof r.acceptedOfferId === 'string' && r.acceptedOfferId.trim() !== '') {
    if (r.acceptedOfferId === o.id) return 'accepted';
    return 'declined';
  }
  const st = getEffectiveRentalStatus(req as Parameters<typeof getEffectiveRentalStatus>[0]);
  if (st !== 'pending') return 'declined';
  const hasRenterAccepts = o.messageHistory?.some((h) => h.kind === 'renter_accepts') === true;
  if (hasRenterAccepts && o.lastUpdatedBy === o.renterId) {
    return 'awaiting_poster';
  }
  const ownerId = getRequestOwnerId(req as Record<string, unknown>);
  const ownerTrim = ownerId != null ? String(ownerId).trim() : '';
  const lastTrim = String(o.lastUpdatedBy ?? '').trim();
  const renterTrim = o.renterId.trim();
  if (
    o.status === 'pending' &&
    o.lastNegotiationEventKind === 'proposal_declined' &&
    ownerTrim !== '' &&
    lastTrim === ownerTrim &&
    renterTrim !== lastTrim
  ) {
    return 'proposal_declined';
  }
  if (ownerId != null && o.lastUpdatedBy === ownerId && o.lastUpdatedBy !== o.renterId) {
    return 'countered';
  }
  return 'pending';
}

type ActivityTab = 'requests' | 'offers' | 'rentals';

type RequestsOwnerSubView = 'active' | 'completed';

const ACTIVITY_TABS: ActivityTab[] = ['requests', 'offers', 'rentals'];
const ACTIVITY_LAST_TAB_STORAGE_KEY = 'activity_last_tab_v1';
const ACTIVITY_RENTAL_WORKSPACE_NUDGE_DISMISSED_KEY = 'activity_rental_workspace_nudge_dismissed_v1';

function parseStoredActivityTab(raw: string | null): ActivityTab | null {
  if (raw === 'requests' || raw === 'offers' || raw === 'rentals') return raw;
  return null;
}

const RENTAL_ACTION_BTN_WIDTH = 78;
const RENTAL_ACTIONS_GAP = 6;
const RENTAL_ACTIONS_TOTAL_WIDTH = RENTAL_ACTION_BTN_WIDTH * 2 + RENTAL_ACTIONS_GAP;

function outgoingOfferStatusLabel(s: OutgoingOfferStatus): string {
  switch (s) {
    case 'pending':
      return 'Pending';
    case 'countered':
      return 'Countered';
    case 'awaiting_poster':
      return 'Awaiting owner';
    case 'proposal_declined':
      return 'Proposal declined';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Closed';
    default:
      return s;
  }
}

function rentalStatusVisual(
  row: UnifiedRentalRow,
  role: RentalsSubView,
  viewerUserId: string
): { label: string } {
  const nowMs = Date.now();
  const pickupMs = row.pickup_datetime ? new Date(row.pickup_datetime).getTime() : null;
  const returnMs = row.return_datetime ? new Date(row.return_datetime).getTime() : null;
  const status = String(row.status ?? '')
    .trim()
    .toLowerCase();
  const agreementStatus = String(row.agreement_status ?? '')
    .trim()
    .toLowerCase();
  const allConfirmed = row.owner_confirmed === true && row.renter_confirmed === true;
  const me = viewerUserId.trim();
  const lastProposer = String(row.last_proposed_by ?? '').trim();

  if (status === 'completed' || status === 'returned') {
    return { label: 'Completed' };
  }
  if (status === 'cancelled' || status === 'canceled') {
    return { label: 'Awaiting confirmation' };
  }
  if (agreementStatus === 'pending' || !allConfirmed) {
    if (me && lastProposer && lastProposer === me) {
      return { label: 'Awaiting response' };
    }
    if (me && lastProposer && lastProposer !== me) {
      return { label: 'Respond to proposal' };
    }
    return { label: 'Awaiting confirmation' };
  }
  if (status === 'active') {
    if (returnMs != null) {
      const dayMs = 24 * 60 * 60 * 1000;
      const diff = returnMs - nowMs;
      if (diff > 0 && diff <= dayMs) {
        return { label: 'Return scheduled' };
      }
      if (diff <= 0) {
        return { label: 'Awaiting return' };
      }
    }
    return { label: 'Rental active' };
  }
  if (pickupMs != null) {
    const withinMeetupWindow = Math.abs(pickupMs - nowMs) <= 6 * 60 * 60 * 1000;
    if (withinMeetupWindow || nowMs > pickupMs) {
      return { label: 'Meetup scheduled' };
    }
    return { label: 'Ready for pickup' };
  }

  return {
    label: role === 'listing' ? 'Meetup scheduled' : 'Ready for pickup',
  };
}

export default function ActivityScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [tab, setTab] = useState<ActivityTab>('requests');
  const [activityTabHydrated, setActivityTabHydrated] = useState(false);
  const activityTabPagerRef = useRef<GHScrollView>(null);
  const didApplyInitialPagerOffsetRef = useRef(false);
  const [activityPagerViewportW, setActivityPagerViewportW] = useState(0);
  /** Pager strip width; matches `ScreenWrapper` horizontal inset until layout measures. */
  const activityPageWidth =
    activityPagerViewportW > 0 ? activityPagerViewportW : Math.max(0, windowWidth - 32);
  const [rentalsSubView, setRentalsSubView] = useState<RentalsSubView>('renting');
  const [requestsOwnerSubView, setRequestsOwnerSubView] = useState<RequestsOwnerSubView>('active');
  const [offersWaitingExpanded, setOffersWaitingExpanded] = useState(true);
  const [openRequestsExpanded, setOpenRequestsExpanded] = useState(true);
  const [inProgressExpanded, setInProgressExpanded] = useState(true);
  const me = useAuthUserId();
  const listings = useListingsStore((s) => s.listings);
  const offers = useOffersStore((state) => state.offers);
  const notifications = useNotificationsStore((s) => s.notifications);
  const listingOfferRows = useListingOffersActivityStore((s) => s.rows);
  const unreadCount = useUnreadMessagesTotal();
  const unreadByOfferId = useMessageUnreadStore((s) => s.unreadByOfferId);
  if (__DEV__) {
    console.log('[Activity] render unread messages total', unreadCount);
  }
  const hasUnreadMessages = unreadCount > 0;
  const requests = useRequestsStore((s) => s.requests);
  const [pendingListingRentals, setPendingListingRentals] = useState<PendingListingRentalRow[]>([]);
  const [unifiedRentals, setUnifiedRentals] = useState<UnifiedRentalRow[]>([]);
  const [busyRentalRequestId, setBusyRentalRequestId] = useState<string | null>(null);
  const [dismissedWorkspaceNudgeIds, setDismissedWorkspaceNudgeIds] = useState<Set<string>>(
    () => new Set()
  );
  const [requestDeleteConfirmTs, setRequestDeleteConfirmTs] = useState<number | null>(null);
  const [requestDeleteBusy, setRequestDeleteBusy] = useState(false);
  const [busyListingOfferId, setBusyListingOfferId] = useState<string | null>(null);

  const refreshListingRentalRequests = useCallback(async () => {
    const uid = me.trim();
    if (!uid) {
      setPendingListingRentals([]);
      return;
    }
    const pending = await fetchPendingRentalRequestsForOwner(uid);
    setPendingListingRentals(pending);
  }, [me]);

  const refreshUnifiedRentals = useCallback(async () => {
    const uid = me.trim();
    if (!uid) {
      setUnifiedRentals([]);
      return;
    }
    const rows = await fetchUnifiedRentalsForUser(uid);
    setUnifiedRentals(rows);
  }, [me]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(ACTIVITY_RENTAL_WORKSPACE_NUDGE_DISMISSED_KEY);
        if (cancelled || raw == null || raw === '') return;
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return;
        const ids = parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
        setDismissedWorkspaceNudgeIds(new Set(ids));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistWorkspaceNudgeDismissed = useCallback(async (ids: Set<string>) => {
    try {
      await AsyncStorage.setItem(
        ACTIVITY_RENTAL_WORKSPACE_NUDGE_DISMISSED_KEY,
        JSON.stringify([...ids])
      );
    } catch {
      /* ignore */
    }
  }, []);

  const refreshListingRentalRequestsRef = useRef(refreshListingRentalRequests);
  refreshListingRentalRequestsRef.current = refreshListingRentalRequests;

  const refreshUnifiedRentalsRef = useRef(refreshUnifiedRentals);
  refreshUnifiedRentalsRef.current = refreshUnifiedRentals;

  const hydrateListingOffersRef = useRef(hydrateListingOffersFromSupabase);
  hydrateListingOffersRef.current = hydrateListingOffersFromSupabase;

  useEffect(() => {
    const uid = me.trim();
    if (!uid) return;
    const supabase = getSupabase();
    const channelId =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const channel = supabase.channel(`activity_rental_requests:${uid}:${channelId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rental_requests' },
      () => void refreshListingRentalRequestsRef.current()
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me]);

  useEffect(() => {
    const uid = me.trim();
    if (!uid) return;
    const supabase = getSupabase();
    const channelId =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const channel = supabase.channel(`activity_unified_rentals:${uid}:${channelId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rentals' },
      () => void refreshUnifiedRentalsRef.current()
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me]);

  useEffect(() => {
    const uid = me.trim();
    if (!uid) return;
    const supabase = getSupabase();
    const channelId =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const channel = supabase.channel(`activity_listing_offers:${uid}:${channelId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'offers' },
      () => void hydrateListingOffersRef.current()
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me]);

  const onApproveListingRental = useCallback(
    async (id: string) => {
      setBusyRentalRequestId(id);
      const res = await updateRentalRequestStatus(id, 'approved');
      if (!res.ok) {
        alert(res.error ?? 'Could not approve');
        setBusyRentalRequestId(null);
        return;
      }
      await refreshActivityScreenFromSupabase();
      router.back();
      await refreshListingRentalRequests();
      await refreshUnifiedRentals();
      setBusyRentalRequestId(null);
    },
    [refreshListingRentalRequests, refreshUnifiedRentals]
  );

  const onDeclineListingRental = useCallback(
    async (id: string) => {
      setBusyRentalRequestId(id);
      const res = await updateRentalRequestStatus(id, 'declined');
      if (!res.ok) {
        alert(res.error ?? 'Could not decline');
        setBusyRentalRequestId(null);
        return;
      }
      await refreshListingRentalRequests();
      setBusyRentalRequestId(null);
    },
    [refreshListingRentalRequests]
  );

  const myEquipment = useMemo(
    () =>
      listings.filter(
        (l) => l.ownerUserId != null && l.ownerUserId !== '' && l.ownerUserId === me
      ),
    [listings, me]
  );
  const activityRequests = useMemo(
    () => requests.filter((r) => activityRequestInvolvesUser(r as Record<string, unknown>, me)),
    [requests, me]
  );
  const sortedActivityPool = useMemo(
    () => [...activityRequests].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
    [activityRequests]
  );
  /** Requests tab: only rows you own (not other users' browse listings). */
  const ownedRequestsSorted = useMemo(
    () =>
      sortedActivityPool.filter(
        (r) =>
          getRequestOwnerId(r as Record<string, unknown>) === me &&
          !isOwnerRequestHiddenFromActivity(r)
      ),
    [sortedActivityPool, me]
  );
  const swipeRefs = useRef(new Map<number, Swipeable>());
  const fabBottomReserve = useMainTabFabBottomReserve();
  /** When true, skip restoring last Activity tab from storage (rentals deep-link won the race). */
  const activityRentalsIntentAppliedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ACTIVITY_LAST_TAB_STORAGE_KEY);
        if (cancelled) return;
        if (
          !activityRentalsIntentPendingSyncRef.current &&
          !activityRentalsIntentAppliedRef.current
        ) {
          const parsed = parseStoredActivityTab(raw);
          if (parsed != null) setTab(parsed);
        }
      } finally {
        if (!cancelled) setActivityTabHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!activityTabHydrated || activityPagerViewportW <= 0 || didApplyInitialPagerOffsetRef.current)
      return;
    didApplyInitialPagerOffsetRef.current = true;
    const idx = ACTIVITY_TABS.indexOf(tab);
    if (idx < 0) return;
    activityTabPagerRef.current?.scrollTo({
      x: idx * activityPageWidth,
      animated: false,
    });
  }, [activityTabHydrated, tab, activityPageWidth, activityPagerViewportW]);

  useEffect(() => {
    if (!activityTabHydrated) return;
    void AsyncStorage.setItem(ACTIVITY_LAST_TAB_STORAGE_KEY, tab);
  }, [tab, activityTabHydrated]);

  const goToActivityTab = useCallback(
    (next: ActivityTab) => {
      setTab(next);
      const idx = ACTIVITY_TABS.indexOf(next);
      if (idx < 0) return;
      activityTabPagerRef.current?.scrollTo({
        x: idx * activityPageWidth,
        animated: true,
      });
    },
    [activityPageWidth]
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const intent = await readAndClearActivityPendingIntent();
          if (cancelled || intent?.tab !== 'rentals') return;
          activityRentalsIntentAppliedRef.current = true;
          goToActivityTab('rentals');
          setRentalsSubView(intent.rentalsSub);
        } finally {
          activityRentalsIntentPendingSyncRef.current = false;
        }
      })();
      void refreshActivityScreenFromSupabase();
      markAllNonMessageNotificationsAsRead();
      void refreshListingRentalRequests();
      void refreshUnifiedRentals();
      void hydrateListingsFromSupabase();
      return () => {
        cancelled = true;
        activityRentalsIntentAppliedRef.current = false;
        activityRentalsIntentPendingSyncRef.current = false;
      };
    }, [goToActivityTab, refreshListingRentalRequests, refreshUnifiedRentals])
  );

  /** Close open swipe rows when leaving Activity so rows don’t stay stuck after navigation or refresh. */
  useFocusEffect(
    useCallback(() => {
      return () => {
        swipeRefs.current.forEach((s) => {
          try {
            s.close();
          } catch {
            /* noop */
          }
        });
      };
    }, [])
  );

  const onActivityPagerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const w = activityPageWidth > 0 ? activityPageWidth : 1;
      const idx = Math.round(e.nativeEvent.contentOffset.x / w);
      const next = ACTIVITY_TABS[idx];
      if (next != null) setTab(next);
    },
    [activityPageWidth]
  );

  const onActivityPagerViewportLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setActivityPagerViewportW((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
  }, []);

  const approvedAsRenter = useMemo(
    () => unifiedRentals.filter((r) => r.renter_user_id === me),
    [unifiedRentals, me]
  );

  const approvedAsOwner = useMemo(
    () => unifiedRentals.filter((r) => r.owner_user_id === me),
    [unifiedRentals, me]
  );

  const completedTabRequestsSorted = useMemo(
    () =>
      [...ownedRequestsSorted]
        .filter((r) => {
          const life = getEffectiveRentalStatus(r);
          if (life === 'completed') return true;
          if (life === 'pending' && isRequestExpired(r)) return true;
          return false;
        })
        .sort(byTimestampDesc),
    [ownedRequestsSorted]
  );

  const activeTabRequestsPool = useMemo(
    () =>
      [...ownedRequestsSorted].filter((r) => {
        const life = getEffectiveRentalStatus(r);
        if (life === 'completed') return false;
        if (life === 'pending' && isRequestExpired(r)) return false;
        return true;
      }),
    [ownedRequestsSorted]
  );

  const countOffersForOwnerRequest = useCallback(
    (request: (typeof ownedRequestsSorted)[number]) => {
      const ts = request.timestamp;
      if (ts == null || !Number.isFinite(ts)) return 0;
      return offers.filter(
        (o) =>
          o.requestId === ts &&
          offerCountsForActivityRow(o, request as Record<string, unknown>, me)
      ).length;
    },
    [offers, me]
  );

  const hasUnreadOfferForRequestTs = useCallback(
    (ts: number) =>
      notifications.some(
        (x) =>
          visibleUnreadForUser(x, me) &&
          (x.type === 'new_offer' || x.type === 'counter_offer') &&
          resolveRequestFromRouteId(x.requestId)?.timestamp === ts
      ),
    [notifications, me]
  );

  /** Matched, accepted, rental started, or lifecycle matched/active — not “open” searching. */
  const isRequestInProgressBucket = useCallback((r: (typeof ownedRequestsSorted)[number]) => {
    if (r.matched === true) return true;
    const life = getEffectiveRentalStatus(r);
    return life === 'matched' || life === 'active';
  }, []);

  const compareOffersWaiting = useCallback(
    (a: (typeof ownedRequestsSorted)[number], b: (typeof ownedRequestsSorted)[number]): number => {
      const tsA = a.timestamp;
      const tsB = b.timestamp;
      const ocA = countOffersForOwnerRequest(a);
      const ocB = countOffersForOwnerRequest(b);
      const unreadA =
        tsA != null && Number.isFinite(tsA) && hasUnreadOfferForRequestTs(tsA) && ocA > 0;
      const unreadB =
        tsB != null && Number.isFinite(tsB) && hasUnreadOfferForRequestTs(tsB) && ocB > 0;
      if (unreadA !== unreadB) return unreadA ? -1 : 1;
      return byTimestampDesc(a, b);
    },
    [countOffersForOwnerRequest, hasUnreadOfferForRequestTs]
  );

  const compareInProgress = useCallback(
    (a: (typeof ownedRequestsSorted)[number], b: (typeof ownedRequestsSorted)[number]): number => {
      const la = getEffectiveRentalStatus(a);
      const lb = getEffectiveRentalStatus(b);
      if (la !== lb) {
        if (la === 'active') return -1;
        if (lb === 'active') return 1;
        if (la === 'matched') return -1;
        if (lb === 'matched') return 1;
      }
      return byTimestampDesc(a, b);
    },
    []
  );

  const { offersWaitingSorted, openRequestsSorted, inProgressSorted } = useMemo(() => {
    const inProgress = activeTabRequestsPool.filter((r) => isRequestInProgressBucket(r));
    const notInProgress = activeTabRequestsPool.filter((r) => !isRequestInProgressBucket(r));
    const offersWaiting = notInProgress.filter((r) => countOffersForOwnerRequest(r) > 0);
    const open = notInProgress.filter((r) => countOffersForOwnerRequest(r) === 0);
    offersWaiting.sort(compareOffersWaiting);
    open.sort(byTimestampDesc);
    inProgress.sort(compareInProgress);
    return {
      offersWaitingSorted: offersWaiting,
      openRequestsSorted: open,
      inProgressSorted: inProgress,
    };
  }, [
    activeTabRequestsPool,
    isRequestInProgressBucket,
    countOffersForOwnerRequest,
    compareOffersWaiting,
    compareInProgress,
  ]);

  const offersWaitingOfferBadgeCount = useMemo(() => {
    let n = 0;
    for (const r of offersWaitingSorted) {
      n += countOffersForOwnerRequest(r);
    }
    return n;
  }, [offersWaitingSorted, countOffersForOwnerRequest]);

  const myLenderOffers = useMemo(
    () =>
      offers
        .filter((o) => {
          if (typeof o.renterId !== 'string' || o.renterId !== me) return false;
          if (o.status === 'declined' || o.status === 'closed' || o.status === 'accepted') {
            return false;
          }
          const req = requests.find((r) => r.timestamp === o.requestId);
          const st = getOutgoingOfferStatus(o, req);
          return st !== 'accepted';
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [offers, me, requests]
  );

  const offersSectionBadgeCount = useMemo(() => {
    let n = 0;
    for (const o of myLenderOffers) {
      const req = requests.find((r) => r.timestamp === o.requestId);
      const st = getOutgoingOfferStatus(o, req);
      if (st === 'pending' || st === 'countered') n += 1;
    }
    for (const o of listingOfferRows) {
      if (o.renterUserId !== me) continue;
      if (o.status === 'declined' || o.status === 'closed' || o.status === 'accepted') continue;
      n += 1;
    }
    return n;
  }, [myLenderOffers, requests, offers, listingOfferRows, me]);

  const listingOffersAsOwner = useMemo(
    () =>
      listingOfferRows
        .filter((o) => o.listingOwnerUserId === me)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs),
    [listingOfferRows, me]
  );
  const listingOffersAsRenter = useMemo(
    () =>
      listingOfferRows
        .filter((o) => o.renterUserId === me)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs),
    [listingOfferRows, me]
  );

  const openListingOfferDetail = useCallback(
    (offerId: string) => {
      router.push({ pathname: '/listing-offer-detail', params: { offerId } });
    },
    [router]
  );

  const onAcceptListingOfferOnActivity = useCallback(async (offerId: string) => {
    setBusyListingOfferId(offerId);
    const r = await ownerSetListingOfferStatus(offerId, 'accepted');
    if (!r.ok) showFeedbackToast(r.message ?? 'Could not accept.');
    else showFeedbackToast('Accepted');
    void hydrateListingOffersFromSupabase();
    setBusyListingOfferId(null);
  }, []);

  const onDeclineListingOfferOnActivity = useCallback(async (offerId: string) => {
    setBusyListingOfferId(offerId);
    const r = await ownerSetListingOfferStatus(offerId, 'declined');
    if (!r.ok) showFeedbackToast(r.message ?? 'Could not decline.');
    else showFeedbackToast('Declined');
    void hydrateListingOffersFromSupabase();
    setBusyListingOfferId(null);
  }, []);

  const onCounterListingOfferStub = useCallback(() => {
    showFeedbackToast('Counter offers will be available soon.');
  }, []);

  const rentalsTotalCount = unifiedRentals.length;

  const rentalWorkspaceNudgeRow = useMemo(
    () => pickRentalWorkspaceNudgeRow(unifiedRentals, dismissedWorkspaceNudgeIds),
    [unifiedRentals, dismissedWorkspaceNudgeIds]
  );

  const onDismissRentalWorkspaceNudge = useCallback(() => {
    const id = rentalWorkspaceNudgeRow?.id;
    if (id == null || id === '') return;
    setDismissedWorkspaceNudgeIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      void persistWorkspaceNudgeDismissed(next);
      return next;
    });
  }, [rentalWorkspaceNudgeRow?.id, persistWorkspaceNudgeDismissed]);

  const requestsActivityCount = useMemo(() => {
    let total = 0;
    for (const n of notifications) {
      if (!visibleUnreadForUser(n, me)) continue;
      if (n.type === 'new_offer' || n.type === 'counter_offer') total += 1;
    }
    for (const r of ownedRequestsSorted) {
      const row = r as Record<string, unknown>;
      if (getRequestOwnerId(row) !== me || r.matched) continue;
      if (getEffectiveRentalStatus(r) !== 'pending') continue;
      const ts = r.timestamp;
      if (ts == null || !Number.isFinite(ts)) continue;
      const hasOffer = offers.some(
        (o) => o.requestId === ts && offerCountsForActivityRow(o, row, me)
      );
      if (!hasOffer) continue;
      const hasUnreadOfferNotif = notifications.some(
        (x) =>
          visibleUnreadForUser(x, me) &&
          (x.type === 'new_offer' || x.type === 'counter_offer') &&
          resolveRequestFromRouteId(x.requestId)?.timestamp === ts
      );
      if (!hasUnreadOfferNotif) total += 1;
    }
    return total;
  }, [notifications, ownedRequestsSorted, offers, me]);

  /** Unified `rentals` rows (Activity → Rentals tab). */
  const rentalsActivityCount = unifiedRentals.length;

  const goToChats = useCallback(() => {
    router.push('/(tabs)/chats');
  }, [router]);

  function renderOwnerRequestRow(
    request: (typeof ownedRequestsSorted)[number],
    idx: number,
    cardVariant: 'offers_waiting' | 'open' | 'in_progress' | 'archive'
  ) {
    const matched = !!request.matched;
    const ts = request.timestamp;
    const requestDetailsId = getRequestSupabaseRowId(request as Record<string, unknown>);
    const rowKey =
      (typeof requestDetailsId === 'string' && requestDetailsId.trim() !== ''
        ? requestDetailsId.trim()
        : null) ??
      (ts != null && Number.isFinite(ts) ? `ts-${ts}` : `idx-${idx}`);
    const offerCount = countOffersForOwnerRequest(request);

    const openRequestDetails = () => {
      if (!requestDetailsId) return;

      if (matched) {
        const accId = String((request as { acceptedOfferId?: unknown }).acceptedOfferId ?? '').trim();
        if (accId.length > 0) {
          router.push({
            pathname: '/offer-detail',
            params: { requestId: requestDetailsId, offerId: accId },
          });
          return;
        }
      }

      if (cardVariant === 'offers_waiting' && offerCount > 0 && ts != null && Number.isFinite(ts)) {
        const pricingCtx = buildRequestPricingContextFromRequest(request as Record<string, unknown>);
        const sorted = getOffersForRequest(ts, pricingCtx ?? undefined);
        if (sorted.length > 1) {
          const primary = sorted[0];
          if (primary?.id) {
            router.push({
              pathname: '/offer-detail',
              params: {
                requestId: requestDetailsId,
                offerId: primary.id,
                compare: '1',
              },
            });
            return;
          }
        }
        const primary = sorted[0];
        if (primary?.id) {
          router.push({
            pathname: '/offer-detail',
            params: { requestId: requestDetailsId, offerId: primary.id },
          });
          return;
        }
      }

      router.push({
        pathname: '/request-details',
        params: { requestId: requestDetailsId },
      });
    };

    const timeAgoText = request.timestamp != null ? getTimeAgo(request.timestamp) : null;

    const card = (
      <ActivityOwnerRequestCard
        req={request}
        matched={matched}
        timeAgoText={timeAgoText}
        variant={cardVariant}
        offerCount={offerCount}
        onPress={openRequestDetails}
        disabled={!requestDetailsId}
      />
    );

    const cardForSwipe = (
      <ActivityOwnerRequestCard
        req={request}
        matched={matched}
        timeAgoText={timeAgoText}
        variant={cardVariant}
        offerCount={offerCount}
        onPress={openRequestDetails}
        disabled={!requestDetailsId}
        nestedInSwipeable
      />
    );

    if (matched) {
      return (
        <View key={rowKey} style={styles.cardRowWrap}>
          {card}
        </View>
      );
    }

    const isOwner = getRequestOwnerId(request as Record<string, unknown>) === me;
    if (!isOwner) {
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
            if (ts == null) return;
            if (el) swipeRefs.current.set(ts, el);
            else swipeRefs.current.delete(ts);
          }}
          overshootRight={false}
          friction={2}
          enableTrackpadTwoFingerGesture={false}
          renderRightActions={() => (
            <View style={styles.rightActionsRow}>
              <RectButton
                style={styles.editAction}
                onPress={() => {
                  if (ts == null) return;
                  swipeRefs.current.get(ts)?.close();
                  router.push({
                    pathname: '/request',
                    params: { editTimestamp: String(ts) },
                  });
                }}
              >
                <Text style={styles.editActionText}>Edit</Text>
              </RectButton>
              <RectButton
                style={styles.deleteAction}
                onPress={() => {
                  if (ts == null) return;
                  swipeRefs.current.get(ts)?.close();
                  setRequestDeleteConfirmTs(ts);
                }}
              >
                <Text style={styles.deleteActionText}>Delete</Text>
              </RectButton>
            </View>
          )}
        >
          <RectButton
            enabled={!!requestDetailsId}
            style={styles.ownerRequestSwipeHit}
            onPress={openRequestDetails}
          >
            {cardForSwipe}
          </RectButton>
        </Swipeable>
      </View>
    );
  }

  function statusPillStyle(s: OutgoingOfferStatus) {
    switch (s) {
      case 'accepted':
        return { bg: '#E8F5E9', fg: '#1B5E20' };
      case 'countered':
        return { bg: '#FFF8E1', fg: '#F57F17' };
      case 'proposal_declined':
        return { bg: '#FFFBEB', fg: '#B45309' };
      case 'awaiting_poster':
        return { bg: '#E3F2FD', fg: '#1565C0' };
      case 'declined':
        return { bg: '#FCE8E6', fg: '#B71C1C' };
      default:
        return { bg: ui.surfaceNeutral, fg: ui.textSecondary };
    }
  }

  function renderMyOfferRow(o: Offer) {
    const req = requests.find((r) => r.timestamp === o.requestId);
    const rowId = req ? getRequestSupabaseRowId(req as Record<string, unknown>) : null;
    const requestIdForOffer =
      typeof rowId === 'string' && rowId.trim().length > 0 ? rowId.trim() : String(o.requestId);
    const title = String((req as { toolName?: string } | undefined)?.toolName ?? '').trim() || 'Equipment request';
    const st = getOutgoingOfferStatus(o, req);
    const pill = statusPillStyle(st);
    const price = getNumericOfferPrice(o);
    return (
      <CardPressable
        key={o.id}
        onPress={() =>
          router.push({
            pathname: '/offer-detail',
            params: {
              requestId: requestIdForOffer,
              offerId: o.id,
              view: 'full',
            },
          })
        }
        style={({ pressed }) => [styles.offerRowCard, pressed && styles.offerRowCardPressed]}
      >
        <View style={styles.offerRowTop}>
          <Text style={styles.offerRowTitle} numberOfLines={2}>
            {title}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
            <Text style={[styles.statusPillText, { color: pill.fg }]}>{outgoingOfferStatusLabel(st)}</Text>
          </View>
        </View>
        <Text style={styles.offerRowMeta}>
          Your offer {formatUsd(price)} · {getTimeAgo(o.updatedAt)}
        </Text>
      </CardPressable>
    );
  }

  function renderRentalOperationalRow(row: UnifiedRentalRow, role: RentalsSubView) {
    const title = unifiedRentalTitle(row);
    const messageUnread =
      typeof row.offer_id === 'string' && row.offer_id.trim() !== ''
        ? (unreadByOfferId[row.offer_id.trim()] ?? 0)
        : 0;
    const status = rentalStatusVisual(row, role, me);
    const otherUserId = role === 'renting' ? row.owner_user_id : row.renter_user_id;
    const counterpartyLine = rentalCounterpartyMetaLine(otherUserId, role);

    return (
      <View key={row.id} style={styles.rentalRowCard}>
        <View style={styles.rentalRowMain}>
          <View style={styles.rentalRowTop}>
            <View style={styles.rentalRowTitleWrap}>
              <Text style={styles.rentalRowTitle} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <View style={styles.rentalStatusRow}>
              <View style={styles.rentalStatusChip}>
                <Text
                  style={styles.rentalStatusChipText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {formatRentalStatusPillLabel(status.label)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.rentalRowBottom}>
            <Text style={styles.rentalCounterparty} numberOfLines={1}>
              {counterpartyLine}
            </Text>
            <View style={styles.rentalRowActions}>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={() => {
                  if (!row.id) {
                    console.warn('Missing rental id');
                    return;
                  }
                  router.push({
                    pathname: '/chat/[id]',
                    params: { id: row.id },
                  });
                }}
                style={({ pressed }) => [styles.rentalIconBtn, pressed && styles.rentalIconBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Chat"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={ui.primary} />
                <Text style={styles.rentalActionLabelInline}>Chat</Text>
                {messageUnread > 0 ? (
                  <View style={styles.rentalIconBadge}>
                    <Text style={styles.rentalIconBadgeText}>{formatSectionCount(messageUnread)}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={() => {
                  router.push({
                    pathname: '/rental/[id]',
                    params: { id: row.id },
                  });
                }}
                style={({ pressed }) => [styles.rentalIconBtn, pressed && styles.rentalIconBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Details"
              >
                <Ionicons name="document-text-outline" size={16} color={ui.primary} />
                <Text style={styles.rentalActionLabelInline}>Details</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <View style={styles.screen}>
        <ScreenEntrance style={styles.screenInner}>
          <View style={styles.activityScreenStack}>
            <View style={styles.header}>
              <RootScreenHeader
                title="Activity"
                rightAccessory={
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={goToChats}
                    style={({ pressed }) => [styles.messagesPill, pressed && styles.messagesPillPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={hasUnreadMessages ? `Messages, ${unreadCount} unread` : 'Messages'}
                  >
                    <Text style={styles.messagesPillLabel}>Messages</Text>
                    {hasUnreadMessages ? (
                      <View style={styles.messagesPillBadge}>
                        <Text style={styles.messagesPillBadgeText}>{formatSectionCount(unreadCount)}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                }
              />

              {rentalWorkspaceNudgeRow ? (
                <View style={styles.workspaceNudgeOuter}>
                  <View style={styles.workspaceNudgeCard}>
                    <View style={styles.workspaceNudgeTopRow}>
                      <Text style={styles.workspaceNudgeEyebrow}>Action needed</Text>
                      <Pressable
                        pressOpacityFeedback={false}
                        haptic
                        onPress={onDismissRentalWorkspaceNudge}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss rental workspace reminder"
                        style={({ pressed }) => [styles.workspaceNudgeDismissBtn, pressed && { opacity: 0.75 }]}
                      >
                        <Ionicons name="close" size={22} color={ui.textSecondary} />
                      </Pressable>
                    </View>
                    <Text style={styles.workspaceNudgeTitle}>Rental agreement ready</Text>
                    <Text style={styles.workspaceNudgeBody}>
                      {`Coordinate pickup location and times with ${workspaceNudgeCounterpartyFirstName(
                        rentalWorkspaceNudgeRow,
                        me
                      )}.`}
                    </Text>
                    <Pressable
                      pressOpacityFeedback={false}
                      haptic
                      onPress={() => {
                        router.push({
                          pathname: '/rental/[id]',
                          params: { id: rentalWorkspaceNudgeRow.id },
                        });
                      }}
                      style={({ pressed }) => [
                        styles.workspaceNudgeCta,
                        pressed && primarySolidPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Open rental workspace"
                    >
                      <Text style={styles.workspaceNudgeCtaLabel}>Open Rental Workspace</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={styles.tabRow}>
                <Pressable
                  onPress={() => goToActivityTab('requests')}
                  style={({ pressed }) => [
                    styles.tabCell,
                    tab === 'requests' ? styles.tabCellActive : styles.tabCellInactive,
                    tab !== 'requests' && requestsActivityCount > 0 && styles.tabCellMutedAttention,
                    pressed && styles.tabPressed,
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === 'requests' }}
                  accessibilityLabel={`Requests, ${requestsActivityCount} updates`}
                >
                  <Text style={[styles.tabLabel, tab === 'requests' && styles.tabLabelActive]}>Requests</Text>
                  {requestsActivityCount > 0 ? (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{formatSectionCount(requestsActivityCount)}</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => goToActivityTab('offers')}
                  style={({ pressed }) => [
                    styles.tabCell,
                    tab === 'offers' ? styles.tabCellActive : styles.tabCellInactive,
                    tab !== 'offers' && offersSectionBadgeCount > 0 && styles.tabCellMutedAttention,
                    pressed && styles.tabPressed,
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === 'offers' }}
                  accessibilityLabel={`Offers, ${offersSectionBadgeCount} need attention`}
                >
                  <Text style={[styles.tabLabel, tab === 'offers' && styles.tabLabelActive]}>Offers</Text>
                  {offersSectionBadgeCount > 0 ? (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{formatSectionCount(offersSectionBadgeCount)}</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => goToActivityTab('rentals')}
                  style={({ pressed }) => [
                    styles.tabCell,
                    tab === 'rentals' ? styles.tabCellActive : styles.tabCellInactive,
                    tab !== 'rentals' && rentalsActivityCount > 0 && styles.tabCellMutedAttention,
                    pressed && styles.tabPressed,
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === 'rentals' }}
                  accessibilityLabel={`Rentals, ${rentalsTotalCount} items`}
                >
                  <Text style={[styles.tabLabel, tab === 'rentals' && styles.tabLabelActive]}>Rentals</Text>
                  {rentalsTotalCount > 0 ? (
                    <View style={tab === 'rentals' ? styles.tabBadge : styles.tabBadgeMuted}>
                      <Text style={tab === 'rentals' ? styles.tabBadgeText : styles.tabBadgeMutedText}>
                        {formatSectionCount(rentalsTotalCount)}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>
            </View>

            <View style={styles.tabPagerViewport} onLayout={onActivityPagerViewportLayout}>
              <GHScrollView
                ref={activityTabPagerRef}
                horizontal
                pagingEnabled
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onActivityPagerScrollEnd}
                style={styles.tabPager}
                bounces={false}
              >
                <View style={{ width: activityPageWidth }}>
                  <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={[
                      styles.tabPanelScrollContent,
                      { paddingBottom: fabBottomReserve },
                    ]}
                    stickyHeaderIndices={[1]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces
                    nestedScrollEnabled
                  >
                    <View style={styles.requestsScrollPreamble}>
                      <Text style={styles.tabPanelSubline}>
                        See which requests need a response, which are still open, and your archive.
                      </Text>
                      {pendingListingRentals.length > 0 ? (
                        <>
                          <Text style={styles.activePastHeading}>Pending listing rentals</Text>
                          <Text style={styles.pendingListingSubtext}>
                            Someone requested to rent your equipment · approve or decline
                          </Text>
                          {pendingListingRentals.map((row) => {
                            const title = pendingListingTitle(row);
                            const priceNum = Number(row.price);
                            const priceLabel = Number.isFinite(priceNum) ? formatUsd(priceNum) : '—';
                            const duration = listingRentalDurationLabel(row.duration_type);
                            const busy = busyRentalRequestId === row.id;
                            return (
                              <View key={row.id} style={styles.pendingListingRentalCard}>
                                <Text style={styles.matchedRentalTitle} numberOfLines={2}>
                                  {title}
                                </Text>
                                <Text style={styles.matchedRentalHint}>{priceLabel}</Text>
                                <Text style={styles.matchedRentalHint}>{duration}</Text>
                                <View style={styles.pendingRentalBtnRow}>
                                  <Pressable
                                    disabled={busy}
                                    pressOpacityFeedback={false}
                                    haptic
                                    style={({ pressed }) => [
                                      styles.pendingRentalBtn,
                                      styles.pendingRentalBtnApprove,
                                      busy && styles.pendingRentalBtnDisabled,
                                      pressed && !busy && styles.pendingRentalBtnApprovePressed,
                                    ]}
                                    onPress={() => void onApproveListingRental(row.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Approve rental request for ${title}`}
                                  >
                                    <Text style={styles.pendingRentalBtnApproveText}>Approve</Text>
                                  </Pressable>
                                  <Pressable
                                    disabled={busy}
                                    pressOpacityFeedback={false}
                                    haptic
                                    style={({ pressed }) => [
                                      styles.pendingRentalBtn,
                                      styles.pendingRentalBtnDecline,
                                      busy && styles.pendingRentalBtnDisabled,
                                      pressed && !busy && styles.pendingRentalBtnDeclinePressed,
                                    ]}
                                    onPress={() => void onDeclineListingRental(row.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Decline rental request for ${title}`}
                                  >
                                    <Text style={styles.pendingRentalBtnDeclineText}>Decline</Text>
                                  </Pressable>
                                </View>
                              </View>
                            );
                          })}
                          <View style={[styles.sectionRule, styles.sectionRuleTight]} />
                        </>
                      ) : null}
                      {ownedRequestsSorted.length === 0 && pendingListingRentals.length === 0 ? (
                        <Text style={[styles.emptyText, { marginBottom: 12 }]}>
                          No requests yet. Tap + to request equipment.
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.requestsStickyTabsHost}>
                      <ActivitySegmentedTabs
                        tabs={[
                          {
                            key: 'active',
                            label: 'Active',
                            badgeCount: activeTabRequestsPool.length,
                            accessibilityLabel: `Active requests, ${activeTabRequestsPool.length} items`,
                          },
                          {
                            key: 'completed',
                            label: 'Completed',
                            badgeCount: completedTabRequestsSorted.length,
                            accessibilityLabel: `Completed archive, ${completedTabRequestsSorted.length} items`,
                          },
                        ]}
                        value={requestsOwnerSubView}
                        onChange={setRequestsOwnerSubView}
                      />
                    </View>
                    <View
                      style={[
                        styles.tabPanel,
                        requestsActivityCount > 0 && styles.tabPanelAttention,
                      ]}
                    >
              {requestsOwnerSubView === 'active' ? (
                <>
                  {activeTabRequestsPool.length === 0 && pendingListingRentals.length === 0 ? (
                    <Text style={styles.emptyText}>
                      No active requests. Post a request with + New Request.
                    </Text>
                  ) : activeTabRequestsPool.length === 0 ? null : (
                    <>
                      <View style={styles.ownerRequestSectionShell}>
                        <ActivityRequestSectionHeader
                          iconName="flash"
                          iconBg="rgba(254, 242, 242, 0.9)"
                          iconColor="#C2410C"
                          title="OFFERS WAITING"
                          count={offersWaitingOfferBadgeCount}
                          description="Requests with offers awaiting your response"
                          expanded={offersWaitingExpanded}
                          onToggleExpand={() => setOffersWaitingExpanded((v) => !v)}
                          countTone="danger"
                        />
                        {offersWaitingExpanded
                          ? offersWaitingSorted.map((request, idx) =>
                              renderOwnerRequestRow(request, idx, 'offers_waiting')
                            )
                          : null}
                      </View>
                      <View style={[styles.ownerRequestSectionShell, styles.ownerRequestSectionShellSpaced]}>
                        <ActivityRequestSectionHeader
                          iconName="time-outline"
                          iconBg="rgba(239, 246, 255, 0.95)"
                          iconColor="#2563EB"
                          title="OPEN REQUESTS"
                          count={openRequestsSorted.length}
                          description="No offers yet — still searching for lenders"
                          expanded={openRequestsExpanded}
                          onToggleExpand={() => setOpenRequestsExpanded((v) => !v)}
                          countTone="sky"
                        />
                        {openRequestsExpanded
                          ? openRequestsSorted.map((request, idx) =>
                              renderOwnerRequestRow(
                                request,
                                idx + offersWaitingSorted.length,
                                'open'
                              )
                            )
                          : null}
                      </View>
                      <View style={[styles.ownerRequestSectionShell, styles.ownerRequestSectionShellSpaced]}>
                        <ActivityRequestSectionHeader
                          iconName="checkmark-circle-outline"
                          iconBg="rgba(236, 253, 245, 0.95)"
                          iconColor="#15803D"
                          title="IN PROGRESS"
                          count={inProgressSorted.length}
                          description="Match accepted or rental underway"
                          expanded={inProgressExpanded}
                          onToggleExpand={() => setInProgressExpanded((v) => !v)}
                          countTone="success"
                        />
                        {inProgressExpanded
                          ? inProgressSorted.map((request, idx) =>
                              renderOwnerRequestRow(
                                request,
                                idx + offersWaitingSorted.length + openRequestsSorted.length,
                                'in_progress'
                              )
                            )
                          : null}
                      </View>
                    </>
                  )}
                </>
              ) : (
                <>
                  {completedTabRequestsSorted.length === 0 ? (
                    <Text style={styles.emptyText}>
                      No completed, expired, or archived requests yet.
                    </Text>
                  ) : (
                    completedTabRequestsSorted.map((request, idx) =>
                      renderOwnerRequestRow(request, idx, 'archive')
                    )
                  )}
                </>
              )}
              <View style={[styles.sectionRule, styles.sectionRuleTight]} />
              <Text style={styles.activePastHeading}>YOUR EQUIPMENT</Text>
              {myEquipment.length === 0 ? (
                <Text style={styles.emptyText}>
                  No equipment listed yet. Tap + and choose List equipment to create a listing.
                </Text>
              ) : (
                myEquipment.map((item) => (
                  <CardPressable
                    key={item.id}
                    onPress={() =>
                      router.push({
                        pathname: '/listing-detail',
                        params: { listingId: item.id },
                      })
                    }
                    style={({ pressed }) => [styles.listingCard, pressed && styles.listingCardPressed]}
                  >
                    <Text style={styles.listingTitle} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.listingMeta} numberOfLines={1}>
                      {formatListingPriceWithUnit(item.price, item.priceUnit)}
                    </Text>
                    <Text style={styles.listingDistance} numberOfLines={1}>
                      {formatMilesShort(item.distance)}
                    </Text>
                    {item.description?.trim() ? (
                      <Text style={styles.listingDesc} numberOfLines={1} ellipsizeMode="tail">
                        {item.description.trim()}
                      </Text>
                    ) : null}
                  </CardPressable>
                ))
              )}
                    </View>
                  </ScrollView>
                </View>

                <View style={{ width: activityPageWidth }}>
                  <GHScrollView
                    style={styles.scroll}
                    contentContainerStyle={[
                      styles.tabPanelScrollContent,
                      { paddingBottom: fabBottomReserve },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces
                    nestedScrollEnabled
                  >
                    <View
                      style={[
                        styles.tabPanel,
                        offersSectionBadgeCount > 0 && styles.tabPanelAttention,
                      ]}
                    >
              <Text style={styles.tabPanelSubline}>
                Bids you placed · status reflects the poster’s response
              </Text>
              {myLenderOffers.length === 0 ? (
                <Text style={styles.emptyText}>No offers yet. Browse requests and tap Make offer.</Text>
              ) : (
                myLenderOffers.map((o) => renderMyOfferRow(o))
              )}
              <View style={[styles.sectionRule, styles.sectionRuleTight]} />
              <Text style={styles.activePastHeading}>YOUR LISTING OFFERS</Text>
              <Text style={styles.tabPanelSubline}>Offers renters sent on your listings.</Text>
              {listingOffersAsOwner.length === 0 ? (
                <Text style={styles.emptyText}>No listing offers yet.</Text>
              ) : (
                listingOffersAsOwner.map((row) => (
                  <ActivityListingOfferCard
                    key={row.id}
                    row={row}
                    role="owner"
                    timeAgo={getTimeAgo(row.updatedAtMs)}
                    onPress={() => openListingOfferDetail(row.id)}
                    onAccept={() => void onAcceptListingOfferOnActivity(row.id)}
                    onDecline={() => void onDeclineListingOfferOnActivity(row.id)}
                    onCounter={onCounterListingOfferStub}
                    busy={busyListingOfferId === row.id}
                  />
                ))
              )}
              <View style={[styles.sectionRule, styles.sectionRuleTight]} />
              <Text style={styles.activePastHeading}>LISTINGS YOU BID ON</Text>
              <Text style={styles.tabPanelSubline}>Your offers on browse listings.</Text>
              {listingOffersAsRenter.length === 0 ? (
                <Text style={styles.emptyText}>No listing offers yet.</Text>
              ) : (
                listingOffersAsRenter.map((row) => (
                  <ActivityListingOfferCard
                    key={row.id}
                    row={row}
                    role="renter"
                    timeAgo={getTimeAgo(row.updatedAtMs)}
                    onPress={() => openListingOfferDetail(row.id)}
                  />
                ))
              )}
                    </View>
                  </GHScrollView>
                </View>

                <View style={{ width: activityPageWidth }}>
                  <GHScrollView
                    style={styles.scroll}
                    contentContainerStyle={[
                      styles.tabPanelScrollContent,
                      { paddingBottom: fabBottomReserve },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces
                    nestedScrollEnabled
                  >
                    <View
                      style={[
                        styles.tabPanel,
                        rentalsActivityCount > 0 && styles.tabPanelAttention,
                      ]}
                    >
              <Text style={styles.tabPanelSubline}>
                Active agreements from requests and listings (your unified rentals)
              </Text>
              {unifiedRentals.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <Text style={styles.emptyTitle}>No rentals yet</Text>
                  <Text style={styles.emptySubline}>
                    When an agreement is finalized, it appears here under RENTING or Renting
                    out.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.rentalsSubTabRow}>
                    <Pressable
                      onPress={() => setRentalsSubView('renting')}
                      style={({ pressed }) => [
                        styles.rentalsSubTabCell,
                        rentalsSubView === 'renting'
                          ? styles.tabCellActive
                          : styles.tabCellInactive,
                        pressed && styles.tabPressed,
                      ]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: rentalsSubView === 'renting' }}
                      accessibilityLabel={`RENTING, ${approvedAsRenter.length} rentals`}
                    >
                      <Text
                        style={[
                          styles.rentalsSubTabLabel,
                          rentalsSubView === 'renting' && styles.tabLabelActive,
                        ]}
                        numberOfLines={2}
                      >
                        RENTING
                      </Text>
                      <View style={rentalsSubView === 'renting' ? styles.tabBadge : styles.tabBadgeMuted}>
                        <Text
                          style={
                            rentalsSubView === 'renting'
                              ? styles.tabBadgeText
                              : styles.tabBadgeMutedText
                          }
                        >
                          {rentalsSubTabBadgeCount(approvedAsRenter.length)}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => setRentalsSubView('listing')}
                      style={({ pressed }) => [
                        styles.rentalsSubTabCell,
                        rentalsSubView === 'listing'
                          ? styles.tabCellActive
                          : styles.tabCellInactive,
                        pressed && styles.tabPressed,
                      ]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: rentalsSubView === 'listing' }}
                      accessibilityLabel={`EQUIPMENT OWNER, ${approvedAsOwner.length} matches`}
                    >
                      <Text
                        style={[
                          styles.rentalsSubTabLabel,
                          rentalsSubView === 'listing' && styles.tabLabelActive,
                        ]}
                        numberOfLines={2}
                      >
                        EQUIPMENT OWNER
                      </Text>
                      <View style={rentalsSubView === 'listing' ? styles.tabBadge : styles.tabBadgeMuted}>
                        <Text
                          style={
                            rentalsSubView === 'listing'
                              ? styles.tabBadgeText
                              : styles.tabBadgeMutedText
                          }
                        >
                          {rentalsSubTabBadgeCount(approvedAsOwner.length)}
                        </Text>
                      </View>
                    </Pressable>
                  </View>

                  {rentalsSubView === 'renting' ? (
                    approvedAsRenter.length === 0 ? (
                      <View style={styles.emptyBlock}>
                        <Text style={styles.emptyTitle}>Nothing here yet</Text>
                        <Text style={styles.emptySubline}>
                          {
                            "Rentals where you're the borrower appear here (requests or listings)."
                          }
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.activePastHeading}>RENTING</Text>
                        {approvedAsRenter.map((row) => renderRentalOperationalRow(row, 'renting'))}
                      </>
                    )
                  ) : approvedAsOwner.length === 0 ? (
                    <View style={styles.emptyBlock}>
                      <Text style={styles.emptyTitle}>Nothing here yet</Text>
                      <Text style={styles.emptySubline}>
                        {"Rentals where you're lending equipment appear here."}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.activePastHeading}>EQUIPMENT OWNER</Text>
                      {approvedAsOwner.map((row) => renderRentalOperationalRow(row, 'listing'))}
                    </>
                  )}
                </>
              )}
                    </View>
                  </GHScrollView>
                </View>
              </GHScrollView>
            </View>
          </View>

          <MainTabFab />
        </ScreenEntrance>
      </View>

      <Modal
        visible={requestDeleteConfirmTs != null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!requestDeleteBusy) setRequestDeleteConfirmTs(null);
        }}
      >
        <View style={styles.requestDeleteModalBackdrop}>
          <RNPressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!requestDeleteBusy) setRequestDeleteConfirmTs(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.requestDeleteModalCard}>
            <Text style={styles.requestDeleteModalTitle}>Delete request?</Text>
            <Text style={styles.requestDeleteModalBody}>
              This will remove your request from Browse and Activity.
            </Text>
            <View style={styles.requestDeleteModalActions}>
              <Pressable
                pressOpacityFeedback={false}
                disabled={requestDeleteBusy}
                onPress={() => {
                  if (!requestDeleteBusy) setRequestDeleteConfirmTs(null);
                }}
                style={({ pressed }) => [
                  styles.requestDeleteModalBtnCancel,
                  pressed && !requestDeleteBusy && styles.requestDeleteModalBtnPressed,
                  requestDeleteBusy && styles.requestDeleteModalBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.requestDeleteModalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                disabled={requestDeleteBusy}
                onPress={() => {
                  void (async () => {
                    const ts = requestDeleteConfirmTs;
                    if (ts == null || requestDeleteBusy) return;
                    setRequestDeleteBusy(true);
                    try {
                      const ok = await deactivateRequest(ts);
                      setRequestDeleteConfirmTs(null);
                      if (ok) showFeedbackToast('Request deleted');
                      else
                        Alert.alert('Could not delete', 'Check your connection and try again.');
                    } finally {
                      setRequestDeleteBusy(false);
                    }
                  })();
                }}
                style={({ pressed }) => [
                  styles.requestDeleteModalBtnDestructive,
                  pressed && !requestDeleteBusy && styles.requestDeleteModalBtnDestructivePressed,
                  requestDeleteBusy && styles.requestDeleteModalBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Delete request"
              >
                <Text style={styles.requestDeleteModalBtnDestructiveText}>Delete Request</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  screenInner: {
    flex: 1,
  },
  activityScreenStack: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    paddingHorizontal: 0,
    alignItems: 'flex-start',
    paddingTop: ui.spaceMd,
    paddingBottom: 12,
    backgroundColor: ui.surfaceGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    zIndex: 2,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.3,
    flex: 1,
    minWidth: 0,
  },
  messagesPill: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#0B1F3A',
  },
  messagesPillPressed: {
    opacity: 0.9,
  },
  messagesPillLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  messagesPillBadge: {
    position: 'absolute',
    top: -3,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#D7263D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  messagesPillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  workspaceNudgeOuter: {
    paddingHorizontal: ui.padScreenH,
    marginBottom: 10,
  },
  workspaceNudgeCard: {
    ...cardChrome,
    paddingVertical: 14,
    paddingHorizontal: ui.padCard,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: 2,
    borderColor: ui.primary,
    ...shadowSegmentAttention,
  },
  workspaceNudgeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  workspaceNudgeEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  workspaceNudgeDismissBtn: {
    marginRight: -4,
    padding: 4,
  },
  workspaceNudgeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  workspaceNudgeBody: {
    fontSize: 14,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  workspaceNudgeCta: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    ...shadowKey,
  },
  workspaceNudgeCtaLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: ui.spaceMd,
  },
  rentalsSubTabRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 12,
  },
  rentalsSubTabCell: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    minHeight: 48,
  },
  rentalsSubTabLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  tabCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    minHeight: 44,
  },
  tabCellInactive: {
    backgroundColor: ui.surfaceNeutral,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  tabCellActive: {
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: 2,
    borderColor: ui.primary,
    ...shadowSegmentActive,
  },
  tabCellMutedAttention: {
    borderColor: 'rgba(11, 31, 58, 0.14)',
    ...shadowSegmentAttention,
  },
  tabPressed: {
    opacity: 0.92,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: ui.primary,
  },
  tabBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  tabBadgeMuted: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: ui.surfaceGrouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignItems: 'center',
  },
  tabBadgeMutedText: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.textSecondary,
  },
  tabPanel: {
    ...cardChrome,
    padding: ui.padCard + 2,
  },
  tabPanelAttention: {
    borderColor: 'rgba(11, 31, 58, 0.12)',
    ...shadowSegmentAttention,
  },
  tabPanelSubline: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: ui.spaceMd,
  },
  offerRowCard: {
    ...cardChrome,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: ui.padCard,
  },
  offerRowCardPressed: {
    backgroundColor: ui.surfaceTintPrimary,
  },
  offerRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  offerRowTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  offerRowMeta: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  subSectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionRuleTight: {
    marginVertical: ui.spaceMd,
  },
  matchedRentalCard: {
    ...cardChrome,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: ui.padCard,
  },
  matchedRentalCardPressed: {
    backgroundColor: ui.surfaceTintPrimary,
  },
  matchedRentalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  matchedRentalHint: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
  },
  pendingListingSubtext: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -4,
  },
  pendingListingRentalCard: {
    ...cardChrome,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: ui.padCard,
  },
  pendingRentalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  pendingRentalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingRentalBtnApprove: {
    backgroundColor: ui.primary,
  },
  pendingRentalBtnApprovePressed: {
    backgroundColor: ui.primaryPressed,
  },
  pendingRentalBtnApproveText: {
    color: ui.primaryOn,
    fontSize: 15,
    fontWeight: '700',
  },
  pendingRentalBtnDecline: {
    backgroundColor: ui.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.danger,
  },
  pendingRentalBtnDeclinePressed: {
    backgroundColor: '#FFEBEE',
  },
  pendingRentalBtnDeclineText: {
    color: ui.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  pendingRentalBtnDisabled: {
    opacity: 0.55,
  },
  activePastHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 9,
    marginTop: 2,
  },
  /** Transparent grouping only — request cards carry surface; avoids nested rounded compositing. */
  ownerRequestSectionShell: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 12,
  },
  ownerRequestSectionShellSpaced: {
    marginTop: 18,
  },
  ownerRequestSwipeHit: {
    backgroundColor: 'transparent',
  },
  rentalRowCard: {
    ...cardChrome,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  rentalRowMain: {
    width: '100%',
  },
  rentalRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 26,
  },
  rentalRowTitleWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  rentalRowTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.textPrimary,
    lineHeight: 20,
  },
  rentalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  rentalStatusChip: {
    maxWidth: 128,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#0B1F3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rentalStatusChipText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.15,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  rentalRowBottom: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rentalCounterparty: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '500',
    color: ui.textSecondary,
    letterSpacing: -0.1,
  },
  rentalRowActions: {
    width: RENTAL_ACTIONS_TOTAL_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: RENTAL_ACTIONS_GAP,
  },
  rentalIconBtn: {
    position: 'relative',
    width: RENTAL_ACTION_BTN_WIDTH,
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#EAF2FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C7D6ED',
  },
  rentalIconBtnPressed: {
    opacity: 0.86,
  },
  rentalActionLabelInline: {
    fontSize: 9,
    fontWeight: '600',
    color: ui.primary,
    lineHeight: 11,
  },
  rentalIconBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D7263D',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  rentalIconBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pastRentalCard: {
    opacity: 0.92,
    backgroundColor: ui.surfaceStriped,
  },
  scroll: {
    flex: 1,
  },
  /** Inner vertical scroll for each Activity tab (horizontal pager page). */
  tabPanelScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
  },
  /** Requests tab: intro content above sticky Active / Completed control. */
  requestsScrollPreamble: {
    paddingHorizontal: ui.padCard + 2,
    paddingBottom: 4,
  },
  /** Pinned row for segmented tabs only (Requests tab). */
  requestsStickyTabsHost: {
    backgroundColor: ui.surfaceGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: ui.padCard + 2,
    zIndex: 2,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
  },
  tabPagerViewport: {
    flex: 1,
    minHeight: 0,
  },
  tabPager: {
    flex: 1,
  },
  tabPagerPage: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: ui.padScreenH,
  },
  sectionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginVertical: ui.spaceSection,
    alignSelf: 'stretch',
  },
  emptyText: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  emptyBlock: {},
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 22,
  },
  emptySubline: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '400',
    color: ui.textSubtle,
    lineHeight: 22,
  },
  cardRowWrap: {
    marginBottom: 15,
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
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAction: {
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: ui.radiusCard,
    borderBottomRightRadius: ui.radiusCard,
  },
  deleteActionText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
  activeCard: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    ...cardChrome,
    paddingVertical: 22,
    paddingHorizontal: ui.padCard,
    marginBottom: 16,
  },
  activeCardInfo: {
    alignItems: 'center',
  },
  activeToolName: {
    fontSize: 20,
    fontWeight: '800',
    color: ui.textPrimary,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  activeBlockSpacer: {
    height: 16,
  },
  activeWithLine: {
    fontSize: 15,
    color: ui.textPrimary,
    textAlign: 'center',
    alignSelf: 'stretch',
    lineHeight: 22,
  },
  activeStartLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  activeStartValue: {
    fontSize: 15,
    color: ui.textPrimary,
    textAlign: 'center',
    alignSelf: 'stretch',
    lineHeight: 22,
  },
  activeStartedAgo: {
    marginTop: 6,
    fontSize: 14,
    color: ui.textSubtle,
    textAlign: 'center',
    alignSelf: 'stretch',
    lineHeight: 20,
  },
  activeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2E7D32',
  },
  activeStatusLabel: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E20',
  },
  activeBetweenCardSpacer: {
    height: ui.spaceSection,
  },
  activeActionsColumn: {
    width: '100%',
    alignSelf: 'stretch',
  },
  activeBtnStackGap: {
    height: 14,
  },
  activeBtnPrimaryLarge: {
    alignSelf: 'stretch',
    position: 'relative',
    paddingVertical: 18,
    paddingHorizontal: ui.padScreenH,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.primary,
    ...shadowKey,
  },
  activeBtnPressed: {
    ...primarySolidPressed,
  },
  activeBtnPrimaryLargeText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  threadMessageBtnBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D7263D',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  threadMessageBtnBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  listingCard: {
    ...cardChrome,
    marginBottom: ui.spaceSm + 4,
  },
  listingCardPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  listingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    marginBottom: 6,
    lineHeight: 22,
  },
  listingMeta: {
    fontSize: ui.fontPrice,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  listingDistance: {
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    marginBottom: 4,
  },
  listingDesc: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  requestDeleteModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  requestDeleteModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  requestDeleteModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 10,
  },
  requestDeleteModalBody: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  requestDeleteModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  requestDeleteModalBtnCancel: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.surfaceNeutral,
  },
  requestDeleteModalBtnCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  requestDeleteModalBtnDestructive: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.danger,
  },
  requestDeleteModalBtnDestructivePressed: {
    opacity: 0.88,
  },
  requestDeleteModalBtnDestructiveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  requestDeleteModalBtnPressed: {
    opacity: 0.88,
  },
  requestDeleteModalBtnDisabled: {
    opacity: 0.5,
  },
});

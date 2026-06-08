import { BackHeader } from '@/components/AppHeaders';
import { ActivityOwnerRequestCard } from '@/components/activity/ActivityOwnerRequestCard';
import { ActivityListingOfferCard } from '@/components/activity/ActivityListingOfferCard';
import { ActivityOwnerBookingRequestCard } from '@/components/activity/ActivityOwnerBookingRequestCard';
import { ActivityRequestSectionHeader } from '@/components/activity/ActivityRequestSectionHeader';
import { ActivitySegmentedTabs } from '@/components/activity/ActivitySegmentedTabs';
import { CardPressable } from '@/components/CardPressable';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import {
  WorkspaceMyShopHub,
  WorkspaceRentingHub,
  type MyShopWorkspaceSection,
  type RentingWorkspaceSection,
} from '@/components/activity/WorkspaceActivityHub';
import {
  cardChrome,
  primarySolidPressed,
  shadowCard,
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
import {
  canonicalMeetupScheduleForRow,
  recordCanonicalMeetupCoordinationSnapshot,
  resolveCanonicalMeetupCoordinationState,
} from '@/lib/canonicalMeetupCoordination';
import { useAuthUserId } from '@/lib/authUser';
import {
  fetchPendingRentalRequestsForOwner,
  type PendingListingRentalRow,
} from '@/lib/fetchPendingRentalRequestsForOwner';
import { RentalCancelRequestSheet } from '@/components/rentalCancellation/RentalCancelRequestSheet';
import { unifiedRentalTitle, type UnifiedRentalRow } from '@/lib/fetchUnifiedRentalsForUser';
import {
  acceptRentalCancellation,
  cancellationRequestedByOther,
  declineRentalCancellation,
  evaluateCancellationEligibility,
  isRentalActiveForQueues,
  isRentalCancelled,
  isRentalCancelledHistory,
  isRentalCompletedHistory,
  requestRentalCancellation,
} from '@/lib/rentalCancellation';
import {
  resolveRentalCardStatusBadge,
  type RentalCardStatusBadge,
} from '@/lib/rentalLifecycle';
import {
  openGuidedRentalFlow,
  rentalWizardCancelledSummaryPath,
} from '@/lib/rentalNavigation';
import type { RentalCancellationReasonKey } from '@/lib/rentalCancellation';
import { pickRentalWorkspaceNudgeRow } from '@/lib/rentalWorkspaceNudge';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { mergeRecentNotificationsFromServer } from '@/lib/notificationsServerSync';
import { refreshActivityScreenFromSupabase } from '@/lib/supabaseActivityRefresh';
import { logRentalLifecycle } from '@/lib/rentalLifecycleDebug';
import { updateRentalRequestStatus } from '@/lib/updateRentalRequestStatus';
import { ownerSetListingOfferStatus } from '@/lib/listingOfferLifecycleActions';
import { formatListingPriceWithUnit, useListingsStore } from '@/store/listingsStore';
import { hydrateListingAvailability } from '@/store/listingAvailabilityStore';
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
import { estimateWizardCtaLabelFromRentalRow } from '@/lib/rentalWizard';
import { useUnifiedRentalsActivityStore } from '@/store/unifiedRentalsActivityStore';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RectButton, Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

declare const __DEV__: boolean;

function visibleUnreadForUser(n: AppNotification, userId: string): boolean {
  return !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === userId);
}

function formatSectionCount(n: number): string {
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

function firstWorkspaceParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? String(v[0] ?? '').trim() : String(v).trim();
}

function isUnifiedRentalActiveRow(row: UnifiedRentalRow): boolean {
  return isRentalActiveForQueues(row);
}

function formatNextPickupHintForRows(rows: UnifiedRentalRow[], viewerUserId: string): string {
  const active = rows.filter(isUnifiedRentalActiveRow);
  if (active.length === 0) return 'No active rentals';
  let best: number | null = null;
  for (const r of active) {
    const iso =
      canonicalMeetupScheduleForRow(
        r as import('@/lib/rentalMeetupProposalLifecycle').RentalMeetupRow,
        viewerUserId
      ).pickupIso ?? '';
    const t = iso ? Date.parse(String(iso)) : NaN;
    if (!Number.isFinite(t)) continue;
    if (t > Date.now() - 36 * 60 * 60 * 1000 && (best == null || t < best)) best = t;
  }
  if (best == null) return 'View pickups';
  const d = new Date(best);
  const now = new Date();
  const sod = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((sod(d) - sod(now)) / (24 * 60 * 60 * 1000));
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Next: Today · ${timePart}`;
  if (dayDiff === 1) return `Next: Tomorrow · ${timePart}`;
  if (dayDiff === -1) return 'Next: Pickup past';
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `Next: ${datePart}`;
}

function formatPickupPendingHintForOwner(rows: UnifiedRentalRow[]): string {
  const active = rows.filter(isUnifiedRentalActiveRow);
  let n = 0;
  for (const r of active) {
    const st = String(r.status ?? '').trim().toLowerCase();
    if (st === 'pending' || st === '') n += 1;
  }
  if (n <= 0) return 'All pickups confirmed';
  return `${n} pickup${n === 1 ? '' : 's'} pending`;
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

type ActivityWorkspaceMode = 'renting' | 'my_shop';

function parseWorkspaceSection(
  mode: ActivityWorkspaceMode,
  raw: string
): RentingWorkspaceSection | MyShopWorkspaceSection | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (mode === 'renting') {
    if (s === 'rentals' || s === 'offers' || s === 'requests' || s === 'saved') return s as RentingWorkspaceSection;
    return null;
  }
  if (s === 'inbox' || s === 'rentals' || s === 'listings' || s === 'earnings') return s as MyShopWorkspaceSection;
  return null;
}

type RequestsOwnerSubView = 'active' | 'completed';

const ACTIVITY_RENTAL_WORKSPACE_NUDGE_DISMISSED_KEY = 'activity_rental_workspace_nudge_dismissed_v1';

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

function rentalStatusChipColors(tone: RentalCardStatusBadge['tone']): { bg: string; fg: string } {
  switch (tone) {
    case 'danger':
      return { bg: '#FEE2E2', fg: '#B91C1C' };
    case 'warning':
      return { bg: '#FFF7ED', fg: '#9A3412' };
    case 'muted':
      return { bg: '#F1F5F9', fg: '#64748B' };
    default:
      return { bg: '#EAF2FF', fg: ui.primary };
  }
}

function rentalStatusVisual(
  row: UnifiedRentalRow,
  role: RentalsSubView,
  viewerUserId: string
): RentalCardStatusBadge {
  return resolveRentalCardStatusBadge(row, role, viewerUserId);
}

function showReportIssueAlert(message?: string): void {
  Alert.alert(
    'Report issue',
    message ?? 'In-app reporting is coming soon. For urgent issues, message your match from chat.'
  );
}

export function ActivityWorkspaceScreen({ mode }: { mode: ActivityWorkspaceMode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [requestsOwnerSubView, setRequestsOwnerSubView] = useState<RequestsOwnerSubView>('active');
  const [offersWaitingExpanded, setOffersWaitingExpanded] = useState(true);
  const [openRequestsExpanded, setOpenRequestsExpanded] = useState(true);
  const [inProgressExpanded, setInProgressExpanded] = useState(true);
  const me = useAuthUserId();
  const listings = useListingsStore((s) => s.listings);
  const offers = useOffersStore((state) => state.offers);
  const notifications = useNotificationsStore((s) => s.notifications);
  const listingOfferRows = useListingOffersActivityStore((s) => s.rows);
  const unreadByOfferId = useMessageUnreadStore((s) => s.unreadByOfferId);
  const requests = useRequestsStore((s) => s.requests);
  const [pendingListingRentals, setPendingListingRentals] = useState<PendingListingRentalRow[]>([]);
  const unifiedRentals = useUnifiedRentalsActivityStore((s) => s.rows);
  const refreshUnifiedRentals = useUnifiedRentalsActivityStore((s) => s.refreshFromServer);
  const [busyRentalRequestId, setBusyRentalRequestId] = useState<string | null>(null);
  const [dismissedWorkspaceNudgeIds, setDismissedWorkspaceNudgeIds] = useState<Set<string>>(
    () => new Set()
  );
  const [requestDeleteConfirmTs, setRequestDeleteConfirmTs] = useState<number | null>(null);
  const [requestDeleteBusy, setRequestDeleteBusy] = useState(false);
  const [busyListingOfferId, setBusyListingOfferId] = useState<string | null>(null);
  const [cancelSheetRental, setCancelSheetRental] = useState<UnifiedRentalRow | null>(null);
  const [cancellationBusyId, setCancellationBusyId] = useState<string | null>(null);

  const refreshListingRentalRequests = useCallback(async () => {
    const uid = me.trim();
    if (!uid) {
      setPendingListingRentals([]);
      return;
    }
    const pending = await fetchPendingRentalRequestsForOwner(uid);
    setPendingListingRentals(pending);
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
      const listingIdForCalendar =
        pendingListingRentals.find((r) => r.id === id)?.listing_id?.trim() ?? '';
      const res = await updateRentalRequestStatus(id, 'approved');
      if (!res.ok) {
        alert(res.error ?? 'Could not approve');
        setBusyRentalRequestId(null);
        return;
      }
      logRentalLifecycle('listing_rental_owner_approved', { rentalRequestId: id });
      await refreshActivityScreenFromSupabase();
      await refreshListingRentalRequests();
      await refreshUnifiedRentals();
      if (listingIdForCalendar) void hydrateListingAvailability(listingIdForCalendar);
      if (__DEV__) {
        logRentalLifecycle('unified_rentals_after_approve_refresh', {
          rentalRequestId: id,
          unifiedRentalCount: useUnifiedRentalsActivityStore.getState().rows.length,
        });
      }
      setBusyRentalRequestId(null);
    },
    [
      pendingListingRentals,
      refreshActivityScreenFromSupabase,
      refreshListingRentalRequests,
      refreshUnifiedRentals,
    ]
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
      logRentalLifecycle('listing_rental_owner_declined', { rentalRequestId: id });
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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const intent = await readAndClearActivityPendingIntent();
          if (cancelled || intent == null) return;
          if (mode === 'renting' && intent.scrollTo === 'owner_rentals') {
            router.replace('/activity-my-shop');
            return;
          }
          if (mode === 'my_shop' && intent.scrollTo === 'renter_rentals') {
            router.replace('/activity-renting');
            return;
          }
        } finally {
          activityRentalsIntentPendingSyncRef.current = false;
        }
      })();
      void refreshActivityScreenFromSupabase();
      void mergeRecentNotificationsFromServer();
      void refreshListingRentalRequests();
      void refreshUnifiedRentals();
      void hydrateListingsFromSupabase();
      if (__DEV__) {
        logRentalLifecycle('activity_workspace_focus_refresh', { mode });
      }
      return () => {
        cancelled = true;
        activityRentalsIntentPendingSyncRef.current = false;
      };
    }, [mode, refreshListingRentalRequests, refreshUnifiedRentals, router])
  );

  /** Close open swipe rows when leaving this screen so rows do not stay stuck after navigation or refresh. */
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

  const approvedAsRenter = useMemo(
    () => unifiedRentals.filter((r) => r.renter_user_id === me),
    [unifiedRentals, me]
  );

  const approvedAsOwner = useMemo(
    () => unifiedRentals.filter((r) => r.owner_user_id === me),
    [unifiedRentals, me]
  );

  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const activeWorkspaceSection = useMemo(
    () => parseWorkspaceSection(mode, firstWorkspaceParam(params.section)),
    [mode, params.section]
  );
  const unreadMessagesTotal = useUnreadMessagesTotal();

  const rentingActiveRentalRows = useMemo(
    () => approvedAsRenter.filter(isUnifiedRentalActiveRow),
    [approvedAsRenter]
  );

  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__ || !me) return;
    const row = rentingActiveRentalRows[0];
    if (!row) return;
    recordCanonicalMeetupCoordinationSnapshot({
      rentalId: row.id,
      surface: 'activity',
      state: resolveCanonicalMeetupCoordinationState({
        rental: row as import('@/lib/rentalMeetupProposalLifecycle').RentalMeetupRow,
        viewerUserId: me,
        viewerRole:
          me === String(row.owner_user_id ?? '').trim()
            ? 'owner'
            : me === String(row.renter_user_id ?? '').trim()
              ? 'renter'
              : 'renter',
        presentationSurface:
          me === String(row.owner_user_id ?? '').trim() ? 'owner_workspace' : 'renter_wizard',
      }),
    });
  }, [rentingActiveRentalRows, me]);
  const rentingCompletedHistoryRows = useMemo(
    () => approvedAsRenter.filter(isRentalCompletedHistory),
    [approvedAsRenter]
  );
  const rentingCancelledHistoryRows = useMemo(
    () => approvedAsRenter.filter(isRentalCancelledHistory),
    [approvedAsRenter]
  );
  const shopActiveRentalRows = useMemo(
    () => approvedAsOwner.filter(isUnifiedRentalActiveRow),
    [approvedAsOwner]
  );
  const shopCompletedHistoryRows = useMemo(
    () => approvedAsOwner.filter(isRentalCompletedHistory),
    [approvedAsOwner]
  );
  const shopCancelledHistoryRows = useMemo(
    () => approvedAsOwner.filter(isRentalCancelledHistory),
    [approvedAsOwner]
  );

  const exitWorkspaceSection = useCallback(() => {
    if (mode === 'renting') router.replace('/activity-renting');
    else router.replace('/activity-my-shop');
  }, [mode, router]);

  const hubHeaderOnBack = activeWorkspaceSection != null ? exitWorkspaceSection : () => router.back();

  const goToWorkspaceChats = useCallback(() => {
    router.push('/(tabs)/chats');
  }, [router]);

  const goRentingSection = useCallback(
    (s: RentingWorkspaceSection) => {
      router.push({ pathname: '/activity-renting', params: { section: s } });
    },
    [router]
  );

  const goMyShopSection = useCallback(
    (s: MyShopWorkspaceSection) => {
      router.push({ pathname: '/activity-my-shop', params: { section: s } });
    },
    [router]
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

  const shopInboxActionCount = useMemo(() => {
    let n = pendingListingRentals.length;
    for (const row of listingOffersAsOwner) {
      if (row.status === 'pending' || row.status === 'pending_confirmation') n += 1;
    }
    return n;
  }, [pendingListingRentals, listingOffersAsOwner]);

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
    else
      showFeedbackToast(
        r.negotiationClosed ? 'Negotiation closed — no more offers on this thread.' : 'Offer declined. They can send another offer.'
      );
    void hydrateListingOffersFromSupabase();
    setBusyListingOfferId(null);
  }, []);

  const rentalsTotalCount = unifiedRentals.length;

  const rentalWorkspaceNudgeRow = useMemo(() => {
    const pool =
      mode === 'renting'
        ? unifiedRentals.filter((r) => r.renter_user_id === me)
        : mode === 'my_shop'
          ? unifiedRentals.filter((r) => r.owner_user_id === me)
          : unifiedRentals;
    return pickRentalWorkspaceNudgeRow(pool, dismissedWorkspaceNudgeIds);
  }, [unifiedRentals, dismissedWorkspaceNudgeIds, mode, me]);

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

  function renderRentalOperationalRow(
    row: UnifiedRentalRow,
    role: RentalsSubView,
    options?: { historyVariant?: 'completed' | 'cancelled' }
  ) {
    const title = unifiedRentalTitle(row);
    const messageUnread =
      typeof row.offer_id === 'string' && row.offer_id.trim() !== ''
        ? (unreadByOfferId[row.offer_id.trim()] ?? 0)
        : 0;
    const status = rentalStatusVisual(row, role, me);
    const statusColors = rentalStatusChipColors(status.tone);
    const counterpartyLine = rentalCounterpartyMetaLine(
      role === 'renting' ? row.owner_user_id : row.renter_user_id,
      role
    );
    const cancelled = isRentalCancelled(row);
    const historyMuted = options?.historyVariant === 'cancelled';
    const pendingCancelForMe = cancellationRequestedByOther(row, me);
    const cancelEligibility = evaluateCancellationEligibility(row, { viewerUserId: me });
    const canRequestCancel = cancelEligibility.allowed && !cancelled;
    const showReportIssue =
      !canRequestCancel && 'reportIssue' in cancelEligibility && cancelEligibility.reportIssue;
    const guidedFlowLabel =
      role === 'renting' && !cancelled
        ? estimateWizardCtaLabelFromRentalRow({
            status: row.status,
            cancellation_status: row.cancellation_status,
            agreement_status: row.agreement_status,
            last_proposed_by: row.last_proposed_by,
            agreed_pickup_datetime: row.agreed_pickup_datetime,
            agreed_return_datetime: row.agreed_return_datetime,
          })
        : null;
    const rowBusy = cancellationBusyId === row.id;

    const runCancellationAction = async (
      label: string,
      fn: () => Promise<{ ok: boolean; message?: string }>
    ) => {
      setCancellationBusyId(row.id);
      try {
        const res = await fn();
        if (res.ok) {
          showFeedbackToast(label);
          await refreshUnifiedRentals();
        } else {
          Alert.alert('Could not update', res.message ?? 'Please try again.');
        }
      } finally {
        setCancellationBusyId(null);
      }
    };

    return (
      <View
        key={row.id}
        style={[styles.rentalRowCard, historyMuted && styles.rentalRowCardHistoryCancelled]}
      >
        <View style={styles.rentalRowMain}>
          <View style={styles.rentalRowTop}>
            <View style={styles.rentalRowTitleWrap}>
              <Text
                style={[styles.rentalRowTitle, historyMuted && styles.rentalRowTitleMuted]}
                numberOfLines={1}
              >
                {title}
              </Text>
            </View>
            <View style={styles.rentalStatusRow}>
              <View style={[styles.rentalStatusChip, { backgroundColor: statusColors.bg }]}>
                <Text
                  style={[styles.rentalStatusChipText, { color: statusColors.fg }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {formatRentalStatusPillLabel(status.label)}
                </Text>
              </View>
            </View>
          </View>

          {pendingCancelForMe ? (
            <View style={styles.cancelBanner}>
              <Text style={styles.cancelBannerText}>Cancellation requested — respond below</Text>
              <View style={styles.cancelBannerActions}>
                <Pressable
                  haptic
                  disabled={rowBusy}
                  onPress={() =>
                    void runCancellationAction('Cancellation accepted', () =>
                      acceptRentalCancellation(getSupabase(), row.id, me, {
                        rentalTitle: title,
                      })
                    )
                  }
                  style={({ pressed }) => [styles.cancelBannerBtn, pressed && { opacity: 0.9 }]}
                >
                  <Text style={styles.cancelBannerBtnText}>Accept</Text>
                </Pressable>
                <Pressable
                  haptic
                  disabled={rowBusy}
                  onPress={() =>
                    void runCancellationAction('Cancellation declined', () =>
                      declineRentalCancellation(getSupabase(), row.id, me, {
                        rentalTitle: title,
                      })
                    )
                  }
                  style={({ pressed }) => [
                    styles.cancelBannerBtnOutline,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={styles.cancelBannerBtnOutlineText}>Decline</Text>
                </Pressable>
                <Pressable
                  haptic
                  onPress={() =>
                    router.push({
                      pathname: '/chat/[id]',
                      params: { id: row.id },
                    })
                  }
                  style={({ pressed }) => [styles.cancelBannerBtnGhost, pressed && { opacity: 0.9 }]}
                >
                  <Text style={styles.cancelBannerBtnGhostText}>Message</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.rentalRowBottom}>
            <Text style={styles.rentalCounterparty} numberOfLines={1}>
              {counterpartyLine}
            </Text>
            <View style={styles.rentalActionGrid}>
              <View style={styles.rentalActionGridRow}>
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={() => {
                    if (!row.id) return;
                    router.push({ pathname: '/chat/[id]', params: { id: row.id } });
                  }}
                  style={({ pressed }) => [styles.rentalGridBtn, pressed && styles.rentalGridBtnPressed]}
                  accessibilityLabel="Chat"
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={15} color={ui.primary} />
                  <Text style={styles.rentalGridBtnLabel}>Chat</Text>
                  {messageUnread > 0 ? (
                    <View style={styles.rentalIconBadge}>
                      <Text style={styles.rentalIconBadgeText}>{formatSectionCount(messageUnread)}</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={() =>
                    router.push({ pathname: '/rental/[id]', params: { id: row.id } })
                  }
                  style={({ pressed }) => [styles.rentalGridBtn, pressed && styles.rentalGridBtnPressed]}
                  accessibilityLabel="Details"
                >
                  <Ionicons name="document-text-outline" size={15} color={ui.primary} />
                  <Text style={styles.rentalGridBtnLabel}>Details</Text>
                </Pressable>
              </View>
              {guidedFlowLabel || !cancelled ? (
                <View style={styles.rentalActionGridBottom}>
                  {guidedFlowLabel ? (
                    <Pressable
                      pressOpacityFeedback={false}
                      haptic
                      onPress={() => {
                        if (cancelled) {
                          router.push(rentalWizardCancelledSummaryPath(row.id));
                          return;
                        }
                        openGuidedRentalFlow(router, row.id, me, row);
                      }}
                      style={({ pressed }) => [
                        styles.rentalGridBtnPrimaryWide,
                        pressed && styles.rentalGridBtnPressed,
                      ]}
                      accessibilityLabel={guidedFlowLabel}
                    >
                      <Ionicons name="arrow-forward-circle" size={17} color="#FFFFFF" />
                      <Text style={styles.rentalGridBtnPrimaryWideLabel} numberOfLines={1}>
                        Continue
                      </Text>
                    </Pressable>
                  ) : null}
                  {!cancelled && (canRequestCancel || showReportIssue) ? (
                    <Pressable
                      pressOpacityFeedback={false}
                      haptic
                      disabled={
                        !canRequestCancel &&
                        !showReportIssue &&
                        !('contactSupport' in cancelEligibility && cancelEligibility.contactSupport)
                      }
                      onPress={() => {
                        if (showReportIssue) {
                          showReportIssueAlert(cancelEligibility.message);
                          return;
                        }
                        if (
                          'contactSupport' in cancelEligibility &&
                          cancelEligibility.contactSupport
                        ) {
                          Alert.alert('Contact support', cancelEligibility.message, [
                            { text: 'OK' },
                          ]);
                          return;
                        }
                        if (canRequestCancel) setCancelSheetRental(row);
                      }}
                      style={({ pressed }) => [
                        showReportIssue
                          ? styles.rentalGridBtnReportCompact
                          : styles.rentalGridBtnCancelCompact,
                        pressed && { opacity: 0.9 },
                      ]}
                      accessibilityLabel={showReportIssue ? 'Report issue' : 'Request cancel'}
                    >
                      <Text
                        style={
                          showReportIssue
                            ? styles.rentalGridBtnReportCompactLabel
                            : styles.rentalGridBtnCancelCompactLabel
                        }
                      >
                        {showReportIssue ? 'Report issue' : 'Request cancel'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
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
            <View style={styles.workspaceTop}>
              <BackHeader
                title={mode === 'renting' ? 'Renting' : 'My shop'}
                subtitle={
                  mode === 'renting'
                    ? "Manage the gear you're trying to rent. Track offers, requests, and active rentals."
                    : 'Manage your listings, offers, and rentals where you lend out gear.'
                }
                onBack={hubHeaderOnBack}
                rightAccessory={
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={goToWorkspaceChats}
                    accessibilityRole="button"
                    accessibilityLabel={
                      unreadMessagesTotal > 0
                        ? `Messages, ${formatSectionCount(unreadMessagesTotal)} unread`
                        : 'Messages'
                    }
                    style={({ pressed }) => [
                      styles.workspaceHeaderMsgBtn,
                      pressed && styles.workspaceHeaderMsgBtnPressed,
                    ]}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={ui.primary} />
                    {unreadMessagesTotal > 0 ? (
                      <View style={styles.workspaceHeaderMsgBadge}>
                        <Text style={styles.workspaceHeaderMsgBadgeText}>
                          {formatSectionCount(unreadMessagesTotal)}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                }
              />
            </View>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.workspaceScrollContent,
                {
                  paddingBottom:
                    Math.max(insets.bottom, 10) + 22 + (activeWorkspaceSection == null ? 72 : 0),
                },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces
            >
              {activeWorkspaceSection == null && mode === 'renting' ? (
                <WorkspaceRentingHub
                  nudge={
                    rentalWorkspaceNudgeRow
                      ? {
                          rentalId: rentalWorkspaceNudgeRow.id,
                          counterpartyFirstName: workspaceNudgeCounterpartyFirstName(
                            rentalWorkspaceNudgeRow,
                            me
                          ),
                        }
                      : null
                  }
                  onDismissNudge={onDismissRentalWorkspaceNudge}
                  onOpenRental={(id) => {
                    const row = unifiedRentals.find((r) => r.id === id);
                    openGuidedRentalFlow(router, id, me, row ?? null);
                  }}
                  goSection={goRentingSection}
                  activeRentalCount={rentingActiveRentalRows.length}
                  nextPickupHint={formatNextPickupHintForRows(approvedAsRenter, me)}
                  listingOfferCount={listingOffersAsRenter.length}
                  requestCount={ownedRequestsSorted.length}
                  savedCount={0}
                />
              ) : null}
              {activeWorkspaceSection == null && mode === 'my_shop' ? (
                <WorkspaceMyShopHub
                  goSection={goMyShopSection}
                  inboxCount={shopInboxActionCount}
                  inboxSub={shopInboxActionCount > 0 ? 'Needs action' : 'All caught up'}
                  activeRentalCount={shopActiveRentalRows.length}
                  pickupHint={formatPickupPendingHintForOwner(approvedAsOwner)}
                  listingsCount={myEquipment.length}
                  earningsLabel="—"
                  earningsSub="This month"
                />
              ) : null}

              {mode === 'renting' && activeWorkspaceSection === 'requests' ? (
                <>
                  <View style={styles.wsDetailPad}>
                    <Text style={styles.tabPanelSubline}>
                      Community borrow requests you posted and offers from lenders.
                    </Text>
                    {ownedRequestsSorted.length === 0 ? (
                      <Text style={[styles.emptyText, { marginBottom: 12 }]}>
                        No requests yet. Tap + New Request to post equipment you need.
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
                        {activeTabRequestsPool.length === 0 ? (
                          <Text style={styles.emptyText}>
                            No active requests. Post a request with + New Request.
                          </Text>
                        ) : (
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
                            <View
                              style={[styles.ownerRequestSectionShell, styles.ownerRequestSectionShellSpaced]}
                            >
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
                            <View
                              style={[styles.ownerRequestSectionShell, styles.ownerRequestSectionShellSpaced]}
                            >
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
                  </View>
                </>
              ) : null}

              {mode === 'renting' && activeWorkspaceSection === 'offers' ? (
                <View style={styles.wsDetailPad}>
                  <Text style={styles.activePastHeading}>Offers on listings</Text>
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
              ) : null}

              {mode === 'renting' && activeWorkspaceSection === 'rentals' ? (
                <View style={styles.wsDetailPad}>
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
                            style={({ pressed }) => [
                              styles.workspaceNudgeDismissBtn,
                              pressed && { opacity: 0.75 },
                            ]}
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
                            openGuidedRentalFlow(
                              router,
                              rentalWorkspaceNudgeRow.id,
                              me,
                              rentalWorkspaceNudgeRow
                            );
                          }}
                          style={({ pressed }) => [
                            styles.workspaceNudgeCta,
                            pressed && primarySolidPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Continue rental"
                        >
                          <Text style={styles.workspaceNudgeCtaLabel}>Continue</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  <Text style={styles.activePastHeading}>Your rentals</Text>
                  <Text style={styles.tabPanelSubline}>Active agreements where you are the borrower.</Text>
                  {rentingActiveRentalRows.length === 0 ? (
                    <View style={styles.emptyBlock}>
                      <Text style={styles.emptyTitle}>No active rentals</Text>
                      <Text style={styles.emptySubline}>
                        Rentals where you are the borrower appear here once a booking is confirmed.
                      </Text>
                    </View>
                  ) : (
                    rentingActiveRentalRows.map((row) => renderRentalOperationalRow(row, 'renting'))
                  )}
                  {rentingCompletedHistoryRows.length > 0 ||
                  rentingCancelledHistoryRows.length > 0 ? (
                    <>
                      <View style={[styles.sectionRule, styles.sectionRuleTight]} />
                      <Text style={styles.activePastHeading}>Rental history</Text>
                      {rentingCompletedHistoryRows.length > 0 ? (
                        <>
                          <Text style={styles.historySubheading}>Completed</Text>
                          {rentingCompletedHistoryRows.map((row) =>
                            renderRentalOperationalRow(row, 'renting', {
                              historyVariant: 'completed',
                            })
                          )}
                        </>
                      ) : null}
                      {rentingCancelledHistoryRows.length > 0 ? (
                        <>
                          <Text style={styles.historySubheadingMuted}>Cancelled</Text>
                          {rentingCancelledHistoryRows.map((row) =>
                            renderRentalOperationalRow(row, 'renting', {
                              historyVariant: 'cancelled',
                            })
                          )}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : null}

              {mode === 'renting' && activeWorkspaceSection === 'saved' ? (
                <View style={styles.wsDetailPad}>
                  <Text style={styles.emptyTitle}>Saved items</Text>
                  <Text style={[styles.tabPanelSubline, { marginBottom: 16 }]}>
                    Saved listings are not wired up yet. Browse gear to rent and check back soon.
                  </Text>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={() => router.push('/(tabs)/browse')}
                    style={({ pressed }) => [styles.wsSecondaryBtn, pressed && { opacity: 0.9 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Open browse"
                  >
                    <Text style={styles.wsSecondaryBtnText}>Browse listings</Text>
                  </Pressable>
                </View>
              ) : null}

              {mode === 'my_shop' && activeWorkspaceSection === 'inbox' ? (
                <>
                  <View style={styles.wsDetailPad}>
                    <Text style={styles.tabPanelSubline}>
                      Approve booking requests and respond to offers on your listings.
                    </Text>
                    {pendingListingRentals.length > 0 ? (
                      <>
                        <Text style={styles.activePastHeading}>Pending listing rentals</Text>
                        <Text style={styles.pendingListingSubtext}>
                          Someone requested to rent your equipment · approve or decline
                        </Text>
                        {pendingListingRentals.map((row) => (
                          <ActivityOwnerBookingRequestCard
                            key={row.id}
                            row={row}
                            busy={busyRentalRequestId === row.id}
                            onApprove={() => void onApproveListingRental(row.id)}
                            onDecline={() => void onDeclineListingRental(row.id)}
                            onMessage={() =>
                              showFeedbackToast('Chat opens once the booking is approved')
                            }
                          />
                        ))}
                        <View style={[styles.sectionRule, styles.sectionRuleTight]} />
                      </>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.tabPanel,
                      offersSectionBadgeCount > 0 && styles.tabPanelAttention,
                    ]}
                  >
                    <Text style={styles.activePastHeading}>Listing offers</Text>
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
                          onCounter={(id) => router.push({ pathname: '/listing-counter-offer', params: { offerId: id } })}
                          onMessage={() =>
                            router.push({ pathname: '/chat/[id]', params: { id: row.id } })
                          }
                          busy={busyListingOfferId === row.id}
                        />
                      ))
                    )}
                    <View style={[styles.sectionRule, styles.sectionRuleTight]} />
                    <Text style={styles.activePastHeading}>Your offers on borrow requests</Text>
                    <Text style={styles.tabPanelSubline}>
                      Bids you placed on community requests · status reflects the poster response
                    </Text>
                    {myLenderOffers.length === 0 ? (
                      <Text style={styles.emptyText}>
                        No offers yet. Browse requests and tap Make offer.
                      </Text>
                    ) : (
                      myLenderOffers.map((o) => renderMyOfferRow(o))
                    )}
                  </View>
                </>
              ) : null}

              {mode === 'my_shop' && activeWorkspaceSection === 'rentals' ? (
                <View style={styles.wsDetailPad}>
                  <Text style={styles.activePastHeading}>Your rentals</Text>
                  <Text style={styles.tabPanelSubline}>
                    Active agreements where you are lending equipment out.
                  </Text>
                  {shopActiveRentalRows.length === 0 &&
                  shopCompletedHistoryRows.length === 0 &&
                  shopCancelledHistoryRows.length === 0 ? (
                    <View style={styles.emptyBlock}>
                      <Text style={styles.emptyTitle}>Nothing here yet</Text>
                      <Text style={styles.emptySubline}>
                        Rentals where you are lending equipment appear here.
                      </Text>
                    </View>
                  ) : (
                    <>
                      {shopActiveRentalRows.map((row) => renderRentalOperationalRow(row, 'listing'))}
                      {shopCompletedHistoryRows.length > 0 || shopCancelledHistoryRows.length > 0 ? (
                        <>
                          <View style={[styles.sectionRule, styles.sectionRuleTight]} />
                          <Text style={styles.activePastHeading}>Rental history</Text>
                          {shopCompletedHistoryRows.length > 0 ? (
                            <>
                              <Text style={styles.historySubheading}>Completed</Text>
                              {shopCompletedHistoryRows.map((row) =>
                                renderRentalOperationalRow(row, 'listing', {
                                  historyVariant: 'completed',
                                })
                              )}
                            </>
                          ) : null}
                          {shopCancelledHistoryRows.length > 0 ? (
                            <>
                              <Text style={styles.historySubheadingMuted}>Cancelled</Text>
                              {shopCancelledHistoryRows.map((row) =>
                                renderRentalOperationalRow(row, 'listing', {
                                  historyVariant: 'cancelled',
                                })
                              )}
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}

              {mode === 'my_shop' && activeWorkspaceSection === 'listings' ? (
                <View style={styles.wsDetailPad}>
                  <Text style={styles.activePastHeading}>Your equipment</Text>
                  <Text style={styles.tabPanelSubline}>
                    Tap a listing to edit pricing, availability, and details.
                  </Text>
                  {myEquipment.length === 0 ? (
                    <Text style={styles.emptyText}>
                      No equipment listed yet. Tap + Add New Listing to create a listing.
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
              ) : null}

              {mode === 'my_shop' && activeWorkspaceSection === 'earnings' ? (
                <View style={styles.wsDetailPad}>
                  <Text style={styles.emptyTitle}>Earnings</Text>
                  <Text style={styles.tabPanelSubline}>
                    Payout summaries and performance insights will live here soon.
                  </Text>
                </View>
              ) : null}
            </ScrollView>
            {activeWorkspaceSection == null ? (
              <View
                style={[
                  styles.wsHubFooter,
                  { paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 0 },
                ]}
              >
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={() => {
                    if (mode === 'renting') router.push('/request');
                    else router.push('/listing');
                  }}
                  style={({ pressed }) => [styles.wsHubPrimaryCta, pressed && primarySolidPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={mode === 'renting' ? 'New request' : 'New listing'}
                >
                  <Text style={styles.wsHubPrimaryCtaText}>
                    {mode === 'renting' ? '+ New Request' : '+ Add New Listing'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

        </ScreenEntrance>
      </View>

      <RentalCancelRequestSheet
        visible={cancelSheetRental != null}
        rental={cancelSheetRental}
        viewerUserId={me}
        onClose={() => setCancelSheetRental(null)}
        onSubmit={async (reason: RentalCancellationReasonKey) => {
          if (!cancelSheetRental) return;
          const res = await requestRentalCancellation(
            getSupabase(),
            cancelSheetRental.id,
            me,
            reason,
            { rentalTitle: unifiedRentalTitle(cancelSheetRental) }
          );
          if (!res.ok) {
            Alert.alert('Could not send request', res.message);
            throw new Error(res.message);
          }
          showFeedbackToast('Cancellation request sent');
          await refreshUnifiedRentals();
        }}
      />

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
  workspaceTop: {
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 0,
  },
  workspaceScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  workspaceHeaderMsgBtn: {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF2FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C7D6ED',
  },
  workspaceHeaderMsgBtnPressed: {
    opacity: 0.88,
  },
  workspaceHeaderMsgBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D7263D',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  workspaceHeaderMsgBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  wsDetailPad: {
    paddingHorizontal: 0,
    paddingTop: 2,
  },
  wsHubFooter: {
    paddingTop: 6,
    backgroundColor: ui.surfaceGrouped,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.05)',
  },
  wsHubPrimaryCta: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: ui.primary,
    ...shadowKey,
  },
  wsHubPrimaryCtaText: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.primaryOn,
    letterSpacing: -0.15,
  },
  wsSecondaryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
  },
  wsSecondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.primaryOn,
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
  needsAttentionWrap: {
    paddingHorizontal: ui.padScreenH,
    marginBottom: 14,
  },
  needsAttentionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C2410C',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  needsAttentionCard: {
    ...cardChrome,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  needsAttentionCardPressed: {
    backgroundColor: ui.surfaceTintPrimary,
  },
  needsAttentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  needsAttentionThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: ui.surfaceNeutral,
  },
  needsAttentionThumbPh: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  needsAttentionMid: {
    flex: 1,
    minWidth: 0,
  },
  needsAttentionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textSecondary,
    marginBottom: 2,
  },
  needsAttentionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  needsAttentionMeta: {
    fontSize: 13,
    color: ui.textSecondary,
    marginTop: 2,
  },
  needsAttentionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  needsAttentionCountBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#FFF4E6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  needsAttentionCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  commandRow: {
    flexDirection: 'column',
    gap: 12,
    paddingHorizontal: ui.padScreenH,
    marginBottom: 14,
  },
  commandModule: {
    ...cardChrome,
    paddingVertical: 14,
    paddingHorizontal: ui.padCard,
    borderWidth: 2,
  },
  commandModuleRenting: {
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  commandModuleShop: {
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  commandModuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  commandModuleTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.2,
  },
  commandModuleSub: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  commandStatList: {
    marginBottom: 14,
    gap: 8,
  },
  commandStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  commandStatLabel: {
    fontSize: 14,
    color: ui.textSecondary,
    flex: 1,
  },
  commandStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  commandStatHint: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  commandCta: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
    ...shadowKey,
  },
  commandCtaLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.primaryOn,
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
    backgroundColor: '#FFFFFF',
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...shadowCard,
  },
  tabPanelAttention: {
    borderColor: 'rgba(11, 31, 58, 0.12)',
    ...shadowSegmentAttention,
  },
  tabPanelSubline: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 19,
    marginBottom: 12,
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
    marginBottom: 7,
    marginTop: 0,
  },
  /** Transparent grouping only — request cards carry surface; avoids nested rounded compositing. */
  ownerRequestSectionShell: {
    backgroundColor: 'transparent',
    paddingHorizontal: 13,
    paddingTop: 5,
    paddingBottom: 10,
  },
  ownerRequestSectionShellSpaced: {
    marginTop: 14,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  rentalStatusChipText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.15,
    flexShrink: 1,
  },
  rentalRowCardHistoryCancelled: {
    opacity: 0.82,
    backgroundColor: '#F8FAFC',
  },
  rentalRowTitleMuted: {
    color: ui.textSecondary,
    fontWeight: '600',
  },
  historySubheading: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  historySubheadingMuted: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: ui.textMuted,
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
  rentalActionGrid: {
    width: RENTAL_ACTIONS_TOTAL_WIDTH + RENTAL_ACTION_BTN_WIDTH + RENTAL_ACTIONS_GAP,
    maxWidth: '54%',
    gap: 6,
  },
  rentalActionGridRow: {
    flexDirection: 'row',
    gap: RENTAL_ACTIONS_GAP,
  },
  rentalGridBtn: {
    position: 'relative',
    flex: 1,
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#EAF2FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C7D6ED',
  },
  rentalGridBtnPressed: { opacity: 0.88 },
  rentalGridBtnPlaceholder: {
    opacity: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  rentalGridBtnLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: ui.primary,
  },
  rentalActionGridBottom: {
    gap: 6,
  },
  rentalGridBtnPrimaryWide: {
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ui.primary,
  },
  rentalGridBtnPrimaryWideLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    flexShrink: 1,
  },
  rentalGridBtnCancelCompact: {
    alignSelf: 'flex-start',
    minHeight: 30,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
    backgroundColor: 'transparent',
  },
  rentalGridBtnCancelCompactLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B91C1C',
  },
  rentalGridBtnReportCompact: {
    alignSelf: 'flex-start',
    minHeight: 30,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    backgroundColor: 'transparent',
  },
  rentalGridBtnReportCompactLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  rentalGridBtnDisabled: { opacity: 0.45 },
  cancelBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDBA74',
    gap: 8,
  },
  cancelBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9A3412',
  },
  cancelBannerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cancelBannerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#DC2626',
  },
  cancelBannerBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  cancelBannerBtnOutline: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  cancelBannerBtnOutlineText: { fontSize: 12, fontWeight: '700', color: ui.textPrimary },
  cancelBannerBtnGhost: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EAF2FF',
  },
  cancelBannerBtnGhostText: { fontSize: 12, fontWeight: '700', color: ui.primary },
  rentalRowActionsCol: {
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '52%',
  },
  rentalRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: RENTAL_ACTIONS_GAP,
  },
  rentalContinueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: ui.primary,
    maxWidth: '100%',
  },
  rentalContinueBtnPressed: { opacity: 0.9 },
  rentalContinueBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
    flexShrink: 1,
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
    paddingHorizontal: 13,
    paddingBottom: 2,
  },
  /** Pinned row for segmented tabs only (Requests tab). */
  requestsStickyTabsHost: {
    backgroundColor: ui.surfaceGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 13,
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
    marginBottom: 8,
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

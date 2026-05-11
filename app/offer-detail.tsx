import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenWrapper } from '@/components/ScreenWrapper';
import {
  CompareOfferScanCard,
  OfferCountPill,
  OfferDecisionStatusStrip,
  OfferDeepDetailBody,
  StickyActionBar,
  TransactionHeader,
  UserNamePill,
} from '@/components/transaction';
import { compareListToolbarMinHeight } from '@/constants/designTokens';
import { getAuthUserIdSync } from '@/lib/authUser';
import { formatHowDisplay } from '@/lib/deliveryFormat';
import { formatNegotiatedDeliverySummary } from '@/lib/negotiationDelivery';
import { formatDurationDisplay } from '@/lib/durationFormat';
import type { Offer } from '@/lib/negotiationOfferTypes';
import { formatUsd, getNumericOfferPrice } from '@/lib/money';
import type { FinalizeOfferAcceptanceResult } from '@/lib/finalizeOfferAcceptance';
import { finalizeOfferAcceptance } from '@/lib/finalizeOfferAcceptance';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import {
  getRequestOwnerId,
  getRequestSupabaseRowId,
  isUuidString,
} from '@/lib/requestOwnership';
import { scheduleActivityRentalsIntent } from '@/lib/activityPendingIntent';
import { getSupabase } from '@/lib/supabase';
import { syncRequestAndOffersFromSupabase } from '@/lib/supabaseOfferSync';
import {
  canCreateNewOfferThreadAfterWithdraw,
  cooldownRemainingAfterWithdrawMs,
  formatNegotiationCooldownRemaining,
  isFinalDeclineRoundBeforeAction,
  parseProposalDeclinedReason,
} from '@/lib/negotiationLifecycle';
import { calculateDailyLateFee } from '@/lib/dailyLateFee';
import { calculatePreauthAmount } from '@/lib/rentalProtection';
import {
  filterNegotiationDiffRows,
  negotiatedOfferTotals,
  negotiationChangeBullets,
  snapshotFromNegotiationMessageRow,
  sortOffersByLowestNegotiatedTotal,
  type RequestPricingContext,
} from '@/lib/negotiationTermSnapshot';
import {
  getPosterThreadNegotiationFlags,
  posterShouldShowCounterButton,
} from '@/lib/posterOfferThreadUi';
import { formatRequestDateRangeLine } from '@/lib/formatRequestSummaryDates';
import { splitRequestDisplayTitle } from '@/lib/splitRequestDisplayTitle';
import { billingDayCountForRequest } from '@/lib/requestPriceContext';
import type { SupabaseRequestChatMessageRow } from '@/lib/supabaseRequestChatMessages';
import { fetchRequestChatMessagesFromSupabase } from '@/lib/supabaseRequestChatMessages';
import {
  addRenterAcceptsPosterProposed,
  countOffersForRequest,
  declineOffer,
  getOfferUserPreview,
  getOffersForRequest,
  posterCounterOffersRemainingForRenter,
  useOffersStore,
} from '@/store/offersStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  getEffectiveRentalStatus,
  getRequestBySupabaseId,
  getRequestByTimestamp,
} from '@/store/requestsStore';
import {
  outlinePrimaryPressed,
  primarySolidPressed,
  subtleControlPressed,
  ui,
} from '@/constants/appUi';
import { mockDeclineReason, useDevPageAutofill } from '@/lib/devTools';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function getTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function extractTermLine(message: string | null | undefined, label: string): string | null {
  const text = String(message ?? '');
  if (!text) return null;
  const m = text.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'));
  const v = m?.[1]?.trim();
  return v && v.length > 0 ? v : null;
}

/** Single-line preview for compare cards only (full copy stays on offer detail). */
function comparePreviewOneLine(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const max = 118;
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function compareShowRatingRow(p: ReturnType<typeof getOfferUserPreview>): boolean {
  if (p.rating <= 0.05) return false;
  if (p.ratingReviewCount === 0) return false;
  return p.ratingReviewCount == null || p.ratingReviewCount > 0;
}

function parseMoneyFromTextLine(value: string | null): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Reads optional verification photo URL from synced offer row fields (UI-only). */
function readOfferVerificationPhotoUri(o: Offer): string | null {
  const r = o as unknown as Record<string, unknown>;
  const keys = [
    'verification_photo_url',
    'verificationPhotoUrl',
    'verification_photo',
    'timestamp_verification_photo_url',
  ] as const;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function scheduleNavigateToRentalWorkspace(
  result: FinalizeOfferAcceptanceResult,
  navOnceRef: { current: boolean }
) {
  if (!result.ok) return;
  if (navOnceRef.current) return;
  navOnceRef.current = true;
  setTimeout(() => {
    if ('rentalId' in result && result.rentalId) {
      router.replace({ pathname: '/rental/[id]', params: { id: result.rentalId } });
      return;
    }
    if ('rentalAgreementFallback' in result && result.rentalAgreementFallback) {
      const p = result.rentalAgreementFallback;
      router.replace({
        pathname: '/rental-agreement',
        params: {
          requestId: p.requestId,
          offerId: p.offerId,
          price: p.price,
        },
      });
    }
  }, 1000);
}

export default function OfferDetailScreen() {
  const insets = useSafeAreaInsets();
  /** Avoid stacking SafeArea top + ScreenWrapper padding with TransactionHeader insets. */
  const offerScreenWrapperStyle = useMemo(
    () => [styles.screenWrap, { paddingTop: 0, paddingHorizontal: 0 }],
    []
  );
  const params = useLocalSearchParams<{
    requestId?: string | string[];
    request_id?: string | string[];
    offerId?: string | string[];
    offer_id?: string | string[];
    id?: string | string[];
    view?: string | string[];
    compare?: string | string[];
  }>();
  const requestIdStr = (
    firstParam(params.requestId) ??
    firstParam(params.request_id) ??
    ''
  ).trim();
  const offerIdTrim = (
    firstParam(params.offerId) ??
    firstParam(params.offer_id) ??
    firstParam(params.id) ??
    ''
  ).trim();
  const compareParam = firstParam(params.compare) === '1';
  const [tick, setTick] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [verificationViewerUri, setVerificationViewerUri] = useState<string | null>(null);
  const [linkedRentalId, setLinkedRentalId] = useState<string | null>(null);
  const [linkedRentalLoading, setLinkedRentalLoading] = useState(false);
  const [lifecycleNow, setLifecycleNow] = useState(() => Date.now());
  const [finalizeNegotiationBusy, setFinalizeNegotiationBusy] = useState(false);
  const [postAcceptRedirectPending, setPostAcceptRedirectPending] = useState(false);
  const [offerLookupLoading, setOfferLookupLoading] = useState(false);
  const [offerLookupAttempted, setOfferLookupAttempted] = useState(false);
  const [counterReceivedByOfferId, setCounterReceivedByOfferId] = useState<
    Record<string, string[] | null>
  >({});
  const [proposalDeclinedByOfferId, setProposalDeclinedByOfferId] = useState<
    Record<string, { reason: string | null } | null>
  >({});
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [declineTargetOfferId, setDeclineTargetOfferId] = useState<string | null>(null);
  const [declineReasonDraft, setDeclineReasonDraft] = useState('');
  const postAcceptNavOnceRef = useRef(false);
  const acceptFinalizeBusyRef = useRef(false);

  const devAutofillOfferDetail = useCallback(() => {
    setDeclineReasonDraft(mockDeclineReason());
    setDeclineModalVisible(true);
    showFeedbackToast('Dev: decline draft filled (submit separately)');
  }, []);

  useDevPageAutofill(devAutofillOfferDetail, { screenLabel: 'Offer detail' });

  const offersFromStore = useOffersStore((s) => s.offers);

  const offer = useMemo(() => {
    if (offerIdTrim.length === 0) return undefined;
    const byId = offersFromStore.find((o) => o.id === offerIdTrim);
    if (byId) return byId;
    const ts = Number(requestIdStr);
    if (!Number.isFinite(ts)) return undefined;
    const me = getAuthUserIdSync();
    if (typeof me === 'string' && me.length > 0) {
      const m = me.trim();
      return offersFromStore.find(
        (o) => o.requestId === ts && o.renterId.trim() === m
      );
    }
    return undefined;
  }, [offerIdTrim, requestIdStr, offersFromStore]);

  useEffect(() => {
    if (offerIdTrim.length === 0) return;
    if (offer) {
      setOfferLookupLoading(false);
      setOfferLookupAttempted(true);
      return;
    }

    let cancelled = false;
    setOfferLookupLoading(true);
    setOfferLookupAttempted(false);

    void (async () => {
      const sb = getSupabase();
      const { data: offerRow, error: offerErr } = await sb
        .from('offers')
        .select('id, request_id')
        .eq('id', offerIdTrim)
        .maybeSingle();

      if (cancelled) return;

      if (offerErr) {
        console.warn('[offer-detail] fallback offer fetch failed', {
          offerId: offerIdTrim,
          requestIdParam: requestIdStr,
          error: offerErr.message,
        });
        setOfferLookupLoading(false);
        setOfferLookupAttempted(true);
        return;
      }

      const offerRequestIdRaw =
        offerRow && typeof (offerRow as { request_id?: unknown }).request_id === 'string'
          ? ((offerRow as { request_id: string }).request_id || '').trim()
          : '';
      const requestRowId =
        offerRequestIdRaw ||
        (isUuidString(requestIdStr) ? requestIdStr : '');

      let appRequestTimestamp: number | null = null;
      const fromRequestParamNumeric = Number(requestIdStr);
      if (Number.isFinite(fromRequestParamNumeric)) {
        appRequestTimestamp = fromRequestParamNumeric;
      }
      if (appRequestTimestamp == null && requestRowId) {
        const reqFromStore = getRequestBySupabaseId(requestRowId);
        const t = (reqFromStore as { timestamp?: number } | undefined)?.timestamp;
        if (typeof t === 'number' && Number.isFinite(t)) appRequestTimestamp = t;
      }
      if (appRequestTimestamp == null && requestRowId) {
        const { data: reqRow, error: reqErr } = await sb
          .from('requests')
          .select('created_at')
          .eq('id', requestRowId)
          .maybeSingle();
        if (cancelled) return;
        if (reqErr) {
          console.warn('[offer-detail] fallback request fetch failed', {
            offerId: offerIdTrim,
            requestRowId,
            error: reqErr.message,
          });
        } else if (reqRow && typeof (reqRow as { created_at?: unknown }).created_at === 'string') {
          const t = Date.parse((reqRow as { created_at: string }).created_at);
          if (Number.isFinite(t)) appRequestTimestamp = t;
        }
      }

      if (requestRowId && appRequestTimestamp != null) {
        const synced = await syncRequestAndOffersFromSupabase(requestRowId, appRequestTimestamp);
        if (__DEV__) {
          console.log('[offer-detail] fallback sync', {
            offerId: offerIdTrim,
            requestRowId,
            appRequestTimestamp,
            synced,
          });
        }
      } else {
        console.warn('[offer-detail] fallback sync skipped: missing identifiers', {
          offerId: offerIdTrim,
          requestIdParam: requestIdStr,
          requestRowId,
          appRequestTimestamp,
        });
      }

      if (cancelled) return;
      setOfferLookupLoading(false);
      setOfferLookupAttempted(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [offer, offerIdTrim, requestIdStr]);

  useEffect(() => {
    if (viewerVisible && Array.isArray(offer?.offer_images)) {
      console.log('VIEWER IMAGES:', offer.offer_images);
    }
  }, [viewerVisible, offer?.offer_images]);

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
      setLifecycleNow(Date.now());
    }, [])
  );

  useEffect(() => {
    const id = setInterval(() => setLifecycleNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const request = useMemo(() => {
    void tick;
    if (requestIdStr) {
      if (isUuidString(requestIdStr)) {
        const u = getRequestBySupabaseId(requestIdStr);
        if (u) return u;
      }
      const n = Number(requestIdStr);
      if (Number.isFinite(n)) {
        const t = getRequestByTimestamp(n);
        if (t) return t;
      }
    }
    if (offer) return getRequestByTimestamp(offer.requestId);
    return undefined;
  }, [requestIdStr, tick, offer]);

  useEffect(() => {
    if (!offer || !request) return;
    if (!request.matched) return;
    const accId = (request as { acceptedOfferId?: string }).acceptedOfferId;
    if (accId !== offer.id) return;
    let cancelled = false;
    setLinkedRentalLoading(true);
    void (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('rentals').select('id').eq('offer_id', offer.id).maybeSingle();
      if (cancelled) return;
      setLinkedRentalLoading(false);
      if (data && typeof (data as { id?: string }).id === 'string') {
        setLinkedRentalId((data as { id: string }).id);
      } else {
        setLinkedRentalId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offer?.id, request, tick]);

  const posterRemaining = useMemo(() => {
    if (!offer || !request?.id) return 0;
    return posterCounterOffersRemainingForRenter(request.id, offer.renterId);
  }, [offer, request, offersFromStore]);

  const historyEntries = useMemo(() => {
    if (!offer?.messageHistory?.length) return [];
    return [...offer.messageHistory].sort((a, b) => b.at - a.at);
  }, [offer]);

  const me = getAuthUserIdSync();
  const meTrim = typeof me === 'string' ? me.trim() : '';
  const rentalStatus = request ? getEffectiveRentalStatus(request) : 'pending';
  const matched = !!request?.matched;
  const isAcceptedOffer =
    matched &&
    request != null &&
    offer != null &&
    typeof (request as { acceptedOfferId?: string }).acceptedOfferId === 'string' &&
    (request as { acceptedOfferId: string }).acceptedOfferId === offer.id;
  const isViewerPoster =
    !!request &&
    meTrim.length > 0 &&
    String(getRequestOwnerId(request as Record<string, unknown>) ?? '').trim() === meTrim;
  const isRenterOnThread =
    !!offer && meTrim.length > 0 && offer.renterId.trim() === meTrim;
  const lastMoverIsMe =
    offer != null &&
    meTrim.length > 0 &&
    String(offer.lastUpdatedBy ?? '').trim() === meTrim;
  const isPosterCounter = !!(offer && isViewerPoster && lastMoverIsMe);
  const posterCanRespond =
    !!offer &&
    isViewerPoster &&
    !lastMoverIsMe &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const renterCanRespond =
    !!offer &&
    typeof me === 'string' &&
    me.length > 0 &&
    offer.renterId.trim() === me &&
    !lastMoverIsMe &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const renterIsWaitingOwnerConfirm =
    !!offer &&
    isRenterOnThread &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending_confirmation';
  const posterCanConfirmRental =
    !!offer &&
    isViewerPoster &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending_confirmation';
  const canAcceptCurrent = !!(
    isViewerPoster &&
    offer &&
    !matched &&
    offer.status === 'pending' &&
    rentalStatus === 'pending' &&
    offer.lastUpdatedBy === offer.renterId
  );
  const posterCanManagePendingOffer =
    !!offer &&
    isViewerPoster &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const isPendingOffer =
    !!offer &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const isNegotiationParticipant = isViewerPoster || isRenterOnThread;
  const showIncomingNegotiationActions =
    isPendingOffer && isNegotiationParticipant && !lastMoverIsMe;
  const showOutgoingPendingActions =
    isPendingOffer && isNegotiationParticipant && lastMoverIsMe;
  const showPendingActionBar =
    !!offer &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const isTerminalNegotiation =
    !!offer &&
    !matched &&
    rentalStatus === 'pending' &&
    (offer.status === 'declined' || offer.status === 'closed');
  const negotiationLockedOut = offer?.negotiationLocked === true;
  const footerShows =
    showIncomingNegotiationActions || showOutgoingPendingActions || posterCanConfirmRental;

  const showStickyPosterCounterButton =
    !!offer &&
    isViewerPoster &&
    posterShouldShowCounterButton(
      offer,
      getPosterThreadNegotiationFlags(offer, { matched, rentalStatus, meTrim }),
      { matched, rentalStatus, posterCounterRemaining: posterRemaining }
    );

  const requestTimestampForOffers = useMemo(() => {
    if (!request) return null;
    const ts = (request as { timestamp?: unknown }).timestamp;
    if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
    if (offer) return offer.requestId;
    return null;
  }, [request, offer]);

  const posterDecisionOffers = useMemo(() => {
    if (!isViewerPoster || matched || rentalStatus !== 'pending') return [];
    if (requestTimestampForOffers == null) return [];
    return getOffersForRequest(requestTimestampForOffers);
  }, [isViewerPoster, matched, rentalStatus, requestTimestampForOffers, offersFromStore]);

  const posterHasMultipleComparableOffers =
    !!offer &&
    isViewerPoster &&
    !matched &&
    rentalStatus === 'pending' &&
    posterDecisionOffers.length > 1;

  const isOfferCompareMode = posterHasMultipleComparableOffers && compareParam;

  const viewParam = firstParam(params.view);
  useLayoutEffect(() => {
    if (!request || !offer) return;
    if (isOfferCompareMode) return;
    if (viewParam === 'full') return;
    const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
    const rid =
      typeof rowId === 'string' && rowId.trim().length > 0 ? rowId.trim() : requestIdStr.trim();
    const requestIdForRoute = (rid.length > 0 ? rid : requestIdStr).trim();
    router.replace({
      pathname: '/offer-detail',
      params: {
        requestId: requestIdForRoute,
        offerId: String(offer.id),
        view: 'full',
      },
    });
  }, [request, offer, isOfferCompareMode, viewParam, requestIdStr, offer?.id]);

  const requestPricingForSort = useMemo((): RequestPricingContext | null => {
    if (!request) return null;
    return {
      how: request.how,
      deliveryFee: request.deliveryFee,
      pickupDate: (request as { pickupDate?: string }).pickupDate,
      returnDate: (request as { returnDate?: string }).returnDate,
      location: request.location,
      pickupRadiusMiles: (request as { pickupRadiusMiles?: number }).pickupRadiusMiles,
    };
  }, [request]);

  const compareSortedOffers = useMemo(() => {
    if (!isOfferCompareMode || !requestPricingForSort) return [];
    return sortOffersByLowestNegotiatedTotal(posterDecisionOffers, requestPricingForSort);
  }, [isOfferCompareMode, posterDecisionOffers, requestPricingForSort]);

  const offersForThreadChatDerived = useMemo(() => {
    if (!request || matched || rentalStatus !== 'pending') return [];
    const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
    if (!rowId) return [];
    const meTrimLoop = String(me ?? '').trim();
    if (!meTrimLoop) return [];
    if (isViewerPoster) {
      if (requestTimestampForOffers == null) return [];
      const list = getOffersForRequest(requestTimestampForOffers);
      if (list.length > 1 && compareParam) return [];
      if (list.length > 1 && offer) return [offer];
      return offer ? [offer] : [];
    }
    if (offer && isRenterOnThread) return [offer];
    return [];
  }, [
    request,
    matched,
    rentalStatus,
    me,
    offer,
    isViewerPoster,
    isRenterOnThread,
    requestTimestampForOffers,
    offersFromStore,
    compareParam,
  ]);

  const handleAcceptOffer = () => {
    if (!isViewerPoster || !showIncomingNegotiationActions || !request || !offer) return;
    if (offer.negotiationLocked) return;
    if (finalizeNegotiationBusy || postAcceptRedirectPending || acceptFinalizeBusyRef.current) return;
    if (!getRequestSupabaseRowId(request as Record<string, unknown>)) {
      showFeedbackToast('This request is not linked to the server. Open the request from Activity and try again.');
      return;
    }
    const priceLabel = formatUsd(getNumericOfferPrice(offer));
    const doAccept = () => {
      void (async () => {
        if (acceptFinalizeBusyRef.current) return;
        acceptFinalizeBusyRef.current = true;
        setFinalizeNegotiationBusy(true);
        try {
          const r = await finalizeOfferAcceptance(offer.requestId, String(offer.id));
          if (!r.ok) {
            acceptFinalizeBusyRef.current = false;
            showFeedbackToast(
              r.error && r.error.length > 0
                ? r.error
                : 'Could not complete accept. Check connection and try again.',
            );
            return;
          }
          if ('rentalId' in r && r.rentalId) setLinkedRentalId(r.rentalId);
          setPostAcceptRedirectPending(true);
          showFeedbackToast('Offer accepted');
          scheduleNavigateToRentalWorkspace(r, postAcceptNavOnceRef);
        } finally {
          setFinalizeNegotiationBusy(false);
        }
      })();
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Accept this offer for ${priceLabel}?`)) {
        doAccept();
      }
      return;
    }
    Alert.alert('Accept offer', `Accept this offer for ${priceLabel}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: doAccept },
    ]);
  };

  const onDecline = () => {
    if (!offer || !request) return;
    if (offer.negotiationLocked) return;
    if (finalizeNegotiationBusy || postAcceptRedirectPending || acceptFinalizeBusyRef.current) return;
    const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
    if (!rowId) {
      showFeedbackToast(
        'This request is not linked to the server. Open the request from Activity and try again.',
      );
      return;
    }
    const isOutgoingPending =
      offer.status === 'pending' && !matched && (isViewerPoster || isRenterOnThread) && lastMoverIsMe;
    const withdrawTitle = 'Close this negotiation?';
    const withdrawMessage =
      'If you continue, this negotiation ends. The thread becomes read-only—you won’t be able to accept, counter, or modify it—and the other party will see it as closed.';

    const runWithdraw = () => {
      void (async () => {
        const ok = await declineOffer(offer.requestId, offer.id, { intent: 'withdraw' });
        if (ok) {
          showFeedbackToast('Offer withdrawn');
        } else {
          showFeedbackToast('Could not update this offer. Check connection and try again.');
        }
      })();
    };

    if (isOutgoingPending) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const ok = window.confirm(`${withdrawTitle}\n\n${withdrawMessage}`);
        if (ok) runWithdraw();
        return;
      }
      Alert.alert(withdrawTitle, withdrawMessage, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close negotiation', style: 'destructive', onPress: runWithdraw },
      ]);
      return;
    }

    setDeclineReasonDraft('');
    setDeclineTargetOfferId(offer.id);
    setDeclineModalVisible(true);
  };

  const submitDeclineProposal = () => {
    if (!request) return;
    const target =
      (declineTargetOfferId ? offersFromStore.find((x) => x.id === declineTargetOfferId) : undefined) ??
      offer;
    if (!target) return;
    void (async () => {
      const ok = await declineOffer(target.requestId, target.id, {
        intent: 'decline_proposal',
        reason: declineReasonDraft.trim() || undefined,
      });
      setDeclineModalVisible(false);
      setDeclineTargetOfferId(null);
      if (ok) {
        showFeedbackToast('Proposal declined');
      } else {
        showFeedbackToast('Could not update this offer. Check connection and try again.');
      }
    })();
  };

  const onCounterOfferPress = () => {
    if (!offer || !request) return;
    if (offer.negotiationLocked) {
      showFeedbackToast('Negotiation is closed.');
      return;
    }
    if (finalizeNegotiationBusy || postAcceptRedirectPending || acceptFinalizeBusyRef.current) return;
    const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
    if (!rowId) {
      showFeedbackToast('This request is not linked to the server. Open the request from Activity and try again.');
      return;
    }
    if (isViewerPoster && posterRemaining <= 0) {
      Alert.alert(
        'No counters left',
        'You have used the maximum number of counter-offers for this thread.',
      );
      return;
    }
    router.push({
      pathname: '/counter-offer',
      params: { requestId: rowId, offerId: String(offer.id) },
    });
  };

  const onAcceptCounter = () => {
    if (!offer || !renterCanRespond) return;
    if (finalizeNegotiationBusy || postAcceptRedirectPending || acceptFinalizeBusyRef.current) return;
    void (async () => {
      const ok = await addRenterAcceptsPosterProposed(offer.id);
      if (ok) {
        showFeedbackToast('Owner will confirm the rental next.');
      } else {
        showFeedbackToast('Could not accept. Check connection and try again.');
      }
    })();
  };

  const onConfirmRental = () => {
    if (!posterCanConfirmRental || !request || !offer) {
      console.warn('Confirm rental: early exit (state does not allow confirm)', {
        posterCanConfirmRental,
        hasRequest: !!request,
        hasOffer: !!offer,
      });
      return;
    }
    if (finalizeNegotiationBusy || postAcceptRedirectPending || acceptFinalizeBusyRef.current) return;
    if (!getRequestSupabaseRowId(request as Record<string, unknown>)) {
      showFeedbackToast('This request is not linked to the server. Open the request from Activity and try again.');
      return;
    }
    const meTrim = (typeof me === 'string' ? me : '').trim();
    const ownerId = getRequestOwnerId(request as Record<string, unknown>)?.trim() ?? '';
    if (meTrim === '' || ownerId === '' || meTrim !== ownerId) {
      console.warn('User not allowed to confirm rental', { me: meTrim, requestOwnerId: ownerId });
      showFeedbackToast('Only the request owner can confirm the rental.');
      return;
    }
    const priceNum = getNumericOfferPrice(offer);
    const priceLabel = formatUsd(priceNum);

    const runFinalize = () => {
      void (async () => {
        if (acceptFinalizeBusyRef.current) return;
        acceptFinalizeBusyRef.current = true;
        setFinalizeNegotiationBusy(true);
        try {
          const r = await finalizeOfferAcceptance(offer.requestId, String(offer.id));
          if (!r.ok) {
            console.error('CONFIRM RENTAL ERROR', r.error);
            acceptFinalizeBusyRef.current = false;
            showFeedbackToast(
              r.error && r.error.length > 0
                ? r.error
                : 'Could not confirm. Check connection and try again.'
            );
            return;
          }
          if ('rentalId' in r && r.rentalId) setLinkedRentalId(r.rentalId);
          setPostAcceptRedirectPending(true);
          showFeedbackToast('Agreement confirmed');
          scheduleNavigateToRentalWorkspace(r, postAcceptNavOnceRef);
        } catch (e) {
          console.error('CONFIRM RENTAL ERROR', e);
          acceptFinalizeBusyRef.current = false;
          showFeedbackToast('Could not confirm. Check connection and try again.');
        } finally {
          setFinalizeNegotiationBusy(false);
        }
      })();
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Finalize this match for ${priceLabel}?`)) {
        runFinalize();
      }
      return;
    }
    Alert.alert('Confirm rental', `Finalize this match for ${priceLabel}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm rental', onPress: runFinalize },
    ]);
  };

  useEffect(() => {
    if (offerIdTrim.length === 0) return;
    if (offerLookupLoading || !offerLookupAttempted) return;
    if (offer && request) return;
    console.warn('[offer-detail] lookup failed', {
      offerId: offerIdTrim,
      requestIdParam: requestIdStr,
      hasOffer: !!offer,
      hasRequest: !!request,
      offersInStore: offersFromStore.length,
    });
  }, [
    offerIdTrim,
    requestIdStr,
    offerLookupLoading,
    offerLookupAttempted,
    offer,
    request,
    offersFromStore.length,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targets = offersForThreadChatDerived;
      const rowId = request ? getRequestSupabaseRowId(request as Record<string, unknown>) : null;
      if (!request || !rowId || matched || rentalStatus !== 'pending' || targets.length === 0) {
        if (!cancelled) {
          setCounterReceivedByOfferId({});
          setProposalDeclinedByOfferId({});
        }
        return;
      }
      const meTrimLoop = String(me ?? '').trim();
      if (!meTrimLoop) {
        if (!cancelled) {
          setCounterReceivedByOfferId({});
          setProposalDeclinedByOfferId({});
        }
        return;
      }
      const participates = isViewerPoster || (offer != null && isRenterOnThread);
      if (!participates) {
        if (!cancelled) {
          setCounterReceivedByOfferId({});
          setProposalDeclinedByOfferId({});
        }
        return;
      }

      const nextCounter: Record<string, string[] | null> = {};
      const nextProposal: Record<string, { reason: string | null } | null> = {};

      for (const o of targets) {
        if (cancelled) return;
        const rows = await fetchRequestChatMessagesFromSupabase(rowId, o.id);
        if (cancelled) return;

        if (o.status === 'pending' && String(o.lastUpdatedBy ?? '').trim() !== meTrimLoop) {
          const timeline = filterNegotiationDiffRows((rows ?? []) as SupabaseRequestChatMessageRow[]);
          if (timeline.length < 2) {
            nextCounter[o.id] = null;
          } else {
            const last = timeline[timeline.length - 1];
            const prev = timeline[timeline.length - 2];
            if (String(last.author_id ?? '').trim() === meTrimLoop) {
              nextCounter[o.id] = null;
            } else {
              const beforeSnap = snapshotFromNegotiationMessageRow(
                prev,
                request as RequestPricingContext
              );
              const afterSnap = snapshotFromNegotiationMessageRow(
                last,
                request as RequestPricingContext
              );
              const counterpartyNoun = isViewerPoster ? 'lender' : 'owner';
              const lines = negotiationChangeBullets(beforeSnap, afterSnap, 'incoming', {
                counterpartyNoun,
              });
              nextCounter[o.id] = lines.length > 0 ? lines : null;
            }
          }
        } else {
          nextCounter[o.id] = null;
        }

        if (o.status !== 'pending' && o.status !== 'pending_confirmation') {
          nextProposal[o.id] = null;
          continue;
        }
        const timelineKinds = new Set([
          'initial',
          'renter_update',
          'poster_counter',
          'proposal_declined',
          'renter_accepts',
        ]);
        const timeline = (rows ?? []).filter((r) => timelineKinds.has(String(r.kind ?? '').trim()));
        if (timeline.length === 0) {
          nextProposal[o.id] = null;
          continue;
        }
        const last = timeline[timeline.length - 1];
        if (String(last.kind ?? '').trim() !== 'proposal_declined') {
          nextProposal[o.id] = null;
          continue;
        }
        if (String(last.author_id ?? '').trim() === meTrimLoop) {
          nextProposal[o.id] = null;
          continue;
        }
        nextProposal[o.id] = { reason: parseProposalDeclinedReason(last.body) };
      }

      if (!cancelled) {
        setCounterReceivedByOfferId(nextCounter);
        setProposalDeclinedByOfferId(nextProposal);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    offersForThreadChatDerived,
    request,
    matched,
    rentalStatus,
    me,
    isViewerPoster,
    isRenterOnThread,
    offer,
    tick,
  ]);

  if (offerIdTrim.length === 0) {
    return null;
  }

  if (!request || !offer) {
    if (offerLookupLoading || !offerLookupAttempted) {
      return (
        <ScreenWrapper style={offerScreenWrapperStyle} edges={['left', 'right']}>
          <View style={{ flex: 1 }}>
            <ScreenEntrance style={styles.entranceFillCentered}>
              <ActivityIndicator size="small" color={ui.primary} />
              <Text style={styles.muted}>Loading offer...</Text>
            </ScreenEntrance>
          </View>
        </ScreenWrapper>
      );
    }
    return (
      <ScreenWrapper style={offerScreenWrapperStyle} edges={['left', 'right']}>
        <View style={{ flex: 1 }}>
          <ScreenEntrance style={styles.entranceFillCentered}>
            <Text style={styles.muted}>This offer is no longer available.</Text>
            <ScreenBackButton
              onPress={() => router.back()}
              style={styles.notFoundBack}
            />
          </ScreenEntrance>
        </View>
      </ScreenWrapper>
    );
  }

  const requestPricingCtx = requestPricingForSort as RequestPricingContext;

  const {
    method: negMethod,
    delivery: negFee,
    total: offerTotalWithDelivery,
  } = negotiatedOfferTotals(offer, requestPricingCtx);
  const offerDeliveryFee = negMethod === 'owner_delivery' ? negFee : 0;
  const negotiatedDeliverySummary = formatNegotiatedDeliverySummary({
    method: negMethod,
    fee: negMethod === 'owner_delivery' ? negFee : null,
  });
  const billDays = Math.max(
    1,
    billingDayCountForRequest(request as Parameters<typeof billingDayCountForRequest>[0])
  );
  const offerDailyRate = offerTotalWithDelivery / billDays;
  const lateFeePerDay = calculateDailyLateFee({
    totalAmount: offerTotalWithDelivery,
    durationDays: billDays,
  });
  const pickupDateLabel = String((request as { pickupDate?: unknown }).pickupDate ?? '').trim();
  const returnDateLabel = String((request as { returnDate?: unknown }).returnDate ?? '').trim();
  const brandModelText = extractTermLine(offer.message, 'Brand and model');
  const descriptionText =
    extractTermLine(offer.message, 'Description') ??
    (offer.toolDescription?.trim().length ? offer.toolDescription.trim() : null);
  const replacementValueText = extractTermLine(offer.message, 'Replacement value');
  const verificationPhotoUri = readOfferVerificationPhotoUri(offer);
  const currentOfferStatusNote =
    offer.negotiationLocked
      ? 'Closed'
      : offer.status === 'closed'
      ? 'Withdrawn'
      : offer.status === 'declined'
      ? 'Negotiation closed'
      : offer.status === 'pending_confirmation'
        ? isViewerPoster
          ? 'Renter accepted your counter — confirm the rental in the bar below.'
          : 'You accepted the counter. Waiting for the owner to confirm.'
        : null;
  const hasCurrentOfferDetails = !!(
    offer.message?.trim() ||
    (!(matched && isAcceptedOffer) && currentOfferStatusNote)
  );
  const replacementValueNum = parseMoneyFromTextLine(replacementValueText);
  const estimatedPreauth =
    replacementValueNum != null ? calculatePreauthAmount(replacementValueNum) : null;
  const offerUser = getOfferUserPreview(offer);
  const ownerDistanceLabel =
    typeof (request as { pickupRadiusMiles?: unknown }).pickupRadiusMiles === 'number' &&
    Number.isFinite((request as { pickupRadiusMiles?: number }).pickupRadiusMiles)
      ? `Within ${Math.max(1, Math.round(Number((request as { pickupRadiusMiles?: number }).pickupRadiusMiles)))} miles`
      : 'Distance flexible';
  const canAcceptPendingAsPoster =
    !!offer && isViewerPoster && !matched && rentalStatus === 'pending' && offer.status === 'pending';

  const showFinalizedOfferLayout = matched && isAcceptedOffer;
  const ownerUserIdForName = getRequestOwnerId(request as Record<string, unknown>) ?? '';
  const counterpartyDisplayName = (() => {
    if (isViewerPoster) {
      const n = offerUser.name.trim();
      return n.length > 0 ? n : 'the equipment owner';
    }
    const n = getProfileNameForUserId(ownerUserIdForName).trim();
    if (!n || n === '—' || n === PROFILE_NAME_FALLBACK) return 'the request owner';
    return n;
  })();

  function openRentalWorkspace() {
    if (!offer) return;
    const offerId = offer.id;
    const go = (id: string) => {
      router.push({ pathname: '/rental/[id]', params: { id } });
    };
    if (linkedRentalId) {
      go(linkedRentalId);
      return;
    }
    void (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('rentals').select('id').eq('offer_id', offerId).maybeSingle();
      const id = data && typeof (data as { id?: string }).id === 'string' ? (data as { id: string }).id : null;
      if (id) {
        setLinkedRentalId(id);
        go(id);
        return;
      }
      showFeedbackToast('Open your rental from Activity › Rentals.');
      try {
        await scheduleActivityRentalsIntent(isViewerPoster ? 'renting' : isRenterOnThread ? 'listing' : 'renting');
      } catch {
        // still open Activity
      }
      router.push('/(tabs)/activity');
    })();
  }

  const historyStatusNote = showFinalizedOfferLayout ? null : currentOfferStatusNote;

  const showAcceptTransitionBar =
    (finalizeNegotiationBusy || postAcceptRedirectPending) && !matched;
  const requestTitleFull = String(request.toolName ?? '').trim() || 'Equipment request';
  const { primary: requestPrimaryTitle, context: requestTitleContext } =
    splitRequestDisplayTitle(requestTitleFull);
  const offersOnRequestCount = countOffersForRequest(offer.requestId);
  const requestListedTotal =
    typeof (request as { totalPrice?: unknown }).totalPrice === 'number' &&
    Number.isFinite((request as { totalPrice: number }).totalPrice)
      ? (request as { totalPrice: number }).totalPrice
      : 0;
  const listedDailyRate = billDays > 0 ? requestListedTotal / billDays : 0;
  const extraOfferImages =
    Array.isArray(offer.offer_images) ? offer.offer_images : [];

  const deepDetailBlock =
    request && offer ? (
      <OfferDeepDetailBody
        scheduleRangeTitle={formatRequestDateRangeLine(pickupDateLabel, returnDateLabel)}
        durationLabel={formatDurationDisplay(request)}
        offerDailyRateLabel={`${formatUsd(offerDailyRate)} / day`}
        negotiatedDeliverySummary={negotiatedDeliverySummary}
        ownerDistanceLabel={ownerDistanceLabel}
        requestLocationDisplay={request.location?.trim() ? request.location.trim() : '—'}
        brandModelText={brandModelText}
        descriptionText={descriptionText}
        replacementValueText={replacementValueText}
        estimatedPreauth={estimatedPreauth}
        lateFeePerDay={lateFeePerDay}
        extraOfferImages={extraOfferImages}
        verificationPhotoUri={verificationPhotoUri}
        onVerificationPhotoPress={() => {
          if (verificationPhotoUri) setVerificationViewerUri(verificationPhotoUri);
        }}
        historyEntries={historyEntries}
        hasCurrentOfferDetails={hasCurrentOfferDetails}
        historyStatusNote={historyStatusNote}
        offerMessageTrimmed={String(offer.message ?? '').trim()}
        onGalleryImagePress={(i) => {
          setViewerIndex(i);
          setViewerVisible(true);
        }}
      />
    ) : null;

  const decisionRequestSummarySegments: string[] = [];
  if (listedDailyRate > 0) decisionRequestSummarySegments.push(`${formatUsd(listedDailyRate)}/day`);
  decisionRequestSummarySegments.push(formatDurationDisplay(request));
  decisionRequestSummarySegments.push(formatHowDisplay(request));
  const decisionRequestSummaryLine = `${isViewerPoster ? 'Your request: ' : 'This request: '}${decisionRequestSummarySegments.join(' • ')}`;

  /** Canonical offer thread: deep detail + negotiation controls (same route as `view=full`). */
  const navigateToThreadDecision = useCallback(
    (offerId: string) => {
      const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
      const rid =
        typeof rowId === 'string' && rowId.trim().length > 0 ? rowId.trim() : requestIdStr.trim();
      router.push({
        pathname: '/offer-detail',
        params: {
          requestId: (rid.length > 0 ? rid : requestIdStr).trim(),
          offerId,
          view: 'full',
        },
      });
    },
    [request, requestIdStr]
  );

  const scrollBottomPad = showAcceptTransitionBar
    ? 64 + insets.bottom
    : isOfferCompareMode
      ? 28 + insets.bottom
      : footerShows || showPendingActionBar
        ? (renterCanRespond && isRenterOnThread ? 132 : 124) + insets.bottom
        : renterIsWaitingOwnerConfirm
          ? 128 + insets.bottom
          : 28 + insets.bottom;

  const declineRoundOffer =
    (declineTargetOfferId ? offersFromStore.find((x) => x.id === declineTargetOfferId) : undefined) ??
    offer;

  const renderOfferDetailModals = () => (
    <>
      {Array.isArray(offer.offer_images) && offer.offer_images.length > 0 ? (
        <Modal
          visible={viewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setViewerVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'black' }}>
            <FlatList
              style={{ flex: 1 }}
              data={offer.offer_images}
              horizontal
              pagingEnabled
              getItemLayout={(_, index) => {
                const w = Dimensions.get('window').width;
                return {
                  length: w,
                  offset: w * index,
                  index,
                };
              }}
              keyExtractor={(_, i) => String(i)}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width
                );
                setViewerIndex(index);
              }}
              renderItem={({ item }) => {
                const { width: winW, height: winH } = Dimensions.get('window');
                return (
                  <View
                    style={{
                      width: winW,
                      height: winH,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: 'black',
                    }}
                  >
                    <Image
                      source={{ uri: item }}
                      style={{ width: winW, height: winH }}
                      contentFit="contain"
                    />
                  </View>
                );
              }}
            />

            <Pressable
              onPress={() => setViewerVisible(false)}
              style={{
                position: 'absolute',
                top: 50,
                right: 20,
              }}
            >
              <Text style={{ color: 'white', fontSize: 18 }}>Close</Text>
            </Pressable>

            <View
              style={{
                position: 'absolute',
                bottom: 40,
                flexDirection: 'row',
                alignSelf: 'center',
              }}
            >
              {offer.offer_images.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    margin: 4,
                    backgroundColor: i === viewerIndex ? 'white' : 'gray',
                  }}
                />
              ))}
            </View>
          </View>
        </Modal>
      ) : null}

      {verificationViewerUri ? (
        <Modal
          visible={!!verificationViewerUri}
          transparent
          animationType="fade"
          onRequestClose={() => setVerificationViewerUri(null)}
        >
          <View style={{ flex: 1, backgroundColor: 'black' }}>
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Image
                source={{ uri: verificationViewerUri }}
                style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.72 }}
                contentFit="contain"
              />
            </View>
            <Pressable
              onPress={() => setVerificationViewerUri(null)}
              style={{
                position: 'absolute',
                top: 50,
                right: 20,
              }}
            >
              <Text style={{ color: 'white', fontSize: 18 }}>Close</Text>
            </Pressable>
          </View>
        </Modal>
      ) : null}

      <Modal
        visible={declineModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeclineModalVisible(false);
          setDeclineTargetOfferId(null);
        }}
      >
        <View style={styles.declineModalBackdrop}>
          <View style={styles.declineModalCard}>
            <Text style={styles.declineModalTitle}>Confirm Decline</Text>
            <Text style={styles.declineModalBody}>Decline this proposal?</Text>
            <Text style={styles.declineModalHelper}>
              The other user may still submit another counter offer unless negotiation limits are reached.
            </Text>
            {declineRoundOffer && isFinalDeclineRoundBeforeAction(declineRoundOffer) ? (
              <View style={styles.declineModalFinalNote}>
                <Text style={styles.declineModalFinalNoteText}>
                  Final negotiation round: declining will close this negotiation permanently.
                </Text>
              </View>
            ) : null}
            <Text style={styles.declineModalLabel}>Optional reason</Text>
            <TextInput
              value={declineReasonDraft}
              onChangeText={setDeclineReasonDraft}
              placeholder="They'll see this in the thread"
              placeholderTextColor={ui.textSecondary}
              style={styles.declineModalInput}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <View style={styles.declineModalActions}>
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => {
                  setDeclineModalVisible(false);
                  setDeclineTargetOfferId(null);
                }}
                style={({ pressed }) => [
                  styles.declineModalCancelBtn,
                  pressed && outlinePrimaryPressed,
                ]}
              >
                <Text style={styles.declineModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={submitDeclineProposal}
                style={({ pressed }) => [
                  styles.declineModalConfirmBtn,
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text style={styles.declineModalConfirmText}>Decline Proposal</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );

  return (
    <ScreenWrapper style={offerScreenWrapperStyle} edges={['left', 'right']}>
      <View style={{ flex: 1, backgroundColor: ui.surfaceGrouped }}>
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: 0,
            paddingBottom: scrollBottomPad,
            paddingHorizontal: 0,
          }}
          showsVerticalScrollIndicator={true}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {isOfferCompareMode && !showFinalizedOfferLayout ? (
            <>
              <View style={styles.compareHeroBlock}>
                <TransactionHeader
                  density="compare"
                  topInset={insets.top}
                  onBack={() => router.back()}
                  rightAccessory={<OfferCountPill count={offersOnRequestCount} />}
                  title={requestPrimaryTitle}
                  titleContext={requestTitleContext ?? undefined}
                  subtitle="Browse offers — tap a card to open that lender’s thread"
                />
                <View style={styles.contentColumn}>
                  <OfferDecisionStatusStrip
                    density="compare"
                    headline={`${compareSortedOffers.length} OFFER${
                      compareSortedOffers.length === 1 ? '' : 'S'
                    } RECEIVED`}
                    requestLine={decisionRequestSummaryLine}
                  />
                </View>
              </View>
              <View style={[styles.contentColumn, styles.compareListColumn]}>
                <View style={styles.compareFutureToolbarSlot} />
                {compareSortedOffers.map((threadOffer, index) => {
              const tTotals = negotiatedOfferTotals(threadOffer, requestPricingCtx);
              const tTotalDelivery = tTotals.total;
              const tDaily = tTotalDelivery / billDays;
              const showBestValueBadge = index === 0;
              const tUser = getOfferUserPreview(threadOffer);
              const tBrand = extractTermLine(threadOffer.message, 'Brand and model');
              const tDesc =
                extractTermLine(threadOffer.message, 'Description') ??
                (threadOffer.toolDescription?.trim().length
                  ? threadOffer.toolDescription.trim()
                  : null);
              const tCond =
                threadOffer.message?.trim().split('\n').map((l) => l.trim()).find((line) =>
                  !/^(terms \(optional\)|brand and model:|description:|replacement value:|delivery method:|delivery fee:|daily late fee|late fees:)/i.test(
                    line
                  )
                ) ?? null;
              const tUpdated = getTimeAgo(threadOffer.updatedAt);
              const tImg =
                Array.isArray(threadOffer.offer_images) && threadOffer.offer_images.length > 0
                  ? threadOffer.offer_images[0]?.trim() || null
                  : null;
              const tMethod = tTotals.method;
              const tFee = tTotals.delivery;
              const deliveryMeta =
                tMethod === 'pickup'
                  ? 'Pickup'
                  : tFee <= 0
                    ? 'Free delivery'
                    : `${formatUsd(tFee)} delivery`;
              const ratingLine = compareShowRatingRow(tUser)
                ? `★ ${tUser.rating.toFixed(1)}`
                : undefined;
              const durationLabel = formatDurationDisplay(request);
              const priceSubline = `${formatUsd(tTotalDelivery)} total · ${durationLabel}`;

              return (
                <CompareOfferScanCard
                  key={threadOffer.id}
                  variant={index === 0 ? 'best' : 'neutral'}
                  ownerName={tUser.name}
                  ratingLine={ratingLine}
                  showBestValueBadge={showBestValueBadge}
                  pricePrimary={formatUsd(tTotalDelivery)}
                  priceSubline={priceSubline}
                  deliveryMeta={deliveryMeta}
                  distanceMeta={ownerDistanceLabel}
                  areaMeta={request.location?.trim() ? request.location.trim() : '—'}
                  listingTitle={tBrand || requestPrimaryTitle}
                  previewLine={comparePreviewOneLine(tDesc ?? tCond)}
                  timeAgo={tUpdated}
                  listingImageUri={tImg}
                  onPress={() => navigateToThreadDecision(String(threadOffer.id))}
                />
              );
            })}
                {matched && !isAcceptedOffer ? (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                      This request is already matched with another offer.
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <TransactionHeader
                topInset={insets.top}
                onBack={() => router.back()}
                rightAccessory={<UserNamePill name={offerUser.name} />}
                title={requestPrimaryTitle}
                titleContext={requestTitleContext ?? undefined}
                subtitle="Review details, photos & terms and respond to the offer"
                density="compact"
              />
              <View style={styles.contentColumn}>
        {renterIsWaitingOwnerConfirm ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Waiting for owner confirmation. You will be notified when they confirm the rental.
            </Text>
          </View>
        ) : null}

        {!isOfferCompareMode && posterCanConfirmRental ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              The renter accepted your counter. Confirm the rental below to match and open the
              agreement.
            </Text>
          </View>
        ) : null}

        {negotiationLockedOut && isRenterOnThread ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Negotiation closed</Text>
            <Text style={styles.noticeText}>
              This request is no longer accepting offers from you.
            </Text>
          </View>
        ) : !isOfferCompareMode && negotiationLockedOut && isViewerPoster ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Negotiation closed</Text>
            <Text style={styles.noticeText}>
              This thread is permanently closed with this lender.
            </Text>
          </View>
        ) : !isOfferCompareMode && isTerminalNegotiation && offer.status === 'closed' && !negotiationLockedOut ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Offer withdrawn</Text>
            <Text style={styles.noticeText}>This negotiation has been closed.</Text>
            {cooldownRemainingAfterWithdrawMs(offer, lifecycleNow) > 0 ? (
              <Text style={[styles.noticeText, { marginTop: 8 }]}>
                You can make a new offer in{' '}
                {formatNegotiationCooldownRemaining(cooldownRemainingAfterWithdrawMs(offer, lifecycleNow))}.
              </Text>
            ) : null}
            {isRenterOnThread &&
            canCreateNewOfferThreadAfterWithdraw(offer, lifecycleNow).ok &&
            getRequestSupabaseRowId(request as Record<string, unknown>) ? (
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={() => {
                  const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
                  if (rowId) {
                    router.push({ pathname: '/make-offer', params: { requestId: rowId } });
                  }
                }}
                style={({ pressed }) => [
                  styles.agreementActiveButton,
                  { marginTop: 12 },
                  pressed && primarySolidPressed,
                ]}
              >
                <Text style={styles.agreementActiveButtonText}>Make New Offer</Text>
              </Pressable>
            ) : null}
          </View>
        ) : !isOfferCompareMode && isTerminalNegotiation ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Negotiation closed</Text>
            <Text style={styles.noticeText}>
              {offer.status === 'closed'
                ? 'This negotiation has ended.'
                : 'Negotiation limits were reached and this thread is closed.'}
            </Text>
          </View>
        ) : null}

        {!isOfferCompareMode &&
        offer &&
        !negotiationLockedOut &&
        !matched &&
        rentalStatus === 'pending' &&
        isNegotiationParticipant &&
        (offer.status === 'pending' || offer.status === 'pending_confirmation') &&
        (isFinalDeclineRoundBeforeAction(offer) || (isViewerPoster && posterRemaining === 1)) ? (
          <View style={styles.finalRoundBanner}>
            <Text style={styles.finalRoundTitle}>Final negotiation round</Text>
            {isFinalDeclineRoundBeforeAction(offer) ? (
              <Text style={styles.finalRoundBody}>
                If this proposal is declined, the negotiation will close permanently.
              </Text>
            ) : null}
            {isViewerPoster && posterRemaining === 1 ? (
              <Text
                style={[
                  styles.finalRoundBody,
                  isFinalDeclineRoundBeforeAction(offer) ? { marginTop: 8 } : null,
                ]}
              >
                This is your last counter on this thread.
              </Text>
            ) : null}
          </View>
        ) : null}

        {!isViewerPoster &&
        !isRenterOnThread &&
        !renterCanRespond &&
        rentalStatus === 'pending' &&
        !matched ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Only the request owner can accept, decline, or counter here.
            </Text>
          </View>
        ) : null}

        {!isOfferCompareMode && isViewerPoster && isPosterCounter && !matched ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              This is your counter-offer. It stays in the list with other offers.
            </Text>
          </View>
        ) : null}

        {offer ? (
          showFinalizedOfferLayout ? (
            <>
              <View style={styles.agreementActiveCard}>
                <Text style={styles.agreementActiveTitle}>✓ Agreement active</Text>
                <Text style={styles.agreementActiveBody}>
                  You and {counterpartyDisplayName} are now coordinating meetup and rental details.
                </Text>
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  disabled={linkedRentalLoading}
                  onPress={openRentalWorkspace}
                  style={({ pressed }) => [
                    styles.agreementActiveButton,
                    pressed && !linkedRentalLoading && primarySolidPressed,
                    linkedRentalLoading && styles.agreementActiveButtonDisabled,
                  ]}
                >
                  <Text style={styles.agreementActiveButtonText}>Open Rental Workspace</Text>
                </Pressable>
              </View>
              {deepDetailBlock}
            </>
          ) : (
            <>
              {proposalDeclinedByOfferId[offer.id] != null ? (
                <View style={styles.threadProposalDeclined}>
                  <Text style={styles.threadProposalDeclinedTitle}>Proposal declined</Text>
                  {proposalDeclinedByOfferId[offer.id]?.reason ? (
                    <>
                      <Text style={styles.threadProposalDeclinedSubtitle}>Optional reason:</Text>
                      <Text style={styles.threadProposalDeclinedReason}>
                        {proposalDeclinedByOfferId[offer.id]?.reason}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.threadProposalDeclinedMeta}>No reason was provided.</Text>
                  )}
                  <Text style={styles.threadProposalDeclinedHint}>
                    You can still accept the last terms or send a counter while negotiation limits allow.
                  </Text>
                </View>
              ) : null}
              {(counterReceivedByOfferId[offer.id] ?? []).length > 0 ? (
                <View style={styles.threadCounterInset}>
                  <Text style={styles.threadCounterInsetTitle}>Counter updated</Text>
                  <Text style={styles.threadCounterInsetSubtitle}>Updated terms:</Text>
                  {(counterReceivedByOfferId[offer.id] ?? []).map((line, i) => (
                    <Text key={`${i}-${line.slice(0, 24)}`} style={styles.threadCounterInsetBullet}>
                      • {line}
                    </Text>
                  ))}
                </View>
              ) : null}
              {deepDetailBlock}
            </>
          )
        ) : null}

        {matched && !isAcceptedOffer ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              This request is already matched with another offer.
            </Text>
          </View>
        ) : null}
              </View>
            </>
          )}
        </ScrollView>
      </View>

      {showAcceptTransitionBar ? (
        <StickyActionBar bottomInset={insets.bottom} contentPaddingTop={10}>
          <View
            style={[
              styles.acceptTransitionFooter,
              postAcceptRedirectPending && !finalizeNegotiationBusy && styles.acceptTransitionFooterDimmed,
            ]}
            pointerEvents="none"
          >
            <View style={styles.acceptTransitionRow}>
              <ActivityIndicator size="small" color={ui.primary} />
              <Text style={styles.acceptTransitionText}>
                {finalizeNegotiationBusy ? 'Finalizing agreement…' : 'Opening rental workspace…'}
              </Text>
            </View>
          </View>
        </StickyActionBar>
      ) : isOfferCompareMode ? null : negotiationLockedOut || isTerminalNegotiation ? null : footerShows || showPendingActionBar ? (
        <StickyActionBar bottomInset={insets.bottom} contentPaddingTop={10}>
          {showPendingActionBar ? (
            showIncomingNegotiationActions ? (
              <View style={styles.footerActionRow}>
                <Pressable
                  pressOpacityFeedback={false}
                  disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                  onPress={onDecline}
                  style={({ pressed }) => [
                    styles.footerActionDestructive,
                    pressed && styles.footerActionDestructivePressed,
                    (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                  ]}
                >
                  <Text style={styles.footerActionDestructiveText}>Decline</Text>
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                  onPress={isViewerPoster ? handleAcceptOffer : onAcceptCounter}
                  style={({ pressed }) => [
                    styles.footerActionPrimary,
                    pressed && styles.footerActionPrimaryPressed,
                    (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                  ]}
                >
                  <Text style={styles.footerActionPrimaryText}>
                    {isViewerPoster ? 'Accept Offer' : 'Accept'}
                  </Text>
                </Pressable>
                {!isViewerPoster || showStickyPosterCounterButton ? (
                  <Pressable
                    pressOpacityFeedback={false}
                    disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                    onPress={onCounterOfferPress}
                    style={({ pressed }) => [
                      styles.footerActionCounter,
                      pressed && styles.footerActionCounterPressed,
                      (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                    ]}
                  >
                    <View style={styles.footerCounterInner}>
                      <Ionicons name="chatbubble-ellipses-outline" size={15} color="rgba(11, 31, 58, 0.58)" />
                      <Text style={styles.footerActionCounterText}>Counter</Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            ) : showOutgoingPendingActions ? (
              <View style={styles.footerOutgoingColumn}>
                <View style={styles.footerWaitingBlock}>
                  <Text style={styles.footerWaitingTitle}>Counter sent</Text>
                  <Text style={styles.footerWaitingText}>
                    Waiting for response from {isViewerPoster ? offerUser.name : 'the request owner'}
                  </Text>
                </View>
                <View style={styles.footerActionRow}>
                  {!isViewerPoster || showStickyPosterCounterButton ? (
                    <Pressable
                      pressOpacityFeedback={false}
                      disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                      onPress={onCounterOfferPress}
                      style={({ pressed }) => [
                        styles.footerActionCounter,
                        styles.footerActionCounterGrow,
                        pressed && styles.footerActionCounterPressed,
                        (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                      ]}
                    >
                      <View style={styles.footerCounterInner}>
                        <Ionicons name="chatbubble-ellipses-outline" size={15} color="rgba(11, 31, 58, 0.58)" />
                        <Text style={styles.footerActionCounterText}>Modify Counter</Text>
                      </View>
                    </Pressable>
                  ) : null}
                  <Pressable
                    pressOpacityFeedback={false}
                    disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                    onPress={onDecline}
                    style={({ pressed }) => [
                      styles.footerActionDestructive,
                      pressed && styles.footerActionDestructivePressed,
                      (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                    ]}
                  >
                    <Text style={styles.footerActionDestructiveText}>Withdraw</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <></>
            )
          ) : posterCanConfirmRental ? (
            <View style={styles.footerActionRow}>
              <Pressable
                pressOpacityFeedback={false}
                disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                onPress={onDecline}
                style={({ pressed }) => [
                  styles.footerActionDestructive,
                  pressed && styles.footerActionDestructivePressed,
                  (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                ]}
              >
                <Text style={styles.footerActionDestructiveText}>Decline</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                onPress={() => {
                  onConfirmRental();
                }}
                style={({ pressed }) => [
                  styles.footerActionPrimaryWide,
                  pressed && styles.footerActionPrimaryPressed,
                  (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                ]}
              >
                <Text style={styles.footerActionPrimaryText}>Confirm Rental</Text>
              </Pressable>
            </View>
          ) : canAcceptCurrent || posterCanManagePendingOffer ? (
            <View style={styles.footerActionRow}>
              <Pressable
                pressOpacityFeedback={false}
                disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                onPress={onDecline}
                style={({ pressed }) => [
                  styles.footerActionDestructive,
                  pressed && styles.footerActionDestructivePressed,
                  (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                ]}
              >
                <Text style={styles.footerActionDestructiveText}>Decline</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                onPress={handleAcceptOffer}
                style={({ pressed }) => [
                  styles.footerActionPrimary,
                  pressed && styles.footerActionPrimaryPressed,
                  (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                ]}
              >
                <Text style={styles.footerActionPrimaryText}>Accept Offer</Text>
              </Pressable>
              {!isViewerPoster || showStickyPosterCounterButton ? (
                <Pressable
                  pressOpacityFeedback={false}
                  disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                  onPress={onCounterOfferPress}
                  style={({ pressed }) => [
                    styles.footerActionCounter,
                    pressed && styles.footerActionCounterPressed,
                    (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                  ]}
                >
                  <View style={styles.footerCounterInner}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color="rgba(11, 31, 58, 0.58)" />
                    <Text style={styles.footerActionCounterText}>Counter</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          ) : isRenterOnThread && renterCanRespond ? (
            <View style={styles.footerActionRow}>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                onPress={onAcceptCounter}
                style={({ pressed }) => [
                  styles.footerActionPrimary,
                  pressed && styles.footerActionPrimaryPressed,
                  (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                ]}
              >
                <Text style={styles.footerActionPrimaryText}>Accept Counter</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                onPress={onCounterOfferPress}
                style={({ pressed }) => [
                  styles.footerActionSecondary,
                  pressed && styles.footerActionSecondaryPressed,
                  (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                ]}
              >
                <View style={styles.footerCounterInner}>
                  <Ionicons name="chatbubble-ellipses-outline" size={17} color={ui.primary} />
                  <Text style={styles.footerActionSecondaryText}>Update Offer</Text>
                </View>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footerActionRow}>
              {isViewerPoster ? (
                <Pressable
                  pressOpacityFeedback={false}
                  disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                  onPress={onDecline}
                  style={({ pressed }) => [
                    styles.footerActionDestructive,
                    pressed && styles.footerActionDestructivePressed,
                    (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                  ]}
                >
                  <Text style={styles.footerActionDestructiveText}>Decline</Text>
                </Pressable>
              ) : null}
              {!isViewerPoster || showStickyPosterCounterButton ? (
                <Pressable
                  pressOpacityFeedback={false}
                  disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                  onPress={onCounterOfferPress}
                  style={({ pressed }) => [
                    styles.footerActionCounter,
                    styles.footerActionCounterGrow,
                    pressed && styles.footerActionCounterPressed,
                    (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                  ]}
                >
                  <View style={styles.footerCounterInner}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color="rgba(11, 31, 58, 0.58)" />
                    <Text style={styles.footerActionCounterText}>Counter</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          )}
        </StickyActionBar>
      ) : null}
      </ScreenEntrance>

      {renderOfferDetailModals()}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  entranceFlex: {
    flex: 1,
  },
  entranceFillCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ui.surfaceGrouped,
    paddingHorizontal: 0,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  contentColumn: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: ui.padScreenH,
    paddingTop: 6,
  },
  compareHeroBlock: {
    backgroundColor: ui.surfaceGrouped,
  },
  compareListColumn: {
    paddingTop: 2,
  },
  compareFutureToolbarSlot: {
    minHeight: 18,
  },
  metadataRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginLeft: 56,
  },
  listedPriceLine: {
    fontSize: 15,
    lineHeight: 22,
  },
  listedPriceMuted: {
    color: ui.textSecondary,
    fontWeight: '500',
  },
  listedPriceStrong: {
    color: ui.textPrimary,
    fontWeight: '800',
  },
  footerCounterInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  backHit: {
    marginBottom: 6,
  },
  notFoundBack: {
    alignSelf: 'center',
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 6,
    marginTop: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
    marginBottom: 6,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.textSecondary,
  },
  currentOfferName: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginTop: 4,
    marginBottom: 6,
  },
  currentOfferDeclined: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#C62828',
  },
  historyRow: {
    backgroundColor: ui.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignSelf: 'stretch',
  },
  historyHeaderPressable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  historyRowFocused: {
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  historyRowLocked: {
    opacity: 0.88,
  },
  historyRowPressed: {
    opacity: 0.92,
  },
  historyRowName: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 2,
    flex: 1,
  },
  historyChevron: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.primary,
  },
  sectionToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    flex: 1,
  },
  sectionToggleAction: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.primary,
  },
  historyRowPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  historyRowMessage: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  historyRowMeta: {
    fontSize: 12,
    color: ui.textSecondary,
  },
  card: {
    backgroundColor: ui.background,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    marginBottom: 10,
  },
  priceLine: {
    fontSize: 32,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  heroSubline: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textSecondary,
    marginBottom: 8,
  },
  offerCardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginBottom: 9,
  },
  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroChip: {
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,122,255,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
  },
  offerMessageLine: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
    marginBottom: 10,
  },
  mutedSmall: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  timeLine: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  bodyLine: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 21,
    marginBottom: 6,
  },
  detailField: {
    marginBottom: 10,
  },
  detailFieldLast: {
    marginBottom: 0,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 21,
  },
  bodyMultiline: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
  },
  protectionBody: {
    marginTop: 6,
    opacity: 0.92,
  },
  userCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.primaryOn,
  },
  userCardMeta: {
    flex: 1,
    minWidth: 0,
  },
  notice: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE082',
    marginBottom: 16,
  },
  photosCard: {
    paddingVertical: 10,
  },
  photosEmpty: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#5D4037',
    marginBottom: 6,
  },
  noticeText: {
    fontSize: 15,
    color: '#5D4037',
    lineHeight: 22,
  },
  finalRoundBanner: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F59E0B',
    marginBottom: 16,
    marginHorizontal: ui.padScreenH,
  },
  finalRoundTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 6,
  },
  finalRoundBody: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
  },
  threadProposalDeclined: {
    marginBottom: 16,
    marginHorizontal: ui.padScreenH,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  threadProposalDeclinedTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  threadProposalDeclinedSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78350F',
    marginBottom: 4,
  },
  threadProposalDeclinedReason: {
    fontSize: 15,
    color: '#451A03',
    lineHeight: 22,
  },
  threadProposalDeclinedMeta: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  threadProposalDeclinedHint: {
    marginTop: 10,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  threadCounterInset: {
    marginBottom: 16,
    marginHorizontal: ui.padScreenH,
    padding: 12,
    borderRadius: 12,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: 1,
    borderColor: 'rgba(11,31,58,0.12)',
  },
  threadCounterInsetTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  threadCounterInsetSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    marginBottom: 6,
  },
  threadCounterInsetBullet: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
    marginBottom: 2,
  },
  declineModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  declineModalCard: {
    backgroundColor: ui.cardBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  declineModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  declineModalBody: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  declineModalHelper: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  declineModalFinalNote: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
    marginBottom: 12,
  },
  declineModalFinalNoteText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  declineModalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 6,
  },
  declineModalInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: ui.textPrimary,
    backgroundColor: ui.surfaceInput,
    marginBottom: 16,
  },
  declineModalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  declineModalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
  },
  declineModalCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
  declineModalConfirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.danger,
  },
  declineModalConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  agreementActiveCard: {
    backgroundColor: ui.cardBg,
    borderRadius: ui.radiusCard,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.borderLight,
    marginHorizontal: ui.padScreenH,
  },
  agreementActiveTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  agreementActiveBody: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 19,
    marginBottom: 12,
  },
  agreementActiveButton: {
    width: '100%',
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreementActiveButtonDisabled: {
    opacity: 0.55,
  },
  agreementActiveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  acceptTransitionFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  acceptTransitionFooterDimmed: {
    opacity: 0.88,
  },
  acceptTransitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  acceptTransitionText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.primary,
    letterSpacing: 0.15,
  },
  footerActionDisabled: {
    opacity: 0.48,
  },
  footerActionRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    gap: 7,
    width: '100%',
  },
  footerOutgoingColumn: {
    width: '100%',
    gap: 10,
  },
  footerWaitingBlock: {
    width: '100%',
    marginBottom: 0,
  },
  footerWaitingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  footerWaitingText: {
    fontSize: 12,
    color: ui.textSecondary,
    marginTop: 2,
  },
  footerActionPrimary: {
    flex: 1,
    minWidth: 0,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  footerActionPrimaryWide: {
    flex: 1,
    minWidth: 0,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  footerActionPrimaryPressed: {
    ...primarySolidPressed,
  },
  footerActionPrimaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.primaryOn,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  footerActionCounter: {
    minWidth: 90,
    maxWidth: 128,
    borderRadius: ui.radiusButton,
    minHeight: 48,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.25,
    borderColor: 'rgba(11, 31, 58, 0.3)',
    backgroundColor: ui.background,
  },
  footerActionCounterGrow: {
    flex: 1,
    minWidth: 0,
  },
  footerActionCounterPressed: {
    backgroundColor: 'rgba(11, 31, 58, 0.06)',
  },
  footerActionCounterText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(11, 31, 58, 0.82)',
    letterSpacing: 0.15,
  },
  footerActionSecondary: {
    minWidth: 100,
    maxWidth: 140,
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
    minHeight: 48,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.background,
  },
  footerActionSecondaryGrow: {
    flex: 1,
    minWidth: 0,
  },
  footerActionSecondaryPressed: {
    ...outlinePrimaryPressed,
  },
  footerActionSecondaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: ui.primary,
  },
  footerActionDestructive: {
    minWidth: 88,
    maxWidth: 112,
    borderRadius: ui.radiusButton,
    minHeight: 48,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(220, 38, 38, 0.42)',
    backgroundColor: ui.background,
  },
  footerActionDestructivePressed: {
    backgroundColor: '#FFEBEE',
  },
  footerActionDestructiveText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.danger,
    opacity: 0.92,
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
    marginBottom: 16,
  },
});

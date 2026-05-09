import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '@/components/AppHeaders';

import { ScreenWrapper } from '@/components/ScreenWrapper';
import { getAuthUserIdSync } from '@/lib/authUser';
import { formatHowDisplay } from '@/lib/deliveryFormat';
import { formatNegotiatedDeliverySummary } from '@/lib/negotiationDelivery';
import { formatDurationDisplay } from '@/lib/durationFormat';
import { formatUsd, getNumericOfferPrice } from '@/lib/money';
import { parseProfileAvatar } from '@/lib/profileAvatar';
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
import {
  filterNegotiationDiffRows,
  negotiatedOfferTotals,
  negotiationChangeBullets,
  snapshotFromNegotiationMessageRow,
  type RequestPricingContext,
} from '@/lib/negotiationTermSnapshot';
import { billingDayCountForRequest } from '@/lib/requestPriceContext';
import { getPresetById } from '@/lib/userAvatarPresets';
import type { SupabaseRequestChatMessageRow } from '@/lib/supabaseRequestChatMessages';
import { fetchRequestChatMessagesFromSupabase } from '@/lib/supabaseRequestChatMessages';
import {
  addRenterAcceptsPosterProposed,
  declineOffer,
  getOfferUserPreview,
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

function parseMoneyFromTextLine(value: string | null): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
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
  const params = useLocalSearchParams<{
    requestId?: string | string[];
    request_id?: string | string[];
    offerId?: string | string[];
    offer_id?: string | string[];
    id?: string | string[];
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
  const [tick, setTick] = useState(0);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [protectionExpanded, setProtectionExpanded] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [linkedRentalId, setLinkedRentalId] = useState<string | null>(null);
  const [linkedRentalLoading, setLinkedRentalLoading] = useState(false);
  const [lifecycleNow, setLifecycleNow] = useState(() => Date.now());
  const [finalizeNegotiationBusy, setFinalizeNegotiationBusy] = useState(false);
  const [postAcceptRedirectPending, setPostAcceptRedirectPending] = useState(false);
  const [offerLookupLoading, setOfferLookupLoading] = useState(false);
  const [offerLookupAttempted, setOfferLookupAttempted] = useState(false);
  const [counterReceivedLines, setCounterReceivedLines] = useState<string[] | null>(null);
  const [proposalDeclinedBanner, setProposalDeclinedBanner] = useState<{ reason: string | null } | null>(
    null
  );
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [declineReasonDraft, setDeclineReasonDraft] = useState('');
  const postAcceptNavOnceRef = useRef(false);
  const acceptFinalizeBusyRef = useRef(false);

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
    setDeclineModalVisible(true);
  };

  const submitDeclineProposal = () => {
    if (!offer || !request) return;
    void (async () => {
      const ok = await declineOffer(offer.requestId, offer.id, {
        intent: 'decline_proposal',
        reason: declineReasonDraft.trim() || undefined,
      });
      setDeclineModalVisible(false);
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
      if (!offer || !request || matched || rentalStatus !== 'pending' || offer.status !== 'pending') {
        if (!cancelled) setCounterReceivedLines(null);
        return;
      }
      const meTrim = String(me ?? '').trim();
      if (!meTrim || String(offer.lastUpdatedBy ?? '').trim() === meTrim) {
        if (!cancelled) setCounterReceivedLines(null);
        return;
      }
      if (!isNegotiationParticipant) {
        if (!cancelled) setCounterReceivedLines(null);
        return;
      }
      const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
      if (!rowId) {
        if (!cancelled) setCounterReceivedLines(null);
        return;
      }
      const rows = await fetchRequestChatMessagesFromSupabase(rowId, offer.id);
      if (cancelled) return;
      const timeline = filterNegotiationDiffRows((rows ?? []) as SupabaseRequestChatMessageRow[]);
      if (timeline.length < 2) {
        setCounterReceivedLines(null);
        return;
      }
      const last = timeline[timeline.length - 1];
      const prev = timeline[timeline.length - 2];
      if (String(last.author_id ?? '').trim() === meTrim) {
        setCounterReceivedLines(null);
        return;
      }
      const beforeSnap = snapshotFromNegotiationMessageRow(prev, request as RequestPricingContext);
      const afterSnap = snapshotFromNegotiationMessageRow(last, request as RequestPricingContext);
      const counterpartyNoun = isViewerPoster ? 'lender' : 'owner';
      const lines = negotiationChangeBullets(beforeSnap, afterSnap, 'incoming', {
        counterpartyNoun,
      });
      setCounterReceivedLines(lines.length > 0 ? lines : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    offer?.id,
    offer?.updatedAt,
    offer?.lastUpdatedBy,
    offer?.status,
    request,
    matched,
    rentalStatus,
    me,
    isNegotiationParticipant,
    isViewerPoster,
    tick,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (
        !offer ||
        !request ||
        matched ||
        rentalStatus !== 'pending' ||
        (offer.status !== 'pending' && offer.status !== 'pending_confirmation')
      ) {
        if (!cancelled) setProposalDeclinedBanner(null);
        return;
      }
      const meTrim = String(me ?? '').trim();
      if (!meTrim || !isNegotiationParticipant) {
        if (!cancelled) setProposalDeclinedBanner(null);
        return;
      }
      const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
      if (!rowId) {
        if (!cancelled) setProposalDeclinedBanner(null);
        return;
      }
      const rows = await fetchRequestChatMessagesFromSupabase(rowId, offer.id);
      if (cancelled) return;
      const timelineKinds = new Set([
        'initial',
        'renter_update',
        'poster_counter',
        'proposal_declined',
        'renter_accepts',
      ]);
      const timeline = (rows ?? []).filter((r) => timelineKinds.has(String(r.kind ?? '').trim()));
      if (timeline.length === 0) {
        setProposalDeclinedBanner(null);
        return;
      }
      const last = timeline[timeline.length - 1];
      if (String(last.kind ?? '').trim() !== 'proposal_declined') {
        setProposalDeclinedBanner(null);
        return;
      }
      if (String(last.author_id ?? '').trim() === meTrim) {
        setProposalDeclinedBanner(null);
        return;
      }
      setProposalDeclinedBanner({ reason: parseProposalDeclinedReason(last.body) });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    offer?.id,
    offer?.updatedAt,
    offer?.status,
    request,
    matched,
    rentalStatus,
    me,
    isNegotiationParticipant,
    tick,
  ]);

  if (offerIdTrim.length === 0) {
    return null;
  }

  if (!request || !offer) {
    if (offerLookupLoading || !offerLookupAttempted) {
      return (
        <ScreenWrapper style={styles.screenWrap}>
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
      <ScreenWrapper style={styles.screenWrap}>
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

  const requestPricingCtx: RequestPricingContext = {
    how: request.how,
    deliveryFee: request.deliveryFee,
    pickupDate: (request as { pickupDate?: string }).pickupDate,
    returnDate: (request as { returnDate?: string }).returnDate,
    location: request.location,
    pickupRadiusMiles: (request as { pickupRadiusMiles?: number }).pickupRadiusMiles,
  };
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
  const dailyLateFeeText = extractTermLine(offer.message, 'Daily late fee');
  const conditionLine = offer.message?.trim().split('\n').map((l) => l.trim()).find((line) =>
    !/^(terms \(optional\)|brand and model:|description:|replacement value:|delivery method:|delivery fee:|daily late fee)/i.test(line)
  ) ?? null;
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
  const estimatedPreauth = replacementValueNum != null ? Math.max(0, Math.round(replacementValueNum * 0.75)) : null;
  const offerUser = getOfferUserPreview(offer);
  const parsedOfferUserAvatar = parseProfileAvatar(offerUser.avatar);
  const offerUserPreset = parsedOfferUserAvatar.kind === 'preset' ? getPresetById(parsedOfferUserAvatar.id) : null;
  const ownerCardTitle = isViewerPoster ? 'Owner' : 'Equipment Owner';
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
  const offerUpdatedAgo = getTimeAgo(offer.updatedAt);

  const scrollBottomPad = showAcceptTransitionBar
    ? 64 + insets.bottom
    : footerShows || showPendingActionBar
      ? (renterCanRespond && isRenterOnThread ? 120 : 110) + insets.bottom
      : renterIsWaitingOwnerConfirm
        ? 120 + insets.bottom
        : 32 + insets.bottom;

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <View style={{ flex: 1, backgroundColor: ui.surfaceGrouped }}>
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={{ flex: 1 }}>
            <View style={[styles.header, { paddingTop: 8 }]}>
              <BackHeader title="Offer Details" onBack={() => router.back()} />
            </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingVertical: 12,
            paddingHorizontal: 0,
            paddingBottom: scrollBottomPad,
          }}
          showsVerticalScrollIndicator={true}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.contentColumn}>
        {renterIsWaitingOwnerConfirm ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Waiting for owner confirmation. You will be notified when they confirm the rental.
            </Text>
          </View>
        ) : null}

        {posterCanConfirmRental ? (
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
        ) : negotiationLockedOut && isViewerPoster ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Negotiation closed</Text>
            <Text style={styles.noticeText}>
              This thread is permanently closed with this lender.
            </Text>
          </View>
        ) : isTerminalNegotiation && offer.status === 'closed' && !negotiationLockedOut ? (
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
        ) : isTerminalNegotiation ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Negotiation closed</Text>
            <Text style={styles.noticeText}>
              {offer.status === 'closed'
                ? 'This negotiation has ended.'
                : 'Negotiation limits were reached and this thread is closed.'}
            </Text>
          </View>
        ) : null}

        {proposalDeclinedBanner != null ? (
          <View style={styles.proposalDeclinedCard}>
            <Text style={styles.proposalDeclinedTitle}>Proposal declined</Text>
            {proposalDeclinedBanner.reason ? (
              <>
                <Text style={styles.proposalDeclinedSubtitle}>Optional reason:</Text>
                <Text style={styles.proposalDeclinedReason}>{proposalDeclinedBanner.reason}</Text>
              </>
            ) : (
              <Text style={styles.proposalDeclinedMeta}>No reason was provided.</Text>
            )}
            <Text style={styles.proposalDeclinedHint}>
              You can still accept the last terms, send a counter, or update your offer while negotiation
              limits allow.
            </Text>
          </View>
        ) : null}

        {counterReceivedLines != null && counterReceivedLines.length > 0 ? (
          <View style={styles.counterReceivedCard}>
            <Text style={styles.counterReceivedTitle}>Counter received</Text>
            <Text style={styles.counterReceivedSubtitle}>Updated terms:</Text>
            {counterReceivedLines.map((line, i) => (
              <Text key={`${i}-${line.slice(0, 24)}`} style={styles.counterReceivedBullet}>
                • {line}
              </Text>
            ))}
          </View>
        ) : null}

        {offer &&
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

        {isViewerPoster && isPosterCounter && !matched ? (
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

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Current Offer</Text>
              <Text style={styles.sectionMeta}>{offerUpdatedAgo}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.priceLine}>{formatUsd(offerTotalWithDelivery)}</Text>
              <Text style={styles.heroSubline}>
                {formatDurationDisplay(request)} • {formatUsd(offerDailyRate)}/day
              </Text>
              <View style={styles.offerCardDivider} />
              <View style={styles.heroChipRow}>
                <View style={styles.heroChip}><Text style={styles.heroChipText}>{negotiatedDeliverySummary}</Text></View>
                <View style={styles.heroChip}><Text style={styles.heroChipText}>{ownerDistanceLabel}</Text></View>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Rental schedule</Text>
            <View style={styles.card}>
              <Text style={styles.bodyLine}>Pickup date: {pickupDateLabel || '—'}</Text>
              <Text style={styles.bodyLine}>Return date: {returnDateLabel || '—'}</Text>
              <Text style={styles.bodyLine}>Duration: {formatDurationDisplay(request)}</Text>
            </View>

            <Text style={styles.sectionLabel}>Delivery & Meetup</Text>
            <View style={styles.card}>
              <Text style={styles.bodyLine}>
                {negMethod === 'pickup' ? 'Pickup' : 'Owner delivery'}
              </Text>
              {negMethod === 'owner_delivery' ? (
                <Text style={styles.bodyLine}>
                  {negFee <= 0 ? 'Free delivery' : `Delivery: ${formatUsd(negFee)}`}
                </Text>
              ) : null}
              <Text style={styles.bodyLine}>
                Request preference: {formatHowDisplay(request)}
              </Text>
              <Text style={styles.bodyLine}>
                Rental area / meetup area: {request.location?.trim() ? request.location.trim() : '—'}
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Item Details</Text>
            <View style={styles.card}>
              {brandModelText ? (
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Brand & model</Text>
                  <Text style={styles.detailValue}>{brandModelText}</Text>
                </View>
              ) : null}
              {conditionLine ? (
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Condition</Text>
                  <Text style={styles.detailValue}>{conditionLine}</Text>
                </View>
              ) : null}
              {descriptionText ? (
                <View style={styles.detailFieldLast}>
                  <Text style={styles.detailLabel}>Description/specs</Text>
                  <Text style={styles.detailValue}>{descriptionText}</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>Equipment Value & Terms</Text>
            <View style={styles.card}>
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => setProtectionExpanded((v) => !v)}
                style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyRowPressed]}
              >
                <Text style={styles.sectionToggleLabel}>Equipment value & terms</Text>
                <Text style={styles.sectionToggleAction}>{protectionExpanded ? 'Hide' : 'View'}</Text>
              </Pressable>
              {protectionExpanded ? (
                <View style={styles.protectionBody}>
                  <Text style={styles.bodyLine}>Replacement value: {replacementValueText ?? '—'}</Text>
                  <Text style={styles.bodyLine}>
                    Daily late fee per day: {formatUsd(lateFeePerDay)} ({formatUsd(offerDailyRate)} + 20%)
                  </Text>
                  <Text style={styles.bodyLine}>
                    Estimated preauthorization hold: {estimatedPreauth != null ? formatUsd(estimatedPreauth) : '—'}
                  </Text>
                  <Text style={styles.mutedSmall}>
                    No charge is applied unless needed. Preauthorization holds are temporary and only used if the item is
                    returned late, damaged, materially different, or not returned.
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>Photos</Text>
            <View style={[styles.card, styles.photosCard]}>
              {Array.isArray(offer.offer_images) && offer.offer_images.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {offer.offer_images.map((img, i) => (
                    <Pressable
                      key={i}
                      onPress={() => {
                        setViewerIndex(i);
                        setViewerVisible(true);
                      }}
                      style={{ marginRight: 10 }}
                    >
                      <Image
                        source={{ uri: img }}
                        style={{
                          width: 110,
                          height: 110,
                          borderRadius: 10,
                        }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.photosEmpty}>No photos attached.</Text>
              )}
            </View>

            <Text style={styles.sectionLabel}>{ownerCardTitle}</Text>
            <View style={styles.card}>
              <View style={styles.userCardRow}>
                <View style={[styles.userAvatar, { backgroundColor: offerUserPreset?.color ?? ui.borderLight }]}>
                  <Text style={styles.userAvatarText}>
                    {offerUserPreset?.icon?.slice(0, 1).toUpperCase() ?? offerUser.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userCardMeta}>
                  <Text style={styles.currentOfferName}>{offerUser.name}</Text>
                  <Text style={styles.bodyLine}>Rating: ★ {offerUser.rating.toFixed(1)}</Text>
                  <Text style={styles.bodyLine}>Completed rentals count: —</Text>
                  <Text style={styles.bodyLine}>Response speed: —</Text>
                </View>
              </View>
            </View>
          </>
          ) : (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Current Offer</Text>
              <Text style={styles.sectionMeta}>{offerUpdatedAgo}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.priceLine}>{formatUsd(offerTotalWithDelivery)}</Text>
              <Text style={styles.heroSubline}>
                {formatDurationDisplay(request)} • {formatUsd(offerDailyRate)}/day
              </Text>
              <View style={styles.offerCardDivider} />
              <View style={styles.heroChipRow}>
                <View style={styles.heroChip}><Text style={styles.heroChipText}>{negotiatedDeliverySummary}</Text></View>
                <View style={styles.heroChip}><Text style={styles.heroChipText}>{ownerDistanceLabel}</Text></View>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Rental Schedule</Text>
            <View style={styles.card}>
              <Text style={styles.bodyLine}>Pickup date: {pickupDateLabel || '—'}</Text>
              <Text style={styles.bodyLine}>Return date: {returnDateLabel || '—'}</Text>
              <Text style={styles.bodyLine}>Duration: {formatDurationDisplay(request)}</Text>
            </View>

            <Text style={styles.sectionLabel}>Delivery & Meetup</Text>
            <View style={styles.card}>
              <Text style={styles.bodyLine}>
                {negMethod === 'pickup' ? 'Pickup' : 'Owner delivery'}
              </Text>
              {negMethod === 'owner_delivery' ? (
                <Text style={styles.bodyLine}>
                  {negFee <= 0 ? 'Free delivery' : `Delivery: ${formatUsd(negFee)}`}
                </Text>
              ) : null}
              <Text style={styles.bodyLine}>
                Request preference: {formatHowDisplay(request)}
              </Text>
              <Text style={styles.bodyLine}>
                Rental area / meetup area: {request.location?.trim() ? request.location.trim() : '—'}
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Item Details</Text>
            <View style={styles.card}>
              {brandModelText ? (
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Brand & model</Text>
                  <Text style={styles.detailValue}>{brandModelText}</Text>
                </View>
              ) : null}
              {conditionLine ? (
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Condition</Text>
                  <Text style={styles.detailValue}>{conditionLine}</Text>
                </View>
              ) : null}
              {descriptionText ? (
                <View style={styles.detailFieldLast}>
                  <Text style={styles.detailLabel}>Description/specs</Text>
                  <Text style={styles.detailValue}>{descriptionText}</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>Equipment Value & Terms</Text>
            <View style={styles.card}>
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => setProtectionExpanded((v) => !v)}
                style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyRowPressed]}
              >
                <Text style={styles.sectionToggleLabel}>Equipment value & terms</Text>
                <Text style={styles.sectionToggleAction}>{protectionExpanded ? 'Hide' : 'View'}</Text>
              </Pressable>
              {protectionExpanded ? (
                <View style={styles.protectionBody}>
                  <Text style={styles.bodyLine}>Replacement value: {replacementValueText ?? '—'}</Text>
                  <Text style={styles.bodyLine}>
                    Daily late fee per day: {formatUsd(lateFeePerDay)} ({formatUsd(offerDailyRate)} + 20%)
                  </Text>
                  <Text style={styles.bodyLine}>
                    Estimated preauthorization hold: {estimatedPreauth != null ? formatUsd(estimatedPreauth) : '—'}
                  </Text>
                  <Text style={styles.mutedSmall}>
                    No charge is applied unless needed. Preauthorization holds are temporary and only used if the item is
                    returned late, damaged, materially different, or not returned.
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>Photos</Text>
            <View style={[styles.card, styles.photosCard]}>
              {Array.isArray(offer.offer_images) && offer.offer_images.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {offer.offer_images.map((img, i) => (
                    <Pressable
                      key={i}
                      onPress={() => {
                        setViewerIndex(i);
                        setViewerVisible(true);
                      }}
                      style={{ marginRight: 10 }}
                    >
                      <Image
                        source={{ uri: img }}
                        style={{
                          width: 110,
                          height: 110,
                          borderRadius: 10,
                        }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.photosEmpty}>No photos attached.</Text>
              )}
            </View>

            <Text style={styles.sectionLabel}>{ownerCardTitle}</Text>
            <View style={styles.card}>
              <View style={styles.userCardRow}>
                <View style={[styles.userAvatar, { backgroundColor: offerUserPreset?.color ?? ui.borderLight }]}>
                  <Text style={styles.userAvatarText}>
                    {offerUserPreset?.icon?.slice(0, 1).toUpperCase() ?? offerUser.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userCardMeta}>
                  <Text style={styles.currentOfferName}>{offerUser.name}</Text>
                  <Text style={styles.bodyLine}>Rating: ★ {offerUser.rating.toFixed(1)}</Text>
                  <Text style={styles.bodyLine}>Completed rentals count: —</Text>
                  <Text style={styles.bodyLine}>Response speed: —</Text>
                </View>
              </View>
            </View>
          </>
          )
        ) : null}

        <Text style={styles.sectionLabel}>Offer History</Text>
        {hasCurrentOfferDetails ? (
          <View style={styles.historyRow}>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() =>
                setExpandedHistory((prev) => ({
                  ...prev,
                  currentOfferDetails: !prev.currentOfferDetails,
                }))
              }
              style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyRowPressed]}
            >
              <Text style={styles.historyRowName} numberOfLines={1}>
                Current offer details
              </Text>
              <Text style={styles.historyChevron}>
                {expandedHistory.currentOfferDetails ? 'Hide' : 'View'}
              </Text>
            </Pressable>
            {expandedHistory.currentOfferDetails ? (
              <>
                {offer.message?.trim() ? (
                  <Text style={styles.historyRowMessage}>{offer.message.trim()}</Text>
                ) : null}
                {historyStatusNote ? (
                  <Text style={styles.historyRowMessage}>{historyStatusNote}</Text>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
        {historyEntries.length === 0 && !hasCurrentOfferDetails ? (
          <Text style={styles.mutedSmall}>No older offers on this request.</Text>
        ) : (
          historyEntries.map((h) => (
            <View key={`${h.at}-${h.authorId}-${h.kind}`} style={styles.historyRow}>
              <Pressable
                pressOpacityFeedback={false}
                onPress={() =>
                  setExpandedHistory((prev) => {
                    const key = `${h.at}-${h.authorId}-${h.kind}`;
                    return { ...prev, [key]: !prev[key] };
                  })
                }
                style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyRowPressed]}
              >
                <Text style={styles.historyRowName} numberOfLines={1}>
                  {h.kind} · {getTimeAgo(h.at)}
                  {h.price != null && Number.isFinite(h.price) ? ` · ${formatUsd(h.price)}` : ''}
                </Text>
                <Text style={styles.historyChevron}>
                  {expandedHistory[`${h.at}-${h.authorId}-${h.kind}`] ? 'Hide' : 'View'}
                </Text>
              </Pressable>
              {expandedHistory[`${h.at}-${h.authorId}-${h.kind}`] && h.body?.trim() ? (
                <Text style={styles.historyRowMessage}>{h.body.trim()}</Text>
              ) : null}
            </View>
          ))
        )}

        {matched && !isAcceptedOffer ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              This request is already matched with another offer.
            </Text>
          </View>
        ) : null}
        </View>
        </ScrollView>
      </View>

      {showAcceptTransitionBar ? (
        <View
          style={[
            styles.buttonContainer,
            styles.acceptTransitionFooter,
            postAcceptRedirectPending && !finalizeNegotiationBusy && styles.acceptTransitionFooterDimmed,
            { paddingBottom: 12 + insets.bottom },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.acceptTransitionRow} pointerEvents="none">
            <ActivityIndicator size="small" color={ui.primary} />
            <Text style={styles.acceptTransitionText}>
              {finalizeNegotiationBusy ? 'Finalizing agreement…' : 'Opening rental workspace…'}
            </Text>
          </View>
        </View>
      ) : negotiationLockedOut || isTerminalNegotiation ? null : footerShows || showPendingActionBar ? (
        <View style={[styles.buttonContainer, { paddingBottom: 12 + insets.bottom }]}>
          {showPendingActionBar ? (
            showIncomingNegotiationActions ? (
              <View style={styles.footerActionRow}>
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
                  <Text style={styles.footerActionPrimaryText}>Accept</Text>
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
                  <Text style={styles.footerActionSecondaryText}>Counter</Text>
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                  onPress={onDecline}
                  style={({ pressed }) => [
                    styles.footerActionDecline,
                    pressed && styles.footerActionDeclinePressed,
                    (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                  ]}
                >
                  <Text style={styles.footerActionDeclineText}>Decline</Text>
                </Pressable>
              </View>
            ) : showOutgoingPendingActions ? (
              <View style={styles.footerActionRow}>
                <View style={styles.footerWaitingBlock}>
                  <Text style={styles.footerWaitingTitle}>Counter sent</Text>
                  <Text style={styles.footerWaitingText}>
                    Waiting for response from {isViewerPoster ? offerUser.name : 'the request owner'}
                  </Text>
                </View>
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
                  <Text style={styles.footerActionSecondaryText}>Modify Counter</Text>
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                  onPress={onDecline}
                  style={({ pressed }) => [
                    styles.footerActionDecline,
                    pressed && styles.footerActionDeclinePressed,
                    (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                  ]}
                >
                  <Text style={styles.footerActionDeclineText}>Withdraw</Text>
                </Pressable>
              </View>
            ) : (
              <></>
            )
          ) : posterCanConfirmRental ? (
            <View style={styles.footerActionRow}>
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
              <Pressable
                pressOpacityFeedback={false}
                disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                onPress={onDecline}
                style={({ pressed }) => [
                  styles.footerActionDecline,
                  pressed && styles.footerActionDeclinePressed,
                  (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                ]}
              >
                <Text style={styles.footerActionDeclineText}>Decline</Text>
              </Pressable>
            </View>
          ) : canAcceptCurrent || posterCanManagePendingOffer ? (
            <View style={styles.footerActionRow}>
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
                <Text style={styles.footerActionPrimaryText}>Accept</Text>
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
                <Text style={styles.footerActionSecondaryText}>Counter</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                onPress={onDecline}
                style={({ pressed }) => [
                  styles.footerActionDecline,
                  pressed && styles.footerActionDeclinePressed,
                  (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                ]}
              >
                <Text style={styles.footerActionDeclineText}>Decline</Text>
              </Pressable>
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
                <Text style={styles.footerActionSecondaryText}>Update Offer</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footerActionRow}>
              <Pressable
                pressOpacityFeedback={false}
                disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                onPress={onCounterOfferPress}
                style={({ pressed }) => [
                  styles.footerActionSecondary,
                  styles.footerActionSecondaryGrow,
                  pressed && styles.footerActionSecondaryPressed,
                  (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                ]}
              >
                <Text style={styles.footerActionSecondaryText}>Counter</Text>
              </Pressable>
              {isViewerPoster ? (
                <Pressable
                  pressOpacityFeedback={false}
                  disabled={finalizeNegotiationBusy || postAcceptRedirectPending}
                  onPress={onDecline}
                  style={({ pressed }) => [
                    styles.footerActionDecline,
                    pressed && styles.footerActionDeclinePressed,
                    (finalizeNegotiationBusy || postAcceptRedirectPending) && styles.footerActionDisabled,
                  ]}
                >
                  <Text style={styles.footerActionDeclineText}>Decline</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
      </ScreenEntrance>

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
              renderItem={({ item }) => (
                <View
                  style={{
                    width: Dimensions.get('window').width,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Image
                    source={{ uri: item }}
                    style={{
                      width: Dimensions.get('window').width,
                      height: Dimensions.get('window').height * 0.8,
                    }}
                    resizeMode="contain"
                  />
                </View>
              )}
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

      <Modal
        visible={declineModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeclineModalVisible(false)}
      >
        <View style={styles.declineModalBackdrop}>
          <View style={styles.declineModalCard}>
            <Text style={styles.declineModalTitle}>Confirm Decline</Text>
            <Text style={styles.declineModalBody}>Decline this proposal?</Text>
            <Text style={styles.declineModalHelper}>
              The other user may still submit another counter offer unless negotiation limits are reached.
            </Text>
            {offer && isFinalDeclineRoundBeforeAction(offer) ? (
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
                onPress={() => setDeclineModalVisible(false)}
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
  },
  header: {
    paddingHorizontal: 0,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
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
  counterReceivedCard: {
    backgroundColor: ui.surfaceTintPrimary,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(11,31,58,0.12)',
    marginBottom: 16,
    marginHorizontal: ui.padScreenH,
  },
  counterReceivedTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  counterReceivedSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    marginBottom: 6,
  },
  counterReceivedBullet: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
    marginBottom: 2,
  },
  proposalDeclinedCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FCD34D',
    marginBottom: 16,
    marginHorizontal: ui.padScreenH,
  },
  proposalDeclinedTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  proposalDeclinedSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78350F',
    marginBottom: 4,
  },
  proposalDeclinedReason: {
    fontSize: 15,
    color: '#451A03',
    lineHeight: 22,
  },
  proposalDeclinedMeta: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  proposalDeclinedHint: {
    marginTop: 12,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
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
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: ui.padScreenH,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    gap: 10,
  },
  footerActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  footerWaitingBlock: {
    width: '100%',
    marginBottom: 2,
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
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerActionPrimaryWide: {
    flex: 1,
    minWidth: 120,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerActionPrimaryPressed: {
    ...primarySolidPressed,
  },
  footerActionPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  footerActionSecondary: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.background,
  },
  footerActionSecondaryGrow: {
    flexGrow: 1,
    minWidth: 120,
  },
  footerActionSecondaryPressed: {
    ...outlinePrimaryPressed,
  },
  footerActionSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  footerActionDecline: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    backgroundColor: ui.surfaceNeutral,
    borderRadius: ui.radiusButton,
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  footerActionDeclinePressed: {
    ...subtleControlPressed,
  },
  footerActionDeclineText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
    marginBottom: 16,
  },
});

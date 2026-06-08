import { Pressable } from '@/components/Pressable';
import { RootScreenHeader } from '@/components/AppHeaders';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlatList, RectButton, Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardChrome, ui } from '@/constants/appUi';
import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '@/components/MainTabFab';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { openChatForRequest } from '@/lib/openRequestChat';
import type { AppNotification } from '@/store/notificationsStore';
import { resolveRequestFromRouteId } from '@/store/requestsStore';
import { markNotificationAsRead } from '@/lib/markNotificationsRead';
import { isRentalJourneyNotificationType, pushRentalFromNotification } from '@/lib/rentalNavigation';
import {
  useNotificationsList,
  useNotificationsStore,
} from '@/store/notificationsStore';

function typePillStyle(t: AppNotification['type']) {
  switch (t) {
    case 'accepted':
    case 'offer_accepted':
      return {
        backgroundColor: '#E8F5E9',
        color: '#2E7D32',
      };
    case 'new_offer':
    case 'counter_offer':
    case 'agreement_pending':
      return {
        backgroundColor: '#F3F4F6',
        color: ui.textSecondary,
      };
    case 'declined':
      return {
        backgroundColor: '#FCE8E6',
        color: '#C62828',
      };
    case 'review':
      return {
        backgroundColor: '#EEF2FF',
        color: '#4F46E5',
      };
    case 'completed':
      return {
        backgroundColor: '#F5F5F4',
        color: '#6D4C41',
      };
    case 'started':
      return {
        backgroundColor: '#E8F4FD',
        color: ui.primary,
      };
    case 'message':
      return {
        backgroundColor: '#E3F2FD',
        color: ui.primary,
      };
    case 'rental_request':
      return {
        backgroundColor: '#FFF8E1',
        color: '#F57F17',
      };
    case 'rental_declined':
      return {
        backgroundColor: '#FCE8E6',
        color: '#C62828',
      };
    case 'rental_cancellation_requested':
      return {
        backgroundColor: '#FFF7ED',
        color: '#C2410C',
      };
    case 'rental_cancellation_accepted':
      return {
        backgroundColor: '#E8F5E9',
        color: '#2E7D32',
      };
    case 'rental_cancellation_declined':
      return {
        backgroundColor: '#FEF3C7',
        color: '#B45309',
      };
    default:
      return {
        backgroundColor: ui.surfaceNeutral,
        color: ui.textSecondary,
      };
  }
}
function typeLabel(t: AppNotification['type']): string {
  switch (t) {
    case 'new_offer':
      return 'New offer';
    case 'counter_offer':
      return 'Counter';
    case 'agreement_pending':
      return 'Agreement';
    case 'accepted':
      return 'Accepted';
    case 'offer_accepted':
      return 'Offer accepted';
    case 'declined':
      return 'Declined';
    case 'started':
      return 'Rental';
    case 'completed':
      return 'Completed';
    case 'review':
      return 'Review';
    case 'message':
      return 'Message';
    case 'rental_request':
      return 'Rental request';
    case 'rental_declined':
      return 'Request declined';
    case 'rental_cancellation_requested':
      return 'Cancel request';
    case 'rental_cancellation_accepted':
      return 'Cancel approved';
    case 'rental_cancellation_declined':
      return 'Cancel declined';
    default:
      return '';
  }
}

function formatWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** True when the server tied this notification to `requests.id` (browse requests), not listing-only offers. */
function notificationHasRequestRowId(n: AppNotification): boolean {
  const r = n.requestId;
  if (r == null) return false;
  if (typeof r === 'string') return r.trim() !== '';
  if (typeof r === 'number') return Number.isFinite(r) && r > 0;
  return false;
}

function NotificationMessage({ text }: { text: string }) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return (
      <View style={styles.messageBlock}>
        <Text style={styles.messagePrimary}>{lines[0]}</Text>
        {lines.slice(1).map((line, i) => (
          <Text key={i} style={styles.messageSecondary}>
            {line}
          </Text>
        ))}
      </View>
    );
  }
  return <Text style={styles.message}>{text}</Text>;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fabBottomReserve = useMainTabFabBottomReserve();
  const list = useNotificationsList();

  useFocusEffect(
    useCallback(() => {
      useNotificationsStore.getState().cleanupStaleNotifications();
    }, []),
  );

  const handleDelete = useCallback((id: string) => {
    useNotificationsStore.getState().removeNotification(id);
  }, []);

  const navigateFromNotification = (n: AppNotification) => {
    if (__DEV__) {
      console.log('[notifications] tap', {
        id: n.id,
        type: n.type,
        requestId: n.requestId,
        offerId: n.offerId,
        chatId: n.chatId,
        rentalId: n.rentalId,
        listingId: n.listingId ?? null,
        rentalRequestId: n.rentalRequestId ?? null,
      });
    }

    if (n.type === 'rental_request') {
      router.push({
        pathname: '/activity-my-shop',
        params: { section: 'inbox' },
      });
      return;
    }
    if (n.type === 'rental_declined') {
      const lid =
        typeof n.listingId === 'string' && n.listingId.trim() !== '' ? n.listingId.trim() : null;
      if (lid) {
        router.push({ pathname: '/listing-detail', params: { listingId: lid } });
      } else {
        router.push({ pathname: '/activity-renting', params: { section: 'rentals' } });
      }
      return;
    }

    if (n.type === 'review') {
      router.push('/reviews');
      return;
    }

    const rentalRouteId =
      typeof n.rentalId === 'string' && n.rentalId.trim() !== '' ? n.rentalId.trim() : null;
    if (rentalRouteId && isRentalJourneyNotificationType(n.type)) {
      if (__DEV__) {
        console.log('[notifications] navigate -> rental wizard', { rentalId: rentalRouteId, type: n.type });
      }
      void pushRentalFromNotification(router, n);
      return;
    }

    if (n.type === 'message') {
      if (n.offerId != null && String(n.offerId).trim() !== '') {
        router.push({
          pathname: '/chat/[id]',
          params: { id: String(n.offerId).trim() },
        });
        return;
      }
      if (n.chatId) {
        router.push({ pathname: '/chat/[id]', params: { id: n.chatId } });
        return;
      }
      if (n.requestId != null) {
        const req = resolveRequestFromRouteId(n.requestId);
        const ts = req != null ? (req as { timestamp?: number }).timestamp : undefined;
        if (typeof ts === 'number' && Number.isFinite(ts)) {
          openChatForRequest(router, ts);
        }
        return;
      }
    }

    const trimmedOfferId =
      n.offerId != null && String(n.offerId).trim() !== '' ? String(n.offerId).trim() : null;
    const isOfferThreadType =
      n.type === 'new_offer' ||
      n.type === 'counter_offer' ||
      n.type === 'offer_updated' ||
      n.type === 'agreement_pending' ||
      n.type === 'declined' ||
      n.type === 'offer_accepted' ||
      n.type === 'accepted';

    // Listing-linked offers (`offers.listing_id`, no `requests` row): `offer-detail` cannot resolve them.
    if (trimmedOfferId && !notificationHasRequestRowId(n) && isOfferThreadType) {
      if (__DEV__) {
        console.log('[notifications] navigate -> listing-offer-detail', { offerId: trimmedOfferId });
      }
      router.push({
        pathname: '/listing-offer-detail',
        params: { offerId: trimmedOfferId },
      });
      return;
    }

    if (
      (n.type === 'new_offer' ||
        n.type === 'counter_offer' ||
        n.type === 'agreement_pending' ||
        n.type === 'declined') &&
      trimmedOfferId
    ) {
      const requestId =
        n.requestId != null && String(n.requestId).trim() !== ''
          ? String(n.requestId).trim()
          : undefined;
      if (__DEV__) {
        console.log('[notifications] navigate -> offer-detail', { requestId, offerId: trimmedOfferId });
      }
      router.push({
        pathname: '/offer-detail',
        params: {
          offerId: trimmedOfferId,
          ...(requestId ? { requestId } : {}),
        },
      });
      return;
    }
    if ((n.type === 'offer_accepted' || n.type === 'accepted') && trimmedOfferId) {
      const requestId =
        n.requestId != null && String(n.requestId).trim() !== ''
          ? String(n.requestId).trim()
          : undefined;
      if (__DEV__) {
        console.log('[notifications] navigate -> offer-detail (request-scoped offer)', {
          requestId,
          offerId: trimmedOfferId,
        });
      }
      router.push({
        pathname: '/offer-detail',
        params: {
          offerId: trimmedOfferId,
          ...(requestId ? { requestId } : {}),
        },
      });
      return;
    }
    if (n.requestId != null) {
      const resolved = resolveRequestFromRouteId(n.requestId);
      const rid = resolved
        ? getRequestSupabaseRowId(resolved as Record<string, unknown>)
        : null;
      if (rid) {
        router.push({
          pathname: '/request-details',
          params: { requestId: rid },
        });
      }
    }
  };

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <View style={styles.header}>
          <RootScreenHeader title="Alerts" />
        </View>

      <FlatList
        style={styles.scroll}
        data={list}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: fabBottomReserve + insets.bottom },
          list.length === 0 && styles.scrollContentEmpty,
          list.length > 0 && styles.listCardContent,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No notifications yet.</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
        renderItem={({ item: n }) => {
          const pillStyle = typePillStyle(n.type);
          return (
            <Swipeable
              renderRightActions={(_progress, _dragX) => (
                <View style={styles.deleteActionWrap}>
                  <RectButton style={styles.deleteButton} onPress={() => handleDelete(n.id)}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </RectButton>
                </View>
              )}
            >
              <View style={styles.notificationItem}>
                <Pressable
                  onPress={() => {
                    markNotificationAsRead(n.id);
                    navigateFromNotification(n);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    !n.read && styles.rowUnread,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.rowTop}>
                    {!n.read ? <View style={styles.unreadDot} /> : <View style={styles.readSpacer} />}
                    <Text
                      style={[
                        styles.typePill,
                        {
                          backgroundColor: pillStyle.backgroundColor,
                          color: pillStyle.color,
                        },
                      ]}
                    >
                      {typeLabel(n.type)}
                    </Text>
                    <Text style={styles.time}>{formatWhen(n.timestamp)}</Text>
                  </View>
                  <NotificationMessage text={n.message} />
                </Pressable>
              </View>
            </Swipeable>
          );
        }}
      />
      <MainTabFab />
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
    alignItems: 'flex-start',
    paddingTop: ui.spaceMd,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 16,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  listCardContent: {
    ...cardChrome,
    overflow: 'visible',
    marginLeft: 0,
    marginRight: 0,
  },
  emptyCard: {
    ...cardChrome,
    padding: ui.padCard + 6,
  },
  emptyText: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
  },
  notificationItem: {
    backgroundColor: '#FFFFFF',
  },
  deleteActionWrap: {
    width: 80,
    justifyContent: 'center',
    marginVertical: 6,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    borderRadius: 12,
  },
  deleteText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowUnread: {
    backgroundColor: ui.surfaceTintPrimary,
    borderLeftWidth: 3,
    borderLeftColor: ui.primary,
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ui.primary,
    marginRight: 6,
  },
  readSpacer: {
    width: 0,
    height: 0,
  },
  typePill: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  time: {
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
    fontSize: 12,
    color: ui.textSecondary,
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    color: ui.textPrimary,
  },
  messageBlock: {
    gap: 4,
  },
  messagePrimary: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.2,
  },
  messageSecondary: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    color: ui.textSubtle,
  },
});

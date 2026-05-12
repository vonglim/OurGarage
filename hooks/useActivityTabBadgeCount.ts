import { useMemo } from 'react';

import {
  activityRequestInvolvesUser,
  getRequestOwnerId,
  offerCountsForActivityRow,
} from '@/lib/activityScope';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useOffersStore } from '@/store/offersStore';
import { getAuthUserIdSync } from '@/lib/authUser';
import { getEffectiveRentalStatus, useRequestsStore } from '@/store/requestsStore';
import { useListingOffersActivityStore } from '@/store/listingOffersActivityStore';

/**
 * Attention count for the Activity tab: unread request/rental notifications (not chat),
 * plus pending requests you own that have offers but no unread offer notification.
 */
export function useActivityTabBadgeCount(): number {
  const notifications = useNotificationsStore((s) => s.notifications);
  const requests = useRequestsStore((s) => s.requests);
  const offers = useOffersStore((s) => s.offers);
  const listingOfferRows = useListingOffersActivityStore((s) => s.rows);

  return useMemo(() => {
    const me = getAuthUserIdSync();
    const visibleUnread = (n: (typeof notifications)[number]) =>
      !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === me);

    let total = 0;
    for (const n of notifications) {
      if (!visibleUnread(n)) continue;
      if (n.type === 'message') continue;
      total += 1;
    }

    for (const r of requests) {
      const row = r as Record<string, unknown>;
      if (!activityRequestInvolvesUser(row, me)) continue;
      if (getRequestOwnerId(row) !== me || r.matched) continue;
      if (getEffectiveRentalStatus(r) !== 'pending') continue;
      const ts = r.timestamp;
      if (ts == null || !Number.isFinite(ts)) continue;
      const hasOffer = offers.some((o) =>
        offerCountsForActivityRow(o, row, me)
      );
      if (!hasOffer) continue;
      const hasUnreadOfferNotif = notifications.some(
        (x) =>
          visibleUnread(x) &&
          (x.type === 'new_offer' || x.type === 'counter_offer') &&
          x.requestId === ts
      );
      if (!hasUnreadOfferNotif) total += 1;
    }

    const hasUnreadNonMessageNotifForOfferId = new Set(
      notifications
        .filter(
          (x) =>
            visibleUnread(x) &&
            x.type !== 'message' &&
            typeof x.offerId === 'string' &&
            x.offerId.trim() !== ''
        )
        .map((x) => String(x.offerId).trim())
    );

    for (const o of listingOfferRows) {
      if (o.listingOwnerUserId !== me) continue;
      if (o.status !== 'pending' && o.status !== 'pending_confirmation') continue;
      if (hasUnreadNonMessageNotifForOfferId.has(o.id)) continue;
      total += 1;
    }

    return total;
  }, [notifications, requests, offers, listingOfferRows]);
}

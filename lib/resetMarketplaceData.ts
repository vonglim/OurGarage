import { clearAllChats } from '@/store/chatStore';
import { clearAllNotifications } from '@/store/notificationsStore';
import { clearAllOffers } from '@/store/offersStore';
import { clearAllListings } from '@/store/listingsStore';
import { clearAllRequests } from '@/store/requestsStore';
import { useRentalConditionStore } from '@/store/rentalConditionStore';
import { clearAllUserReviews } from '@/store/userReviewsStore';

/**
 * Reset in-memory marketplace data to empty (requests, offers, listings, rentals).
 * Also clears related chats, alerts, saved reviews, and rental handoff/return photos.
 */
export function resetMarketplaceData(): void {
  clearAllRequests();
  clearAllOffers();
  clearAllListings();
  clearAllChats();
  clearAllNotifications();
  clearAllUserReviews();
  useRentalConditionStore.getState().clearAll();
}

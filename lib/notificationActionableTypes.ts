import type { AppNotificationType } from '@/store/notificationsStore';

/** Non-message notifications that stay unread until the owner acts or opens Alerts. */
export const ACTIONABLE_OWNER_NOTIFICATION_TYPES: readonly AppNotificationType[] = [
  'rental_request',
  'rental_declined',
];

export function isActionableOwnerNotificationType(type: AppNotificationType): boolean {
  return (ACTIONABLE_OWNER_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

import { getAuthUserIdSync } from '@/lib/authUser';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { inferNotificationRecipientIsRenter } from '@/lib/rentalNavigation';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import type { AppNotification } from '@/store/notificationsStore';

/** [rental-transition] events for notification-driven pickup approval gate. */
export type WizardNotificationPromptEvent =
  | 'notification_prompt_armed'
  | 'notification_prompt_rendered'
  | 'notification_prompt_blocking_redirect'
  | 'notification_prompt_acknowledged'
  | 'notification_prompt_continue';

export function logWizardNotificationPrompt(
  rentalId: string,
  event: WizardNotificationPromptEvent,
  extra?: Record<string, unknown>
): void {
  logScenario('transition', {
    event,
    rentalId,
    source: 'wizard_notification_prompt',
    ...extra,
  });
}

/** Owner accepted renter pickup meetup — `rental_confirmed` maps to app type `accepted`. */
export function isPickupMeetupAcceptedNotification(n: AppNotification): boolean {
  if (n.type !== 'accepted') return false;
  if (typeof n.rentalId !== 'string' || n.rentalId.trim() === '') return false;

  const m = (n.message ?? '').toLowerCase();
  if (m.includes('pickup details confirmed')) return true;
  if (m.includes('meetup proposal was accepted')) return true;
  if (m.includes('pickup') && m.includes('meetup')) return true;
  return false;
}

export type WizardPickupPromptSession = {
  rentalId: string;
  isOnCoordinatePickup: () => boolean;
  getCtx: () => RentalWizardContext | null;
  isGateActive: () => boolean;
  armPickupAcceptedPrompt: () => void;
};

const sessions = new Map<string, WizardPickupPromptSession>();

export function registerWizardPickupPromptSession(session: WizardPickupPromptSession): void {
  sessions.set(session.rentalId, session);
}

export function unregisterWizardPickupPromptSession(rentalId: string): void {
  sessions.delete(rentalId);
}

function isRenterRecipientOfPickupAccept(n: AppNotification): boolean {
  const me = getAuthUserIdSync().trim();
  if (!me) return false;
  if (n.forUserId != null && n.forUserId !== '') {
    return n.forUserId === me;
  }
  const inferred = inferNotificationRecipientIsRenter(n);
  return inferred === true;
}

/**
 * Canonical trigger: realtime `accepted` notification for pickup meetup acceptance.
 * Does not compare rental snapshots or wait for wizard refresh.
 */
export function tryArmPickupAcceptedFromNotification(n: AppNotification): boolean {
  if (!isPickupMeetupAcceptedNotification(n)) return false;

  const rentalId = n.rentalId!.trim();
  const session = sessions.get(rentalId);
  if (!session) {
    if (__DEV__) {
      logScenario('transition', {
        event: 'notification_prompt_arm_skipped',
        rentalId,
        source: 'wizard_notification_prompt',
        reason: 'no_active_wizard_session',
        notificationId: n.id,
      });
    }
    return false;
  }

  if (session.isGateActive()) {
    return false;
  }

  if (!isRenterRecipientOfPickupAccept(n)) {
    if (__DEV__) {
      logScenario('transition', {
        event: 'notification_prompt_arm_skipped',
        rentalId,
        source: 'wizard_notification_prompt',
        reason: 'not_renter_recipient',
        notificationId: n.id,
      });
    }
    return false;
  }

  if (!session.isOnCoordinatePickup()) {
    if (__DEV__) {
      logScenario('transition', {
        event: 'notification_prompt_arm_skipped',
        rentalId,
        source: 'wizard_notification_prompt',
        reason: 'not_on_coordinate_pickup',
        notificationId: n.id,
      });
    }
    return false;
  }

  const ctx = session.getCtx();
  if (ctx?.seenTransitions.has('pickup_confirmed_seen')) {
    if (__DEV__) {
      logScenario('transition', {
        event: 'notification_prompt_arm_skipped',
        rentalId,
        source: 'wizard_notification_prompt',
        reason: 'pickup_confirmed_already_seen',
        notificationId: n.id,
      });
    }
    return false;
  }

  session.armPickupAcceptedPrompt();
  logWizardNotificationPrompt(rentalId, 'notification_prompt_armed', {
    notificationId: n.id,
    promptId: 'pickup_coordination_accepted',
    waitingForOwner:
      ctx != null
        ? ctx.hasPendingProposal &&
          String(ctx.rental.last_proposed_by ?? '').trim() === ctx.viewerUserId
        : null,
  });
  return true;
}

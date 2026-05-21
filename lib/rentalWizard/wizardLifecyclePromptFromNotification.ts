import { getAuthUserIdSync } from '@/lib/authUser';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { inferNotificationRecipientIsRenter } from '@/lib/rentalNavigation';
import {
  buildReturnPromptWaitingSnapshot,
  clearReturnProposalWaitingLatch,
  hasReturnProposalWaitingLatch,
  syncReturnProposalWaitingLatch,
} from '@/lib/rentalWizard/returnProposalWaitingLatch';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import type { AppNotification } from '@/store/notificationsStore';

/** [rental-transition] events for notification-driven pickup approval gate. */
export type WizardNotificationPromptEvent =
  | 'notification_prompt_armed'
  | 'notification_prompt_rendered'
  | 'notification_prompt_blocking_redirect'
  | 'notification_prompt_acknowledged'
  | 'notification_prompt_continue';

/** [rental-transition] events for notification-driven return approval gate. */
export type WizardReturnPromptEvent =
  | 'return_prompt_notification_received'
  | 'return_prompt_waiting_state_snapshot'
  | 'return_prompt_arm_evaluation'
  | 'return_prompt_arm_failed_reason'
  | 'return_prompt_armed'
  | 'return_prompt_rendered'
  | 'return_prompt_blocking_redirect'
  | 'return_prompt_acknowledged'
  | 'return_prompt_continue'
  | 'return_prompt_arm_skipped';

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

export function logWizardReturnPrompt(
  rentalId: string,
  event: WizardReturnPromptEvent,
  extra?: Record<string, unknown>
): void {
  logScenario('transition', {
    event,
    rentalId,
    source: 'wizard_return_prompt',
    ...extra,
  });
}

export { syncReturnProposalWaitingLatch };

/** Return meetup acceptance — must be checked before pickup heuristics. */
export function isReturnMeetupAcceptedNotification(n: AppNotification): boolean {
  if (n.type !== 'accepted') return false;
  if (typeof n.rentalId !== 'string' || n.rentalId.trim() === '') return false;
  if (n.meetupAcceptanceKind === 'return') return true;
  if (n.meetupAcceptanceKind === 'pickup' || n.meetupAcceptanceKind === 'extension') return false;

  const m = (n.message ?? '').toLowerCase();
  if (m.includes('return details confirmed')) return true;
  if (m.includes('accepted your return')) return true;
  if (m.includes('return meetup details were approved')) return true;
  if (m.includes('return') && m.includes('approved') && m.includes('meetup')) return true;
  return false;
}

/** Owner accepted renter pickup meetup — `rental_confirmed` maps to app type `accepted`. */
export function isPickupMeetupAcceptedNotification(n: AppNotification): boolean {
  if (isReturnMeetupAcceptedNotification(n)) return false;
  if (n.type !== 'accepted') return false;
  if (typeof n.rentalId !== 'string' || n.rentalId.trim() === '') return false;
  if (n.meetupAcceptanceKind === 'pickup') return true;
  if (n.meetupAcceptanceKind === 'return' || n.meetupAcceptanceKind === 'extension') return false;

  const m = (n.message ?? '').toLowerCase();
  if (m.includes('pickup details confirmed')) return true;
  if (m.includes('meetup proposal was accepted')) return true;
  if (m.includes('pickup') && m.includes('meetup')) return true;
  return false;
}

export type WizardMeetupPromptSession = {
  rentalId: string;
  isOnCoordinatePickup: () => boolean;
  isOnCoordinateReturn: () => boolean;
  getCtx: () => RentalWizardContext | null;
  isGateActive: () => boolean;
  armPickupAcceptedPrompt: () => void;
  armReturnAcceptedPrompt: () => void;
};

/** @deprecated Use WizardMeetupPromptSession */
export type WizardPickupPromptSession = WizardMeetupPromptSession;

const sessions = new Map<string, WizardMeetupPromptSession>();

export function registerWizardMeetupPromptSession(session: WizardMeetupPromptSession): void {
  sessions.set(session.rentalId, session);
}

/** @deprecated Use registerWizardMeetupPromptSession */
export function registerWizardPickupPromptSession(session: WizardMeetupPromptSession): void {
  registerWizardMeetupPromptSession(session);
}

export function unregisterWizardMeetupPromptSession(rentalId: string): void {
  sessions.delete(rentalId);
  clearReturnProposalWaitingLatch(rentalId);
}

/** @deprecated Use unregisterWizardMeetupPromptSession */
export function unregisterWizardPickupPromptSession(rentalId: string): void {
  unregisterWizardMeetupPromptSession(rentalId);
}

function isNotificationRecipient(n: AppNotification): boolean {
  const me = getAuthUserIdSync().trim();
  if (!me) return false;
  if (n.forUserId != null && n.forUserId !== '') {
    return n.forUserId === me;
  }
  return false;
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

function viewerWasWaitingOnProposal(ctx: RentalWizardContext | null): boolean {
  if (!ctx) return false;
  const viewer = ctx.viewerUserId.trim();
  return (
    ctx.hasPendingProposal &&
    String(ctx.rental.last_proposed_by ?? '').trim() === viewer
  );
}

function qualifiesForReturnPromptArming(input: {
  rentalId: string;
  viewerUserId: string;
  ctx: RentalWizardContext | null;
  onCoordinateReturn: boolean;
}): { ok: boolean; reason?: string; latchActive: boolean; ctxWaiting: boolean } {
  const latchActive = hasReturnProposalWaitingLatch(input.rentalId, input.viewerUserId);
  const ctxWaiting = viewerWasWaitingOnProposal(input.ctx);

  if (!input.onCoordinateReturn) {
    return { ok: false, reason: 'not_on_coordinate_return', latchActive, ctxWaiting };
  }
  if (input.ctx?.seenTransitions.has('return_confirmed_seen')) {
    return { ok: false, reason: 'return_confirmed_already_seen', latchActive, ctxWaiting };
  }
  if (!input.ctx?.seenTransitions.has('pickup_confirmed_seen')) {
    return { ok: false, reason: 'pickup_confirmed_not_seen', latchActive, ctxWaiting };
  }
  if (!latchActive && !ctxWaiting) {
    return { ok: false, reason: 'not_waiting_on_return_proposal', latchActive, ctxWaiting };
  }
  return { ok: true, latchActive, ctxWaiting };
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
    waitingForOwner: viewerWasWaitingOnProposal(ctx),
  });
  return true;
}

/**
 * Canonical trigger: realtime `accepted` notification for return meetup acceptance.
 * Uses a session waiting latch so rental refresh clearing pending state cannot race ahead of arming.
 */
export function tryArmReturnAcceptedFromNotification(n: AppNotification): boolean {
  const isReturn = isReturnMeetupAcceptedNotification(n);
  if (!isReturn) return false;

  const rentalId = n.rentalId!.trim();
  const me = getAuthUserIdSync().trim();

  logWizardReturnPrompt(rentalId, 'return_prompt_notification_received', {
    notificationId: n.id,
    meetupAcceptanceKind: n.meetupAcceptanceKind ?? null,
    messagePreview: (n.message ?? '').slice(0, 120),
  });

  const session = sessions.get(rentalId);
  const ctx = session?.getCtx() ?? null;
  const onCoordinateReturn = session?.isOnCoordinateReturn() ?? false;
  const latchActive = hasReturnProposalWaitingLatch(rentalId, me);

  logWizardReturnPrompt(
    rentalId,
    'return_prompt_waiting_state_snapshot',
    buildReturnPromptWaitingSnapshot({ ctx, onCoordinateReturn, latchActive })
  );

  if (!session) {
    logWizardReturnPrompt(rentalId, 'return_prompt_arm_failed_reason', {
      reason: 'no_active_wizard_session',
      notificationId: n.id,
    });
    return false;
  }

  if (session.isGateActive()) {
    logWizardReturnPrompt(rentalId, 'return_prompt_arm_failed_reason', {
      reason: 'gate_already_active',
      notificationId: n.id,
    });
    return false;
  }

  if (!isNotificationRecipient(n)) {
    logWizardReturnPrompt(rentalId, 'return_prompt_arm_failed_reason', {
      reason: 'not_notification_recipient',
      notificationId: n.id,
    });
    return false;
  }

  const evaluation = qualifiesForReturnPromptArming({
    rentalId,
    viewerUserId: me,
    ctx,
    onCoordinateReturn,
  });

  logWizardReturnPrompt(rentalId, 'return_prompt_arm_evaluation', {
    notificationId: n.id,
    ...evaluation,
    ...(evaluation.reason ? { failedReason: evaluation.reason } : {}),
  });

  if (!evaluation.ok) {
    logWizardReturnPrompt(rentalId, 'return_prompt_arm_failed_reason', {
      reason: evaluation.reason ?? 'unknown',
      notificationId: n.id,
      latchActive: evaluation.latchActive,
      ctxWaiting: evaluation.ctxWaiting,
    });
    return false;
  }

  session.armReturnAcceptedPrompt();
  clearReturnProposalWaitingLatch(rentalId);
  logWizardReturnPrompt(rentalId, 'return_prompt_armed', {
    notificationId: n.id,
    promptId: 'return_coordination_accepted',
    armedViaLatch: evaluation.latchActive,
    armedViaCtxWaiting: evaluation.ctxWaiting,
  });
  return true;
}

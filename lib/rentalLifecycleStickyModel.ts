import type { RentalWorkspaceViewerRole } from '@/lib/rentalWorkspaceRoleCopy';
import {
  isPickupHandoffBilaterallyComplete,
  isReturnBilaterallyComplete,
  type RentalOperationalState,
} from '@/lib/rentalOperationalAttention';

export type StickyLifecycleStep = {
  key: 'pickup' | 'active' | 'return';
  label: string;
  done: boolean;
  current: boolean;
};

export type RentalLifecycleStickyModel = {
  steps: StickyLifecycleStep[];
  statusLine: string;
  needsAttention: boolean;
};

function formatCompactWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function relativeReturnLine(iso: string | null | undefined, nowMs: number): string | null {
  const t = parseScheduleMs(iso);
  if (t == null) return null;
  const ms = t - nowMs;
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (ms < -36 * 3600000) return 'Return window has passed';
  if (ms < 0) return 'Return window is here';
  if (hours < 36) return `Return in about ${Math.max(1, hours)} hour${hours === 1 ? '' : 's'}`;
  if (days <= 14) return `Return in ${days} day${days === 1 ? '' : 's'}`;
  return formatCompactWhen(iso);
}

function parseScheduleMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function buildRentalLifecycleStickyModel(input: {
  viewerRole: RentalWorkspaceViewerRole;
  lifecyclePhase: 'pickup' | 'active' | 'return' | 'completed';
  rentalStatus: string;
  meetupCoordinationComplete: boolean;
  pickupHandoffComplete: boolean;
  returnHandoffComplete: boolean;
  pickupOperationalState: RentalOperationalState | null;
  returnOperationalState: RentalOperationalState | null;
  pickupIso: string | null;
  returnIso: string | null;
  hasPendingExtension: boolean;
  nowMs?: number;
}): RentalLifecycleStickyModel {
  const now = input.nowMs ?? Date.now();
  const st = String(input.rentalStatus ?? '').trim().toLowerCase();
  const completed = ['returned', 'completed', 'cancelled'].includes(st) || input.lifecyclePhase === 'completed';

  const pickupDone = input.pickupHandoffComplete;
  const activeDone = pickupDone && (input.lifecyclePhase === 'return' || input.lifecyclePhase === 'completed' || st === 'return_pending');
  const returnDone = input.returnHandoffComplete || completed;

  let currentKey: 'pickup' | 'active' | 'return' = 'pickup';
  if (completed || returnDone) currentKey = 'return';
  else if (pickupDone && (input.lifecyclePhase === 'active' || input.lifecyclePhase === 'return')) currentKey = 'active';
  else if (!pickupDone) currentKey = 'pickup';

  const steps: StickyLifecycleStep[] = [
    { key: 'pickup', label: 'Pickup', done: pickupDone, current: currentKey === 'pickup' },
    { key: 'active', label: 'Active', done: activeDone, current: currentKey === 'active' },
    { key: 'return', label: 'Return', done: returnDone, current: currentKey === 'return' },
  ];

  let statusLine = 'Rental in progress';
  let needsAttention = false;

  if (completed) {
    statusLine = 'Rental complete';
  } else if (input.pickupOperationalState === 'missed_confirmation') {
    needsAttention = true;
    statusLine =
      input.viewerRole === 'owner'
        ? 'Pickup time passed — confirm handoff or report an issue'
        : 'Pickup time passed — confirm receipt or update the host';
  } else if (input.returnOperationalState === 'missed_confirmation') {
    needsAttention = true;
    statusLine =
      input.viewerRole === 'owner'
        ? 'Return time passed — review return or report an issue'
        : 'Return time passed — complete return photos or coordinate drop-off';
  } else if (input.hasPendingExtension) {
    needsAttention = true;
    statusLine =
      input.viewerRole === 'owner'
        ? 'Extension request waiting for your response'
        : 'Extension pending — waiting on the owner';
  } else if (!input.meetupCoordinationComplete) {
    needsAttention = true;
    statusLine = 'Awaiting meetup confirmation';
  } else if (!pickupDone) {
    needsAttention = true;
    statusLine =
      input.viewerRole === 'owner'
        ? 'Complete pickup prep and confirm when ready'
        : 'Review host photos and confirm receipt';
  } else if (currentKey === 'active') {
    const rel = relativeReturnLine(input.returnIso, now);
    statusLine = rel ?? (input.viewerRole === 'owner' ? 'Item is out on rent' : 'You have the item');
  } else if (currentKey === 'return') {
    if (returnDone) {
      statusLine = 'Return recorded';
    } else {
      needsAttention = true;
      statusLine =
        input.viewerRole === 'owner'
          ? 'Review renter return and confirm'
          : 'Finish return photos and checklist';
    }
  }

  if (input.pickupOperationalState === 'running_late' || input.returnOperationalState === 'running_late') {
    statusLine = 'Running late — keep each other posted in Messages';
  }

  return { steps, statusLine, needsAttention };
}

export { isPickupHandoffBilaterallyComplete, isReturnBilaterallyComplete };

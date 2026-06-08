import type { Router } from 'expo-router';

import {
  buildOwnerRentalWizardContextWithDiagnostics,
  resolveOwnerRentalWizardDestination,
} from '@/lib/ownerRentalWizard';
import { buildRentalWizardContextWithDiagnostics } from '@/lib/rentalWizard/buildRentalWizardContext';
import { logRentalActivationSchema } from '@/lib/rentalActivationSchema';
import { safeResolveRentalWizardDestination } from '@/lib/rentalWizard/rentalWizardStepResolver';
import { getAuthUserIdSync } from '@/lib/authUser';
import { isRentalCancelled } from '@/lib/rentalCancellation';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { getSupabase } from '@/lib/supabase';
import type { AppNotification, AppNotificationType } from '@/store/notificationsStore';

const WIZARD_LIFECYCLE_TYPES = new Set<AppNotificationType>([
  'accepted',
  'started',
  'completed',
  'offer_accepted',
  'rental_cancellation_requested',
  'rental_cancellation_accepted',
  'rental_cancellation_declined',
]);

/** Notification types that should open the guided renter wizard (not legacy workspace). */
export function isWizardLifecycleNotificationType(type: AppNotificationType): boolean {
  return WIZARD_LIFECYCLE_TYPES.has(type);
}

/**
 * Rental-linked notification types that should open the guided wizard (when `rentalId` is present).
 * Includes coordination proposals (`message`) and booking confirmation (`offer_accepted`).
 */
export function isRentalJourneyNotificationType(type: AppNotificationType): boolean {
  return WIZARD_LIFECYCLE_TYPES.has(type) || type === 'message' || type === 'offer_accepted';
}

/** Heuristic when notification payload does not include party ids. */
export function inferNotificationRecipientIsRenter(n: AppNotification): boolean | null {
  const m = (n.message ?? '').toLowerCase();
  if (m.includes('your rental request was accepted')) return true;
  if (m.includes('your offer was accepted')) return true;
  if (m.includes('rental approved')) return true;
  if (m.includes('pickup') && m.includes('confirm')) return true;
  if (m.includes('meetup proposal was accepted')) return true;
  if (m.includes('pickup details confirmed')) return true;
  if (m.includes('pickup proposal')) return null;
  if (m.includes('return proposal')) return null;
  if (m.includes('return') && m.includes('confirmed')) return true;
  if (m.includes('return') && (m.includes('coord') || m.includes('schedule'))) return true;
  if (m.includes('requested to rent your')) return false;
  if (m.includes('new rental request')) return false;
  if (n.type === 'rental_cancellation_requested') return null;
  if (n.type === 'rental_cancellation_accepted') return null;
  if (n.type === 'rental_cancellation_declined') return null;
  return null;
}

export async function viewerRoleOnRental(
  rentalId: string
): Promise<'renter' | 'owner' | 'unknown'> {
  const me = getAuthUserIdSync().trim();
  const id = rentalId.trim();
  if (!me || !id) return 'unknown';
  const { data } = await getSupabase()
    .from('rentals')
    .select('renter_user_id, owner_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!data) return 'unknown';
  const renter = String((data as { renter_user_id?: string }).renter_user_id ?? '').trim();
  const owner = String((data as { owner_user_id?: string }).owner_user_id ?? '').trim();
  if (renter === me) return 'renter';
  if (owner === me) return 'owner';
  return 'unknown';
}

export function rentalWizardPath(rentalId: string): `/rental-wizard/${string}` {
  return `/rental-wizard/${rentalId.trim()}`;
}

export function ownerRentalWizardPath(rentalId: string): `/owner-rental-wizard/${string}` {
  return `/owner-rental-wizard/${rentalId.trim()}`;
}

type GuidedRentalPartyIds = {
  renter_user_id?: string | null;
  owner_user_id?: string | null;
};

/** Open renter or owner guided flow from activity / workspace CTAs. */
export function openGuidedRentalFlow(
  router: Router,
  rentalId: string,
  viewerUserId: string,
  row?: GuidedRentalPartyIds | null
): void {
  const id = rentalId.trim();
  const me = viewerUserId.trim();
  if (!id || !me) return;

  if (row) {
    const renter = String(row.renter_user_id ?? '').trim();
    const owner = String(row.owner_user_id ?? '').trim();
    if (renter === me) {
      router.push(rentalWizardPath(id));
      return;
    }
    if (owner === me) {
      router.push(ownerRentalWizardPath(id));
      return;
    }
  }

  void viewerRoleOnRental(id).then((role) => {
    pushRentalEntry(router, id, role);
  });
}

export function rentalWizardCancelledSummaryPath(
  rentalId: string
): `/rental-wizard/${string}/s/cancelled` {
  return `/rental-wizard/${rentalId.trim()}/s/cancelled`;
}

/** Primary entry: renters → renter wizard; owners → owner wizard; unknown → workspace. */
export function pushRentalEntry(router: Router, rentalId: string, role: 'renter' | 'owner' | 'unknown'): void {
  const id = rentalId.trim();
  if (!id) return;
  if (role === 'renter') {
    router.push(rentalWizardPath(id));
    return;
  }
  if (role === 'owner') {
    router.push(ownerRentalWizardPath(id));
    return;
  }
  router.push({ pathname: '/rental/[id]', params: { id } });
}

export function replaceRentalEntry(router: Router, rentalId: string, role: 'renter' | 'owner' | 'unknown'): void {
  const id = rentalId.trim();
  if (!id) return;
  if (role === 'renter') {
    router.replace(rentalWizardPath(id));
    return;
  }
  if (role === 'owner') {
    router.replace(ownerRentalWizardPath(id));
    return;
  }
  router.replace({ pathname: '/rental/[id]', params: { id } });
}

async function pushOwnerWizardResolvedStep(router: Router, rentalId: string): Promise<void> {
  const me = getAuthUserIdSync().trim();
  if (!me) {
    router.push(ownerRentalWizardPath(rentalId));
    return;
  }
  try {
    const { ctx, buildError } = await buildOwnerRentalWizardContextWithDiagnostics(
      getSupabase(),
      rentalId,
      me
    );
    if (!ctx) {
      logRentalActivationSchema({
        rentalId,
        wizardBuildPhase: 'notification_nav',
        resolverCrashLocation: 'pushOwnerWizardResolvedStep',
        error: buildError ?? 'null_context',
      });
      router.push(ownerRentalWizardPath(rentalId));
      return;
    }
    const dest = resolveOwnerRentalWizardDestination(ctx);
    logScenario('routing', {
      event: 'notification_navigate_resolved',
      rentalId,
      notificationType: 'owner_wizard_resolved',
      source: 'pushOwnerWizardResolvedStep',
      step: dest.step,
      path: dest.path,
    });
    router.push(dest.path as `/owner-rental-wizard/${string}/s/${string}`);
  } catch (err) {
    logRentalActivationSchema({
      rentalId,
      wizardBuildPhase: 'notification_nav',
      resolverCrashLocation: 'pushOwnerWizardResolvedStep_uncaught',
      error: err instanceof Error ? err.message : String(err),
    });
    router.push(ownerRentalWizardPath(rentalId));
  }
}

async function pushRenterWizardResolvedStep(router: Router, rentalId: string): Promise<void> {
  const me = getAuthUserIdSync().trim();
  if (!me) {
    router.push(rentalWizardPath(rentalId));
    return;
  }
  try {
    const { ctx, buildError } = await buildRentalWizardContextWithDiagnostics(
      getSupabase(),
      rentalId,
      me
    );
    if (!ctx) {
      logRentalActivationSchema({
        rentalId,
        wizardBuildPhase: 'notification_nav',
        resolverCrashLocation: 'pushRenterWizardResolvedStep',
        error: buildError ?? 'null_context',
      });
      router.push(rentalWizardPath(rentalId));
      return;
    }
    const dest = safeResolveRentalWizardDestination(ctx);
  logScenario('routing', {
    event: 'notification_navigate_resolved',
    rentalId,
    notificationType: 'renter_wizard_resolved',
    source: 'pushRenterWizardResolvedStep',
    step: dest.step,
    path: dest.path,
  });
    router.push(dest.path as `/rental-wizard/${string}/s/${string}`);
  } catch (err) {
    logRentalActivationSchema({
      rentalId,
      wizardBuildPhase: 'notification_nav',
      resolverCrashLocation: 'pushRenterWizardResolvedStep_uncaught',
      error: err instanceof Error ? err.message : String(err),
    });
    router.push(rentalWizardPath(rentalId));
  }
}

/** Role-aware wizard entry at the resolver's current step (primary rental journey entry). */
export async function pushRentalJourneyEntry(
  router: Router,
  rentalId: string,
  n?: AppNotification
): Promise<void> {
  const id = rentalId.trim();
  if (!id) return;

  const inferred = n ? inferNotificationRecipientIsRenter(n) : null;
  if (inferred === true) {
    await pushRenterWizardResolvedStep(router, id);
    return;
  }
  if (inferred === false) {
    await pushOwnerWizardResolvedStep(router, id);
    return;
  }

  const role = await viewerRoleOnRental(id);
  if (role === 'renter') {
    const { data } = await getSupabase()
      .from('rentals')
      .select('status, cancellation_status')
      .eq('id', id)
      .maybeSingle();
    if (data && isRentalCancelled(data)) {
      router.push(rentalWizardCancelledSummaryPath(id));
      return;
    }
    await pushRenterWizardResolvedStep(router, id);
    return;
  }
  if (role === 'owner') {
    await pushOwnerWizardResolvedStep(router, id);
    return;
  }
  pushRentalEntry(router, id, role);
}

/** Notification tap: open guided wizard at the resolver's current step for this rental. */
export async function pushRentalFromNotification(router: Router, n: AppNotification): Promise<void> {
  const rentalId = n.rentalId?.trim() ?? '';
  if (!rentalId) return;

  logScenario('notification', {
    event: 'notification_navigate_start',
    rentalId,
    notificationType: n.type,
    source: 'pushRentalFromNotification',
  });

  if (n.type === 'rental_cancellation_accepted') {
    const role = await viewerRoleOnRental(rentalId);
    if (role === 'renter') {
      router.push(rentalWizardCancelledSummaryPath(rentalId));
      return;
    }
    await pushOwnerWizardResolvedStep(router, rentalId);
    return;
  }

  if (n.type === 'rental_cancellation_requested' || n.type === 'rental_cancellation_declined') {
    const role = await viewerRoleOnRental(rentalId);
    if (role === 'renter') {
      await pushRenterWizardResolvedStep(router, rentalId);
      return;
    }
    await pushOwnerWizardResolvedStep(router, rentalId);
    return;
  }

  await pushRentalJourneyEntry(router, rentalId, n);
}

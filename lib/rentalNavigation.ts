import type { Router } from 'expo-router';

import { buildRentalWizardContext } from '@/lib/rentalWizard/buildRentalWizardContext';
import { resolveRentalWizardDestination } from '@/lib/rentalWizard/rentalWizardStepResolver';
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

/** Heuristic when notification payload does not include party ids. */
export function inferNotificationRecipientIsRenter(n: AppNotification): boolean | null {
  const m = (n.message ?? '').toLowerCase();
  if (m.includes('your rental request was accepted')) return true;
  if (m.includes('your offer was accepted')) return true;
  if (m.includes('rental approved')) return true;
  if (m.includes('pickup') && m.includes('confirm')) return true;
  if (m.includes('meetup proposal was accepted')) return true;
  if (m.includes('pickup details confirmed')) return true;
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

export function rentalWizardCancelledSummaryPath(
  rentalId: string
): `/rental-wizard/${string}/s/cancelled` {
  return `/rental-wizard/${rentalId.trim()}/s/cancelled`;
}

/** Primary entry for renters (wizard); owners and unknown fall back to legacy workspace. */
export function pushRentalEntry(router: Router, rentalId: string, role: 'renter' | 'owner' | 'unknown'): void {
  const id = rentalId.trim();
  if (!id) return;
  if (role === 'renter') {
    router.push(rentalWizardPath(id));
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
  router.replace({ pathname: '/rental/[id]', params: { id } });
}

async function pushRenterWizardResolvedStep(router: Router, rentalId: string): Promise<void> {
  const me = getAuthUserIdSync().trim();
  if (!me) {
    router.push(rentalWizardPath(rentalId));
    return;
  }
  const ctx = await buildRentalWizardContext(getSupabase(), rentalId, me);
  if (!ctx) {
    router.push(rentalWizardPath(rentalId));
    return;
  }
  const dest = resolveRentalWizardDestination(ctx);
  logScenario('routing', {
    event: 'notification_navigate_resolved',
    rentalId,
    notificationType: 'renter_wizard_resolved',
    source: 'pushRenterWizardResolvedStep',
    step: dest.step,
    path: dest.path,
  });
  router.push(dest.path as `/rental-wizard/${string}/s/${string}`);
}

/** Notification tap: renters on lifecycle alerts → wizard; owners → workspace. */
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
    router.push({ pathname: '/rental/[id]', params: { id: rentalId, focus: 'cancelled' } });
    return;
  }

  if (n.type === 'rental_cancellation_requested') {
    const role = await viewerRoleOnRental(rentalId);
    if (role === 'renter') {
      await pushRenterWizardResolvedStep(router, rentalId);
      return;
    }
    router.push({ pathname: '/rental/[id]', params: { id: rentalId } });
    return;
  }

  if (n.type === 'rental_cancellation_declined') {
    const role = await viewerRoleOnRental(rentalId);
    if (role === 'renter') {
      await pushRenterWizardResolvedStep(router, rentalId);
      return;
    }
    router.push({ pathname: '/rental/[id]', params: { id: rentalId } });
    return;
  }

  if (!isWizardLifecycleNotificationType(n.type)) {
    router.push({ pathname: '/rental/[id]', params: { id: rentalId } });
    return;
  }

  const inferred = inferNotificationRecipientIsRenter(n);
  if (inferred === true) {
    router.push(rentalWizardPath(rentalId));
    return;
  }
  if (inferred === false) {
    router.push({ pathname: '/rental/[id]', params: { id: rentalId } });
    return;
  }

  const role = await viewerRoleOnRental(rentalId);
  if (role === 'renter') {
    const { data } = await getSupabase().from('rentals').select('status, cancellation_status').eq('id', rentalId).maybeSingle();
    if (data && isRentalCancelled(data)) {
      router.push(rentalWizardCancelledSummaryPath(rentalId));
      return;
    }
    await pushRenterWizardResolvedStep(router, rentalId);
    return;
  }
  pushRentalEntry(router, rentalId, role);
}

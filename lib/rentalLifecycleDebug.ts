import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';

/**
 * Lifecycle channel logging — listing rental_requests → rentals → notifications.
 * No-op in production builds.
 */
export function logRentalLifecycle(phase: string, payload?: Record<string, unknown>): void {
  logScenario('lifecycle', { event: phase, ...payload });
}

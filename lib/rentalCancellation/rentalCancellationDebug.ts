import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';

export function logRentalCancellation(event: string, payload?: Record<string, unknown>): void {
  logScenario('lifecycle', { event: `cancellation:${event}`, ...payload });
}

declare const __DEV__: boolean;

/**
 * Concise lifecycle logs for listing rental_requests → rentals → notifications.
 * No-op in production builds.
 */
export function logRentalLifecycle(phase: string, payload?: Record<string, unknown>): void {
  if (!__DEV__) return;
  const ts = new Date().toISOString();
  if (payload && Object.keys(payload).length > 0) {
    console.log(`[rental-lifecycle] ${ts} ${phase}`, payload);
  } else {
    console.log(`[rental-lifecycle] ${ts} ${phase}`);
  }
}

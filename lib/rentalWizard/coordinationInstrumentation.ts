export type CoordinationMeetupLane = 'pickup' | 'return';

export type CoordinationNotificationKind =
  | 'pickup_proposal_received'
  | 'return_proposal_received'
  | 'pickup_confirmed'
  | 'return_confirmed';

export function logCoordinationNotification(payload: Record<string, unknown>): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[coordination-notification]', {
    ts: new Date().toISOString(),
    ...payload,
  });
}

export function logCoordinationRealtime(payload: Record<string, unknown>): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[coordination-realtime]', {
    ts: new Date().toISOString(),
    ...payload,
  });
}

export function logCoordinationBanner(payload: Record<string, unknown>): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[coordination-banner]', {
    ts: new Date().toISOString(),
    ...payload,
  });
}

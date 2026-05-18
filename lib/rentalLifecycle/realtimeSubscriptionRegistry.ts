import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';

type SubscriptionRecord = {
  channelName: string;
  rentalId: string;
  source: string;
  createdAt: number;
};

const active = new Map<string, SubscriptionRecord>();

function key(rentalId: string, source: string): string {
  return `${rentalId.trim()}::${source}`;
}

/** DEV-only: detect duplicate realtime channels for the same rental (stress / stale tab). */
export function registerRentalRealtimeSubscription(
  rentalId: string,
  channelName: string,
  source: string
): void {
  const id = rentalId.trim();
  if (!id) return;
  const k = key(id, source);
  const prev = active.get(k);
  if (prev) {
    logScenario('realtime', {
      event: 'duplicate_subscription_warn',
      rentalId: id,
      source,
      channelName,
      previousChannel: prev.channelName,
      message: 'Multiple subscriptions for same rental+source — may cause duplicate refreshes',
    });
  }
  active.set(k, { channelName, rentalId: id, source, createdAt: Date.now() });
  logScenario('realtime', {
    event: 'subscription_registered',
    rentalId: id,
    source,
    channelName,
    activeCount: active.size,
  });
}

export function unregisterRentalRealtimeSubscription(rentalId: string, source: string): void {
  const id = rentalId.trim();
  if (!id) return;
  const k = key(id, source);
  if (active.delete(k)) {
    logScenario('realtime', {
      event: 'subscription_unregistered',
      rentalId: id,
      source,
      activeCount: active.size,
    });
  }
}

export function getActiveRealtimeSubscriptionCount(): number {
  return active.size;
}

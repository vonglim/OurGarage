declare const __DEV__: boolean;

export type ScenarioLogChannel =
  | 'lifecycle'
  | 'realtime'
  | 'routing'
  | 'notification'
  | 'transition';

export type ScenarioLogPayload = {
  /** Short event name, e.g. refresh_started, step_corrected */
  event: string;
  rentalId?: string | null;
  offerId?: string | null;
  notificationType?: string | null;
  /** Wizard or canonical phase when relevant */
  step?: string | null;
  logicalStep?: string | null;
  transitionStep?: string | null;
  source?: string | null;
  [key: string]: unknown;
};

const CHANNEL_PREFIX: Record<ScenarioLogChannel, string> = {
  lifecycle: '[rental-lifecycle]',
  realtime: '[rental-realtime]',
  routing: '[rental-routing]',
  notification: '[rental-notification]',
  transition: '[rental-transition]',
};

/**
 * Structured DEV-only logging for scenario QA.
 * Filter Metro/console by: rental-lifecycle | rental-realtime | rental-routing | etc.
 */
export function logScenario(channel: ScenarioLogChannel, payload: ScenarioLogPayload): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const { event, ...rest } = payload;
  const ts = new Date().toISOString();
  const body: Record<string, unknown> = { ts, event, ...rest };
  const keys = Object.keys(body).filter((k) => body[k] !== undefined && body[k] !== null);
  const compact = Object.fromEntries(keys.map((k) => [k, body[k]]));
  console.log(`${CHANNEL_PREFIX[channel]} ${event}`, compact);
}

import { needsDeliveryFee } from '@/lib/deliveryFormat';
import { formatUsd } from '@/lib/money';

/** Negotiated fulfillment: explicit pickup vs owner-provided delivery (fee separate). */
export type NegotiationDeliveryMethod = 'pickup' | 'owner_delivery';

export const NEGOTIATION_DELIVERY_SHORT_LABEL: Record<NegotiationDeliveryMethod, string> = {
  pickup: 'Pickup',
  owner_delivery: 'Owner delivery',
};

/** Default method when starting an offer from a request that asked for delivery vs pickup. */
export function defaultNegotiationDeliveryMethodForRequest(how: unknown): NegotiationDeliveryMethod {
  return needsDeliveryFee(how) ? 'owner_delivery' : 'pickup';
}

const METHOD_LINE = /^[ \t]*Delivery method:\s*(.+)\s*$/im;

export function parseNegotiationDeliveryMethodFromMessage(
  message: string | null | undefined,
  requestHowFallback?: string | null | undefined
): NegotiationDeliveryMethod {
  const text = String(message ?? '');
  const m = text.match(METHOD_LINE);
  if (m) {
    const v = m[1].trim().toLowerCase();
    if (v.includes('owner')) return 'owner_delivery';
    if (v.includes('pickup')) return 'pickup';
  }
  if (/^\s*Delivery fee:/im.test(text)) {
    return 'owner_delivery';
  }
  return defaultNegotiationDeliveryMethodForRequest(requestHowFallback);
}

/** Fee amount when `owner_delivery`; `0` = free. `null` when pickup or unknown. */
export function parseNegotiationDeliveryFeeFromMessage(
  message: string | null | undefined,
  method: NegotiationDeliveryMethod
): number | null {
  if (method !== 'owner_delivery') return null;
  const text = String(message ?? '');
  const m = text.match(/^\s*Delivery fee:\s*(.+)\s*$/im);
  if (!m) return null;
  const rest = m[1].trim();
  if (/^free(\s+delivery)?$/i.test(rest)) return 0;
  if (/^\$?\s*0(?:\.0+)?$/i.test(rest)) return 0;
  const dollar = rest.match(/\$?\s*([0-9,]+(?:\.[0-9]+)?)/);
  if (!dollar) return null;
  const n = Number(String(dollar[1]).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * User-facing delivery summary. Never returns "Delivery: $0" for owner delivery — use "Free delivery".
 */
export function formatNegotiatedDeliverySummary(args: {
  method: NegotiationDeliveryMethod;
  fee: number | null;
}): string {
  if (args.method === 'pickup') return 'Pickup';
  const f = args.fee;
  if (f == null) return 'Owner delivery';
  if (f <= 0) return 'Free delivery';
  return `Delivery: ${formatUsd(f)}`;
}

/** Second line for cards that separate method vs fee (e.g. detail rows). */
export function formatNegotiatedDeliveryFeeDetail(args: {
  method: NegotiationDeliveryMethod;
  fee: number | null;
}): string | null {
  if (args.method === 'pickup') return null;
  if (args.fee == null) return null;
  if (args.fee <= 0) return 'Free delivery';
  return `Delivery: ${formatUsd(args.fee)}`;
}

export function formatNegotiationDeliveryMethodLine(method: NegotiationDeliveryMethod): string {
  return `Delivery method: ${NEGOTIATION_DELIVERY_SHORT_LABEL[method]}`;
}

/** Persisted term line; never `Delivery fee: $0`. */
export function formatNegotiationDeliveryFeeTermLine(fee: number): string {
  if (fee <= 0) return 'Delivery fee: Free delivery';
  return `Delivery fee: ${formatUsd(fee)}`;
}

export function resolveNegotiationDeliveryForWrite(input: {
  message?: string | null;
  explicit?: { method: NegotiationDeliveryMethod; fee: number | null } | null;
  requestHowFallback?: string | null;
}): { method: NegotiationDeliveryMethod; fee: number | null } {
  if (input.explicit) {
    const m = input.explicit.method;
    return {
      method: m,
      fee: m === 'pickup' ? null : input.explicit.fee ?? 0,
    };
  }
  const msg = input.message ?? '';
  const method = parseNegotiationDeliveryMethodFromMessage(msg, input.requestHowFallback);
  const fee = parseNegotiationDeliveryFeeFromMessage(msg, method);
  return {
    method,
    fee: method === 'pickup' ? null : fee ?? 0,
  };
}

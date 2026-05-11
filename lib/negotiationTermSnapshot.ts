import { needsDeliveryFee } from '@/lib/deliveryFormat';
import { formatUsd } from '@/lib/money';
import {
  parseNegotiationDeliveryFeeFromMessage,
  parseNegotiationDeliveryMethodFromMessage,
  type NegotiationDeliveryMethod,
} from '@/lib/negotiationDelivery';
import { getNumericOfferPrice } from '@/lib/money';
import type { Offer } from '@/lib/negotiationOfferTypes';
import type { SupabaseRequestChatMessageRow } from '@/lib/supabaseRequestChatMessages';

const EPS = 0.009;

/** Request fields needed for schedule / meetup in negotiation diffs. */
export type RequestPricingContext = {
  how?: string | null | undefined;
  durationType?: string | null | undefined;
  durationValue?: number | null | undefined;
  pickupDate?: string | null | undefined;
  returnDate?: string | null | undefined;
  location?: string | null | undefined;
  pickupRadiusMiles?: number | null | undefined;
  /** Request’s suggested delivery fee when the message omits a numeric fee (legacy). */
  deliveryFee?: number | null | undefined;
};

/**
 * User-meaningful negotiation inputs only (no derived late fees, protection math, or auto totals).
 * Schedule / location are copied from the request when building a snapshot; they only
 * differ in a diff if callers supply different request context between before/after.
 */
export type NegotiationTermsSnapshot = {
  totalPrice: number;
  negotiatedDeliveryMethod: NegotiationDeliveryMethod;
  /** Amount when `owner_delivery`; null when pickup. */
  negotiatedDeliveryFee: number | null;
  pickupDateLabel: string | null;
  returnDateLabel: string | null;
  meetupLocation: string | null;
  /** Normalized optional note before the `Terms (optional):` block. */
  freeformNoteNormalized: string;
};

export function normalizeNegotiationText(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function extractFreeformNoteBeforeTerms(message: string | null | undefined): string {
  const body = String(message ?? '');
  const m = body.match(/\n?\s*Terms \(optional\):/i);
  if (!m || m.index == null || m.index <= 0) return body.trim();
  return body.slice(0, m.index).trim();
}

function readRequestScheduleContext(request: RequestPricingContext | null | undefined): Pick<
  NegotiationTermsSnapshot,
  'pickupDateLabel' | 'returnDateLabel' | 'meetupLocation'
> {
  if (!request || typeof request !== 'object') {
    return {
      pickupDateLabel: null,
      returnDateLabel: null,
      meetupLocation: null,
    };
  }
  const r = request as Record<string, unknown>;
  const pickup = typeof r.pickupDate === 'string' ? r.pickupDate.trim() : '';
  const ret = typeof r.returnDate === 'string' ? r.returnDate.trim() : '';
  const loc = typeof r.location === 'string' ? r.location.trim() : '';
  return {
    pickupDateLabel: pickup.length > 0 ? pickup : null,
    returnDateLabel: ret.length > 0 ? ret : null,
    meetupLocation: loc.length > 0 ? loc : null,
  };
}

function requestDeliveryFallbackNum(request: RequestPricingContext | null | undefined): number | null {
  if (!request || typeof request !== 'object') return null;
  const r = request as Record<string, unknown>;
  const fee = r.deliveryFee;
  if (typeof fee === 'number' && Number.isFinite(fee)) return Math.max(0, fee);
  if (fee != null && String(fee).trim() !== '') {
    const n = Number(String(fee).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  return null;
}

/** Resolved negotiated delivery + numeric fee for totals (legacy fallback from request). */
export function negotiatedDeliveryForMessageAndRequest(
  body: string,
  request: RequestPricingContext
): { method: NegotiationDeliveryMethod; fee: number } {
  const method = parseNegotiationDeliveryMethodFromMessage(body, request.how);
  let parsed = parseNegotiationDeliveryFeeFromMessage(body, method);
  if (method === 'owner_delivery' && parsed == null) {
    const fb = requestDeliveryFallbackNum(request);
    if (fb != null && needsDeliveryFee(request.how)) parsed = fb;
    else parsed = 0;
  }
  const fee = method === 'owner_delivery' ? Math.max(0, parsed ?? 0) : 0;
  return { method, fee };
}

/** Prefer persisted `offers` columns when present; otherwise parse the offer message. */
export function negotiatedDeliveryForOffer(
  offer: Pick<Offer, 'message' | 'negotiationDeliveryMethod' | 'negotiationDeliveryFee'>,
  request: RequestPricingContext
): { method: NegotiationDeliveryMethod; fee: number } {
  const m = offer.negotiationDeliveryMethod;
  if (m === 'pickup') return { method: 'pickup', fee: 0 };
  if (m === 'owner_delivery') {
    if (typeof offer.negotiationDeliveryFee === 'number' && Number.isFinite(offer.negotiationDeliveryFee)) {
      return { method: 'owner_delivery', fee: Math.max(0, offer.negotiationDeliveryFee) };
    }
  }
  return negotiatedDeliveryForMessageAndRequest(String(offer.message ?? ''), request);
}

/** Base / delivery / total for UI, respecting poster counter price semantics. */
export function negotiatedOfferTotals(
  offer: Pick<
    Offer,
    | 'message'
    | 'currentPrice'
    | 'price'
    | 'lastNegotiationEventKind'
    | 'negotiationDeliveryMethod'
    | 'negotiationDeliveryFee'
  >,
  request: RequestPricingContext
): { base: number; delivery: number; total: number; method: NegotiationDeliveryMethod } {
  const { method, fee: del } = negotiatedDeliveryForOffer(offer, request);
  const raw = getNumericOfferPrice(offer);
  const lastIsPosterCounter = offer.lastNegotiationEventKind === 'poster_counter';
  if (lastIsPosterCounter) {
    const total = raw;
    const base = Math.max(0, total - (method === 'owner_delivery' ? del : 0));
    return { base, delivery: del, total, method };
  }
  const base = raw;
  const total = base + (method === 'owner_delivery' ? del : 0);
  return { base, delivery: del, total, method };
}

/** Build pricing context from a persisted request row (store / Supabase shape). */
export function buildRequestPricingContextFromRequest(
  request: Record<string, unknown> | null | undefined
): RequestPricingContext | null {
  if (!request || typeof request !== 'object') return null;
  const how = typeof request.how === 'string' ? request.how : undefined;
  const pickupDate = typeof request.pickupDate === 'string' ? request.pickupDate : undefined;
  const returnDate = typeof request.returnDate === 'string' ? request.returnDate : undefined;
  const location = typeof request.location === 'string' ? request.location : undefined;
  const durationType = typeof request.durationType === 'string' ? request.durationType : undefined;
  const durationValueRaw = request.durationValue;
  const durationValue =
    typeof durationValueRaw === 'number' && Number.isFinite(durationValueRaw)
      ? durationValueRaw
      : undefined;
  const pickupRadiusMilesRaw = request.pickupRadiusMiles;
  const pickupRadiusMiles =
    typeof pickupRadiusMilesRaw === 'number' && Number.isFinite(pickupRadiusMilesRaw)
      ? pickupRadiusMilesRaw
      : undefined;
  const deliveryFeeRaw = request.deliveryFee;
  let deliveryFee: number | null | undefined;
  if (typeof deliveryFeeRaw === 'number' && Number.isFinite(deliveryFeeRaw)) {
    deliveryFee = deliveryFeeRaw;
  } else if (deliveryFeeRaw != null && String(deliveryFeeRaw).trim() !== '') {
    const n = Number(String(deliveryFeeRaw).replace(/[^0-9.]/g, ''));
    deliveryFee = Number.isFinite(n) ? n : undefined;
  }
  return {
    how,
    pickupDate,
    returnDate,
    location,
    durationType,
    durationValue,
    pickupRadiusMiles,
    deliveryFee,
  };
}

/**
 * Compare / poster list sort: lowest full transaction total first (rental + delivery when applicable).
 */
export function sortOffersByLowestNegotiatedTotal(
  offers: Offer[],
  request: RequestPricingContext
): Offer[] {
  return [...offers].sort((a, b) => {
    const ta = negotiatedOfferTotals(a, request).total;
    const tb = negotiatedOfferTotals(b, request).total;
    if (Math.abs(ta - tb) > EPS) return ta - tb;
    // Stable tie-break only — not recency (compare order must reflect total cost alone).
    return String(a.id).localeCompare(String(b.id));
  });
}

function buildUserNegotiationSnapshot(args: {
  totalPrice: number;
  negotiatedDeliveryMethod: NegotiationDeliveryMethod;
  negotiatedDeliveryFee: number | null;
  body: string;
  request: RequestPricingContext;
}): NegotiationTermsSnapshot {
  const ctx = readRequestScheduleContext(args.request);
  return {
    totalPrice: args.totalPrice,
    negotiatedDeliveryMethod: args.negotiatedDeliveryMethod,
    negotiatedDeliveryFee: args.negotiatedDeliveryFee,
    pickupDateLabel: ctx.pickupDateLabel,
    returnDateLabel: ctx.returnDateLabel,
    meetupLocation: ctx.meetupLocation,
    freeformNoteNormalized: normalizeNegotiationText(extractFreeformNoteBeforeTerms(args.body)),
  };
}

/** Build snapshot from counter-offer draft or baseline (merged message + numeric fields). */
export function buildSnapshotFromCounterDraft(args: {
  basePrice: number;
  negotiationDeliveryMethod: NegotiationDeliveryMethod;
  negotiationDeliveryFee: number;
  mergedMessage: string;
  request: RequestPricingContext;
}): NegotiationTermsSnapshot {
  const feeNum =
    args.negotiationDeliveryMethod === 'owner_delivery'
      ? Math.max(0, args.negotiationDeliveryFee)
      : null;
  const del = feeNum ?? 0;
  const base = Math.max(0, args.basePrice);
  const total = base + del;
  return buildUserNegotiationSnapshot({
    totalPrice: total,
    negotiatedDeliveryMethod: args.negotiationDeliveryMethod,
    negotiatedDeliveryFee: feeNum,
    body: args.mergedMessage,
    request: args.request,
  });
}

/** Map a negotiation `offer_messages` row into a comparable snapshot. */
export function snapshotFromNegotiationMessageRow(
  row: Pick<SupabaseRequestChatMessageRow, 'kind' | 'price' | 'body'>,
  request: RequestPricingContext
): NegotiationTermsSnapshot {
  const body = String(row.body ?? '');
  const { method, fee: del } = negotiatedDeliveryForMessageAndRequest(body, request);
  const feeForSnap = method === 'owner_delivery' ? del : null;
  const p = typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : 0;
  let base = 0;
  let total = 0;
  if (row.kind === 'poster_counter') {
    total = Math.max(0, p);
    base = Math.max(0, total - del);
  } else {
    base = Math.max(0, p);
    total = base + del;
  }
  return buildUserNegotiationSnapshot({
    totalPrice: total,
    negotiatedDeliveryMethod: method,
    negotiatedDeliveryFee: feeForSnap,
    body,
    request,
  });
}

/** Rows usable for before/after counter comparison (excludes chat-only kinds). */
const NEGOTIATION_DIFF_KINDS = new Set(['initial', 'renter_update', 'poster_counter']);

export function filterNegotiationDiffRows(
  rows: SupabaseRequestChatMessageRow[]
): SupabaseRequestChatMessageRow[] {
  return rows.filter((r) => NEGOTIATION_DIFF_KINDS.has(String(r.kind ?? '').trim()));
}

type ChangeVariant = 'incoming' | 'outgoing';

function pushTotalPrice(
  out: string[],
  before: number,
  after: number,
  variant: ChangeVariant
): void {
  if (Math.abs(before - after) <= EPS) return;
  if (variant === 'incoming') {
    out.push(`Total price changed from ${formatUsd(before)} → ${formatUsd(after)}`);
  } else {
    out.push(`Total price: ${formatUsd(before)} → ${formatUsd(after)}`);
  }
}

function feePhrase(amount: number): string {
  if (amount <= EPS) return 'Free delivery';
  return formatUsd(amount);
}

function pushNegotiatedDelivery(
  out: string[],
  before: NegotiationTermsSnapshot,
  after: NegotiationTermsSnapshot,
  variant: ChangeVariant
): void {
  const m0 = before.negotiatedDeliveryMethod;
  const m1 = after.negotiatedDeliveryMethod;

  if (m0 !== m1) {
    if (m0 === 'owner_delivery' && m1 === 'pickup') {
      if (variant === 'incoming') {
        out.push('Delivery changed to pickup');
      } else {
        out.push('Delivery changed to pickup');
        out.push('Delivery fee removed');
      }
      return;
    }
    if (m0 === 'pickup' && m1 === 'owner_delivery') {
      const a = after.negotiatedDeliveryFee ?? 0;
      if (variant === 'incoming') {
        out.push('Delivery changed to owner delivery');
        out.push(`Delivery fee set to ${feePhrase(a)}`);
      } else {
        out.push('Delivery method: Pickup → Owner delivery');
        out.push(`Delivery fee set to ${feePhrase(a)}`);
      }
      return;
    }
  }

  if (m0 === 'owner_delivery' && m1 === 'owner_delivery') {
    const b = before.negotiatedDeliveryFee ?? 0;
    const a = after.negotiatedDeliveryFee ?? 0;
    if (Math.abs(b - a) <= EPS) return;
    if (variant === 'incoming') {
      out.push(`Delivery fee changed from ${feePhrase(b)} → ${feePhrase(a)}`);
    } else {
      out.push(`Delivery fee: ${feePhrase(b)} → ${feePhrase(a)}`);
    }
  }
}

function pushUserTextField(
  out: string[],
  label: string,
  before: string | null,
  after: string | null,
  variant: ChangeVariant
): void {
  const nb = normalizeNegotiationText(before ?? '');
  const na = normalizeNegotiationText(after ?? '');
  if (nb === na) return;
  const b = (before ?? '').trim();
  const a = (after ?? '').trim();
  if (!b && a) {
    out.push(variant === 'incoming' ? `${label} added` : `${label} set`);
    return;
  }
  if (b && !a) {
    out.push(`${label} cleared`);
    return;
  }
  if (variant === 'incoming') {
    out.push(`${label} updated`);
  } else {
    out.push(`${label}: ${b} → ${a}`);
  }
}

/**
 * Human-readable bullets for what the user intentionally changed (allowlisted inputs only).
 * `incoming` = recipient of counter; `outgoing` = preview before sending your counter.
 */
export function negotiationChangeBullets(
  before: NegotiationTermsSnapshot,
  after: NegotiationTermsSnapshot,
  variant: ChangeVariant,
  opts?: { counterpartyNoun?: string }
): string[] {
  const out: string[] = [];
  pushTotalPrice(out, before.totalPrice, after.totalPrice, variant);
  pushNegotiatedDelivery(out, before, after, variant);
  pushUserTextField(out, 'Pickup date', before.pickupDateLabel, after.pickupDateLabel, variant);
  pushUserTextField(out, 'Return date', before.returnDateLabel, after.returnDateLabel, variant);
  pushUserTextField(out, 'Meetup location', before.meetupLocation, after.meetupLocation, variant);

  const noteBefore = before.freeformNoteNormalized;
  const noteAfter = after.freeformNoteNormalized;
  if (noteBefore !== noteAfter) {
    const noun = opts?.counterpartyNoun?.trim();
    if (variant === 'incoming' && noun) {
      if (!noteBefore && noteAfter) {
        out.push(`Added message from ${noun}`);
      } else {
        out.push(`Message from ${noun} updated`);
      }
    } else if (variant === 'outgoing') {
      if (!noteBefore && noteAfter) {
        out.push('Message added');
      } else if (noteBefore && noteAfter) {
        out.push('Message updated');
      } else if (noteBefore && !noteAfter) {
        out.push('Message removed');
      }
    }
  }

  return out.filter(Boolean);
}

export function hasMeaningfulNegotiationChange(
  before: NegotiationTermsSnapshot,
  after: NegotiationTermsSnapshot
): boolean {
  if (Math.abs(before.totalPrice - after.totalPrice) > EPS) return true;
  if (before.negotiatedDeliveryMethod !== after.negotiatedDeliveryMethod) return true;
  if (
    before.negotiatedDeliveryMethod === 'owner_delivery' &&
    after.negotiatedDeliveryMethod === 'owner_delivery'
  ) {
    const b = before.negotiatedDeliveryFee ?? 0;
    const a = after.negotiatedDeliveryFee ?? 0;
    if (Math.abs(b - a) > EPS) return true;
  }
  if (before.freeformNoteNormalized !== after.freeformNoteNormalized) return true;
  if (
    normalizeNegotiationText(before.pickupDateLabel ?? '') !==
    normalizeNegotiationText(after.pickupDateLabel ?? '')
  ) {
    return true;
  }
  if (
    normalizeNegotiationText(before.returnDateLabel ?? '') !==
    normalizeNegotiationText(after.returnDateLabel ?? '')
  ) {
    return true;
  }
  if (
    normalizeNegotiationText(before.meetupLocation ?? '') !==
    normalizeNegotiationText(after.meetupLocation ?? '')
  ) {
    return true;
  }
  return false;
}

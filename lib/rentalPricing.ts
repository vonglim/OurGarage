import type { HandoffPreference } from '@/lib/insertRentalRequest';
import {
  estimateListingRentalTotalFromCalendar,
  type ListingDetailDurationKey,
} from '@/lib/listingRentalEstimate';
import { parseStructuredListingDescription } from '@/lib/listingStructuredDescription';
import { formatUsd, parseMoneyToNumber } from '@/lib/money';
import type { ToolListing } from '@/store/listingsStore';

/** When true, use "Estimated total" — when false, clarify taxes are not included yet. */
export const RENTAL_TAXES_INCLUDED_IN_ESTIMATE = false;

export type RentalPricingBreakdownRow = {
  key: string;
  label: string;
  amount: number;
  emphasis?: 'default' | 'total';
};

export type ListingRentalPricingInput = {
  listing: Pick<ToolListing, 'price' | 'priceUnit' | 'weeklyPrice' | 'description' | 'meta'>;
  rentalStartIso: string | null;
  rentalEndIso: string | null;
  durationKey: ListingDetailDurationKey;
  handoff: HandoffPreference;
  /** When set (e.g. negotiated offer), overrides listing catalog delivery fee. */
  negotiatedDeliveryFee?: number | null;
  // TODO: platform/service fee override when billing ships
  // TODO: taxes jurisdiction input
  // TODO: protection / insurance tier selection
  // TODO: promotional discount code
  // TODO: account credits / refunds applied
};

export type ListingRentalPricingResult = {
  subtotal: number;
  deliveryFee: number;
  /** Platform / service fee — 0 until billing implements. */
  serviceFee: number;
  /** Tax amount — null until tax engine implements. */
  taxes: number | null;
  /** Optional protection / insurance fee — 0 until product ships. */
  protectionFee: number;
  /** Promotional discount (positive number = dollars off). */
  promotionalDiscount: number;
  /** Credits or refunds applied (positive number = dollars off). */
  creditsApplied: number;
  selectedMethod: HandoffPreference;
  estimatedTotal: number;
  /** Same as estimatedTotal — explicit alias for checkout/receipt parity. */
  finalComputedTotal: number;
  handoffSummaryLine: string;
  pricingBreakdownRows: RentalPricingBreakdownRow[];
  taxesIncludedInEstimate: boolean;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** True when renter chose owner delivery (fee may apply). */
export function deliveryFeeAppliesForHandoff(handoff: HandoffPreference): boolean {
  return handoff === 'owner_delivery';
}

function parseDeliveryFeePreferenceAmount(raw: string | null | undefined): number {
  const t = String(raw ?? '').trim();
  if (!t || /^free/i.test(t)) return 0;
  const n = parseMoneyToNumber(t);
  return n != null && n >= 0 ? n : 0;
}

/**
 * Listing catalog delivery fee from wizard meta / structured description.
 * Pass `negotiatedDeliveryFee` when terms were updated in negotiation.
 */
export function resolveListingDeliveryFeeAmount(
  listing: Pick<ToolListing, 'description' | 'meta'>,
  negotiatedDeliveryFee?: number | null
): number {
  if (
    negotiatedDeliveryFee != null &&
    Number.isFinite(negotiatedDeliveryFee) &&
    negotiatedDeliveryFee >= 0
  ) {
    return negotiatedDeliveryFee;
  }

  const fromMeta = listing.meta?.deliveryFeePreference?.trim();
  if (fromMeta) return parseDeliveryFeePreferenceAmount(fromMeta);

  const parsed = parseStructuredListingDescription(listing.description?.trim() ?? '');
  return parseDeliveryFeePreferenceAmount(parsed.deliveryFee);
}

/** Pickup / delivery row on review screens (not the pricing breakdown). */
export function formatRentalHandoffSummaryLine(
  handoff: HandoffPreference,
  deliveryFee: number
): string {
  switch (handoff) {
    case 'pickup':
      return 'Pickup';
    case 'either':
      return 'Either';
    case 'owner_delivery':
      return deliveryFee > 0 ? `Delivery (+${formatUsd(deliveryFee)})` : 'Delivery';
    default:
      return handoff;
  }
}

export function getEstimatedTotalLabel(taxesIncluded = RENTAL_TAXES_INCLUDED_IN_ESTIMATE): string {
  return taxesIncluded ? 'Estimated total' : 'Estimated total before taxes';
}

function sumEstimatedTotal(parts: {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  taxes: number | null;
  protectionFee: number;
  promotionalDiscount: number;
  creditsApplied: number;
}): number {
  const taxPart = parts.taxes ?? 0;
  const discounts = parts.promotionalDiscount + parts.creditsApplied;
  return roundMoney(
    parts.subtotal +
      parts.deliveryFee +
      parts.serviceFee +
      taxPart +
      parts.protectionFee -
      discounts
  );
}

/**
 * Builds display rows for {@link RentalPricingBreakdown}.
 * Insert future fee rows here (service, tax, protection, discounts).
 */
export function buildRentalPricingBreakdownRows(
  pricing: Pick<
    ListingRentalPricingResult,
    | 'subtotal'
    | 'deliveryFee'
    | 'serviceFee'
    | 'taxes'
    | 'protectionFee'
    | 'promotionalDiscount'
    | 'creditsApplied'
    | 'estimatedTotal'
    | 'selectedMethod'
    | 'taxesIncludedInEstimate'
  >
): RentalPricingBreakdownRow[] {
  const rows: RentalPricingBreakdownRow[] = [
    { key: 'subtotal', label: 'Rental subtotal', amount: pricing.subtotal, emphasis: 'default' },
  ];

  if (deliveryFeeAppliesForHandoff(pricing.selectedMethod) && pricing.deliveryFee > 0) {
    rows.push({
      key: 'delivery_fee',
      label: 'Delivery fee',
      amount: pricing.deliveryFee,
      emphasis: 'default',
    });
  }

  // TODO: service / platform fee row when serviceFee > 0
  if (pricing.serviceFee > 0) {
    rows.push({
      key: 'service_fee',
      label: 'Service fee',
      amount: pricing.serviceFee,
      emphasis: 'default',
    });
  }

  // TODO: protection fee row when protectionFee > 0
  if (pricing.protectionFee > 0) {
    rows.push({
      key: 'protection_fee',
      label: 'Protection fee',
      amount: pricing.protectionFee,
      emphasis: 'default',
    });
  }

  // TODO: taxes row when taxes != null && taxes > 0
  if (pricing.taxes != null && pricing.taxes > 0) {
    rows.push({
      key: 'taxes',
      label: pricing.taxesIncludedInEstimate ? 'Taxes' : 'Estimated taxes',
      amount: pricing.taxes,
      emphasis: 'default',
    });
  }

  // TODO: promotional discount row (negative display)
  if (pricing.promotionalDiscount > 0) {
    rows.push({
      key: 'promo_discount',
      label: 'Promotional discount',
      amount: -pricing.promotionalDiscount,
      emphasis: 'default',
    });
  }

  // TODO: credits / refunds row
  if (pricing.creditsApplied > 0) {
    rows.push({
      key: 'credits',
      label: 'Credits applied',
      amount: -pricing.creditsApplied,
      emphasis: 'default',
    });
  }

  rows.push({
    key: 'estimated_total',
    label: getEstimatedTotalLabel(pricing.taxesIncludedInEstimate),
    amount: pricing.estimatedTotal,
    emphasis: 'total',
  });

  return rows;
}

/**
 * Canonical estimated total for listing rental requests (Step 3 review, submit, receipts).
 */
export function computeListingRentalRequestPricing(
  input: ListingRentalPricingInput
): ListingRentalPricingResult {
  const subtotal = estimateListingRentalTotalFromCalendar({
    listing: input.listing,
    rentalStartIso: input.rentalStartIso,
    rentalEndIso: input.rentalEndIso,
    durationKey: input.durationKey,
  });

  const catalogFee = resolveListingDeliveryFeeAmount(input.listing, input.negotiatedDeliveryFee);
  const deliveryFee = deliveryFeeAppliesForHandoff(input.handoff) ? catalogFee : 0;

  // TODO: resolve serviceFee from platform fee schedule
  const serviceFee = 0;
  // TODO: compute taxes from jurisdiction + subtotal
  const taxes: number | null = null;
  // TODO: protection tier selection
  const protectionFee = 0;
  // TODO: promotional discount from code
  const promotionalDiscount = 0;
  // TODO: account credits / refunds
  const creditsApplied = 0;

  const taxesIncludedInEstimate = RENTAL_TAXES_INCLUDED_IN_ESTIMATE;
  const estimatedTotal = sumEstimatedTotal({
    subtotal: roundMoney(subtotal),
    deliveryFee,
    serviceFee,
    taxes,
    protectionFee,
    promotionalDiscount,
    creditsApplied,
  });

  const handoffSummaryLine = formatRentalHandoffSummaryLine(input.handoff, catalogFee);

  const partial: ListingRentalPricingResult = {
    subtotal: roundMoney(subtotal),
    deliveryFee,
    serviceFee,
    taxes,
    protectionFee,
    promotionalDiscount,
    creditsApplied,
    selectedMethod: input.handoff,
    estimatedTotal,
    finalComputedTotal: estimatedTotal,
    handoffSummaryLine,
    pricingBreakdownRows: [],
    taxesIncludedInEstimate,
  };

  partial.pricingBreakdownRows = buildRentalPricingBreakdownRows(partial);

  logRentalPricing(partial, { source: 'computeListingRentalRequestPricing' });
  return partial;
}

export function logRentalPricing(
  pricing: ListingRentalPricingResult,
  extra?: Record<string, unknown>
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[rental-pricing]', {
    subtotal: pricing.subtotal,
    deliveryFee: pricing.deliveryFee,
    serviceFee: pricing.serviceFee,
    taxes: pricing.taxes,
    protectionFee: pricing.protectionFee,
    selectedMethod: pricing.selectedMethod,
    estimatedTotal: pricing.estimatedTotal,
    finalComputedTotal: pricing.finalComputedTotal,
    handoffSummaryLine: pricing.handoffSummaryLine,
    pricingBreakdownRows: pricing.pricingBreakdownRows,
    ...extra,
  });
}

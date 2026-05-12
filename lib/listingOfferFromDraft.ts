import { NEGOTIATION_LATE_FEE_TERMS_LINE } from '@/lib/counterOfferMessage';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import type { StoredOfferEvidence } from '@/lib/offerEvidencePhotos';
import {
  OFFER_EVIDENCE_SCHEMA_VERSION,
  flattenOfferImageUrlsFromEvidence,
} from '@/lib/offerEvidencePhotos';
import { formatIsoDateMedium } from '@/lib/listingAvailabilityDates';
import { formatUsd, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';

export type ReceivePreference = 'pickup' | 'delivery' | 'either';

export type ListingRenterOfferDraft = {
  rentalStartIso: string | null;
  rentalEndIso: string | null;
  receivePreference: ReceivePreference;
  /** Max renter will pay for delivery (optional). */
  deliveryBudgetMax: string;
  dailyOfferRate: string;
  replacementValue: string;
};

export type ListingOfferSubmitPayload = {
  message: string;
  price: number;
  rentalStartDate: string;
  rentalEndDate: string;
  toolDescription: string;
  offer_images: string[];
  offer_evidence: StoredOfferEvidence | null;
  negotiationDelivery: { method: NegotiationDeliveryMethod; fee: number | null };
  replacementValue: number;
  itemCondition: 'excellent' | 'good' | 'fair';
};

function conditionFromSnapshot(snapshot: ListingIntentSnapshot): 'excellent' | 'good' | 'fair' {
  const s = (snapshot.condition_label ?? '').toLowerCase();
  if (s.includes('excellent')) return 'excellent';
  if (s.includes('fair')) return 'fair';
  return 'good';
}

/**
 * Renter-negotiation copy + fields for `upsertNegotiationListingOfferToSupabase`.
 */
export function mapListingRenterOfferDraftToPayload(
  draft: ListingRenterOfferDraft,
  snapshot: ListingIntentSnapshot,
  billingDays: number
): ListingOfferSubmitPayload | null {
  const start = draft.rentalStartIso?.trim() ?? '';
  const end = draft.rentalEndIso?.trim() ?? '';
  if (!start || !end) return null;

  const daily = parseMoneyToNumber(sanitizeMoneyDigits(draft.dailyOfferRate));
  const rvDraft = parseMoneyToNumber(sanitizeMoneyDigits(draft.replacementValue));
  const rvSnap =
    snapshot.replacement_value != null && Number.isFinite(snapshot.replacement_value)
      ? snapshot.replacement_value
      : null;
  const replacementValue =
    rvDraft != null && rvDraft > 0 ? rvDraft : rvSnap != null && rvSnap > 0 ? rvSnap : null;

  if (daily == null || daily <= 0 || replacementValue == null || replacementValue <= 0) return null;

  const days = Math.max(1, Math.round(billingDays));
  const price = Math.round(daily * days * 100) / 100;

  const budget = parseMoneyToNumber(sanitizeMoneyDigits(draft.deliveryBudgetMax));

  let negotiationDelivery: { method: NegotiationDeliveryMethod; fee: number | null };
  if (draft.receivePreference === 'pickup') {
    negotiationDelivery = { method: 'pickup', fee: null };
  } else if (draft.receivePreference === 'delivery') {
    negotiationDelivery = {
      method: 'owner_delivery',
      fee: budget != null && budget >= 0 ? budget : null,
    };
  } else {
    negotiationDelivery = { method: 'pickup', fee: null };
  }

  const lines: string[] = [];
  lines.push(`Listing: ${snapshot.title}`);
  lines.push(
    `Dates: ${formatIsoDateMedium(start)} → ${formatIsoDateMedium(end)} (${days} day(s))`
  );
  lines.push(`Your offer: ${formatUsd(daily)}/day × ${days} day(s) → ${formatUsd(price)} estimated total`);
  lines.push('');
  lines.push('How you want to receive this rental:');
  if (draft.receivePreference === 'pickup') {
    lines.push('I can pick it up — I’ll meet the owner for pickup.');
  } else if (draft.receivePreference === 'delivery') {
    lines.push('I’d like delivery — the owner delivers the item to me.');
    if (budget != null && budget > 0) {
      lines.push(`Delivery budget (max I’ll pay for delivery): ${formatUsd(budget)}`);
    } else {
      lines.push('Delivery budget: open / to be agreed with the owner.');
    }
  } else {
    lines.push('Either works — I’m flexible on pickup or delivery.');
  }
  lines.push('');
  lines.push(`Replacement value for protection: ${formatUsd(replacementValue)}`);
  lines.push(NEGOTIATION_LATE_FEE_TERMS_LINE);

  const message = lines.join('\n');

  const hero = snapshot.hero_image_url?.trim();
  const offer_evidence: StoredOfferEvidence | null =
    hero && hero.length > 0
      ? {
          v: OFFER_EVIDENCE_SCHEMA_VERSION,
          photos: [{ url: hero, category: 'item' as const }],
        }
      : null;
  const offer_images = offer_evidence ? flattenOfferImageUrlsFromEvidence(offer_evidence.photos) : [];

  const itemCondition = conditionFromSnapshot(snapshot);

  return {
    message,
    price,
    rentalStartDate: start,
    rentalEndDate: end,
    toolDescription: snapshot.title,
    offer_images,
    offer_evidence,
    negotiationDelivery,
    replacementValue,
    itemCondition,
  };
}

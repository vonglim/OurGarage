import type { WizardDraft } from '@/components/makeOfferFlow/types';
import { resolveDeliveryFee } from '@/components/makeOfferFlow/calculations';
import { NEGOTIATION_LATE_FEE_TERMS_LINE } from '@/lib/counterOfferMessage';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import {
  formatNegotiationDeliveryFeeTermLine,
  formatNegotiationDeliveryMethodLine,
} from '@/lib/negotiationDelivery';
import type { OfferEvidencePhotoEntry, StoredOfferEvidence } from '@/lib/offerEvidencePhotos';
import {
  OFFER_EVIDENCE_SCHEMA_VERSION,
  flattenOfferImageUrlsFromEvidence,
} from '@/lib/offerEvidencePhotos';
import { formatUsd, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { billingDayCountForRequest } from '@/lib/requestPriceContext';

export type MakeOfferAddOfferPayload = {
  message: string;
  price: number;
  toolDescription: string;
  offer_images: string[];
  offer_evidence: StoredOfferEvidence | null;
  negotiationDelivery: { method: NegotiationDeliveryMethod; fee: number | null };
  replacementValue: number;
  itemCondition: 'excellent' | 'good' | 'fair';
};

export function formatItemConditionLabel(c: 'excellent' | 'good' | 'fair'): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/**
 * Maps the Make Offer wizard draft to the existing `addOffer` / `upsertNegotiationOfferToSupabase` shape.
 * Returns null if required monetary / condition fields are invalid.
 */
export function mapWizardDraftToAddOfferPayload(
  draft: WizardDraft,
  request: Record<string, unknown>
): MakeOfferAddOfferPayload | null {
  const daily = parseMoneyToNumber(sanitizeMoneyDigits(draft.dailyRate));
  const replacementValue = parseMoneyToNumber(sanitizeMoneyDigits(draft.marketValue));
  const cond = draft.condition;
  if (daily == null || daily <= 0 || replacementValue == null || replacementValue <= 0) return null;
  if (cond !== 'excellent' && cond !== 'good' && cond !== 'fair') return null;
  if (!draft.verificationPhoto?.remoteUrl?.trim()) return null;

  const billDays = Math.max(1, Math.round(billingDayCountForRequest(request)));
  const price = daily * billDays;

  const brandLine = (draft.brandModelDisplay.trim() || draft.brandModelQuery.trim()).trim();
  if (!brandLine) return null;

  const negotiationDelivery: { method: NegotiationDeliveryMethod; fee: number | null } =
    draft.deliveryMode === 'pickup'
      ? { method: 'pickup', fee: null }
      : { method: 'owner_delivery', fee: resolveDeliveryFee(draft) };

  const included =
    draft.accessories.length > 0
      ? `Included: ${draft.accessories.map((a) => a.trim()).filter(Boolean).join(', ')}`
      : 'No accessories listed.';

  const lines: string[] = [];
  lines.push(`Brand and model: ${brandLine}`);
  lines.push(`Description: ${included}`);
  lines.push('');
  lines.push('Terms (optional):');
  lines.push(formatNegotiationDeliveryMethodLine(negotiationDelivery.method));
  if (negotiationDelivery.method === 'owner_delivery') {
    lines.push(formatNegotiationDeliveryFeeTermLine(negotiationDelivery.fee ?? 0));
  }
  lines.push(`Replacement value: ${formatUsd(replacementValue)}`);
  lines.push(`Item condition: ${formatItemConditionLabel(cond)}`);
  lines.push(NEGOTIATION_LATE_FEE_TERMS_LINE);

  const message = lines.join('\n');

  const photos: OfferEvidencePhotoEntry[] = [];
  const v = draft.verificationPhoto.remoteUrl.trim();
  if (v) photos.push({ url: v, category: 'timestamp_proof' });
  for (const p of draft.itemPhotos) {
    const u = p.remoteUrl?.trim();
    if (u) photos.push({ url: u, category: 'item' });
  }
  for (const p of draft.serialPhotos) {
    const u = p.remoteUrl?.trim();
    if (u) photos.push({ url: u, category: 'serial' });
  }

  const offer_evidence: StoredOfferEvidence | null =
    photos.length > 0 ? { v: OFFER_EVIDENCE_SCHEMA_VERSION, photos } : null;
  const offer_images = flattenOfferImageUrlsFromEvidence(photos);

  return {
    message,
    price,
    toolDescription: brandLine,
    offer_images,
    offer_evidence,
    negotiationDelivery,
    replacementValue,
    itemCondition: cond,
  };
}

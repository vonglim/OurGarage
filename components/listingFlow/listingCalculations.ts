import { isPersistedRemoteImageUrl, sanitizeListingImagesForPersistence } from '@/lib/listingImageUrls';
import { formatUsd, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { coordinatesFromLocationField } from '@/lib/zipCoordinates';

import type { ListingWizardDraft } from './listingTypes';

const CONDITION_LABELS: Record<NonNullable<ListingWizardDraft['condition']>, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  heavy_use: 'Heavy Use',
};

export function effectiveListingTitle(draft: ListingWizardDraft): string {
  return draft.brandModelDisplay.trim() || draft.brandModelQuery.trim();
}

export function resolveListingRadiusMiles(draft: ListingWizardDraft): number {
  if (draft.milesPreset === 'custom') {
    const n = parseInt(draft.milesCustom.replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(200, n) : 0;
  }
  return draft.milesPreset;
}

export function resolveListingDeliveryFee(draft: ListingWizardDraft): number {
  if (draft.deliveryFeePreset === 'free') return 0;
  if (draft.deliveryFeePreset === 10) return 10;
  if (draft.deliveryFeePreset === 25) return 25;
  const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.deliveryFeeCustom));
  return n != null && n >= 0 ? n : 0;
}

export function handoffSummaryLine(draft: ListingWizardDraft): string {
  switch (draft.handoff) {
    case 'pickup_only':
      return 'Pickup only';
    case 'delivery':
      return `Delivery • within ${resolveListingRadiusMiles(draft)} mi`;
    case 'both':
      return `Pickup & delivery • within ${resolveListingRadiusMiles(draft)} mi`;
    default:
      return '—';
  }
}

export function verificationStatusLine(draft: ListingWizardDraft): string {
  const p = draft.verificationPossession?.remoteUrl ? 1 : 0;
  const s = draft.verificationSerial?.remoteUrl ? 1 : 0;
  const r = draft.verificationReceipt?.remoteUrl ? 1 : 0;
  if (!p && !s && !r) return 'Add timestamp proof (Required)';
  const parts: string[] = [];
  parts.push(p ? 'Fresh photo ✓' : 'Fresh photo —');
  if (s) parts.push('Serial ✓');
  if (r) parts.push('Receipt ✓');
  return parts.join(' · ');
}

function listingCoverAndGalleryUrlsReady(draft: ListingWizardDraft): boolean {
  if (!draft.coverPhoto?.remoteUrl || draft.coverPhoto.uploading) return false;
  if (!isPersistedRemoteImageUrl(draft.coverPhoto.remoteUrl)) return false;
  for (const p of draft.galleryPhotos) {
    if (p.uploading) return false;
    if (p.localUri && !p.remoteUrl) return false;
    if (p.remoteUrl && !isPersistedRemoteImageUrl(p.remoteUrl)) return false;
  }
  return true;
}

/** True when cover + gallery images are uploaded to remote storage (not file://). */
export function listingPhotosStepReady(draft: ListingWizardDraft): boolean {
  return listingCoverAndGalleryUrlsReady(draft);
}

/** Timestamp proof (Required) uploaded — required before publish. */
export function listingLiveVerificationStepReady(draft: ListingWizardDraft): boolean {
  const p = draft.verificationPossession;
  return !!(p?.remoteUrl && !p.uploading && isPersistedRemoteImageUrl(p.remoteUrl));
}

/** Review-step gate: no pending slots, no in-flight uploads, showcase + required live verification complete. */
export function listingWizardPublishReady(draft: ListingWizardDraft): boolean {
  if (listingPhotoSlotsPendingUpload(draft).length > 0) return false;
  if (listingHasInFlightUploads(draft)) return false;
  if (!listingCoverAndGalleryUrlsReady(draft)) return false;
  if (!listingLiveVerificationStepReady(draft)) return false;
  return true;
}

/** Slots that still need upload before publish (have localUri, no remoteUrl). */
export function listingPhotoSlotsPendingUpload(draft: ListingWizardDraft): { slot: string; uri: string }[] {
  const pending: { slot: string; uri: string }[] = [];
  if (draft.coverPhoto?.localUri && !draft.coverPhoto.remoteUrl) {
    pending.push({ slot: 'cover', uri: draft.coverPhoto.localUri });
  }
  draft.galleryPhotos.forEach((p, i) => {
    if (p.localUri && !p.remoteUrl) pending.push({ slot: `gallery-${i}`, uri: p.localUri });
  });
  if (draft.verificationPossession?.localUri && !draft.verificationPossession.remoteUrl) {
    pending.push({ slot: 'possession', uri: draft.verificationPossession.localUri });
  }
  if (draft.verificationSerial?.localUri && !draft.verificationSerial.remoteUrl) {
    pending.push({ slot: 'serial', uri: draft.verificationSerial.localUri });
  }
  if (draft.verificationReceipt?.localUri && !draft.verificationReceipt.remoteUrl) {
    pending.push({ slot: 'receipt', uri: draft.verificationReceipt.localUri });
  }
  return pending;
}

export function listingHasInFlightUploads(draft: ListingWizardDraft): boolean {
  if (draft.coverPhoto?.uploading) return true;
  if (draft.galleryPhotos.some((p) => p.uploading)) return true;
  if (draft.verificationPossession?.uploading) return true;
  if (draft.verificationSerial?.uploading) return true;
  if (draft.verificationReceipt?.uploading) return true;
  return false;
}

export function allListingImageRemoteUrls(draft: ListingWizardDraft): string[] {
  const out: string[] = [];
  if (draft.coverPhoto?.remoteUrl) out.push(draft.coverPhoto.remoteUrl);
  for (const p of draft.galleryPhotos) {
    if (p.remoteUrl) out.push(p.remoteUrl);
  }
  return out;
}

export function buildListingDescription(draft: ListingWizardDraft): string {
  const lines: string[] = [];
  if (draft.category.trim()) lines.push(`Category: ${draft.category.trim()}`);
  if (draft.condition) lines.push(`Condition: ${CONDITION_LABELS[draft.condition]}`);
  if (draft.conditionNotes.trim()) lines.push(`Condition notes: ${draft.conditionNotes.trim()}`);
  if (draft.included.length) lines.push(`Included: ${draft.included.join(', ')}`);
  lines.push(`Pickup / delivery: ${handoffSummaryLine(draft)}`);
  if (draft.handoff !== 'pickup_only') {
    const fee = resolveListingDeliveryFee(draft);
    lines.push(`Delivery fee preference: ${fee <= 0 ? 'Free' : `$${fee}`}`);
  }
  lines.push(`Service area: ${draft.serviceArea.trim()}`);
  return lines.join('\n');
}

export type BuiltListingRow = {
  name: string;
  price: number;
  priceUnit: 'day';
  description: string;
  images: string[];
  distance: number;
  meta: import('@/store/listingsStore').ToolListingMeta;
};

export function buildListingPublishPayload(
  draft: ListingWizardDraft,
  opts: { ownerName: string; ownerUserId: string }
): BuiltListingRow | null {
  const title = effectiveListingTitle(draft);
  if (!title) return null;
  if (!draft.coverPhoto?.remoteUrl) return null;
  const price = parseMoneyToNumber(sanitizeMoneyDigits(draft.dailyRate));
  if (price == null || price <= 0) return null;
  const mv = parseMoneyToNumber(sanitizeMoneyDigits(draft.marketValue));
  const geo = coordinatesFromLocationField(draft.serviceArea.trim());
  const rawImages = allListingImageRemoteUrls(draft);
  const images = sanitizeListingImagesForPersistence(rawImages);
  if (images.length === 0) return null;

  let deliveryFeePreference: string | undefined;
  if (draft.handoff !== 'pickup_only') {
    const fee = resolveListingDeliveryFee(draft);
    deliveryFeePreference = fee <= 0 ? 'Free' : formatUsd(fee);
  }

  return {
    name: title,
    price,
    priceUnit: 'day',
    description: buildListingDescription(draft),
    images,
    distance: geo ? 2.1 : 3,
    meta: {
      conditionLabel: draft.condition ? CONDITION_LABELS[draft.condition] : undefined,
      includedItems: draft.included.length ? [...draft.included] : undefined,
      handoffSummary: handoffSummaryLine(draft),
      deliveryFeePreference,
      serviceArea: draft.serviceArea.trim() || undefined,
      marketValue: mv != null && mv >= 0 ? mv : undefined,
      verificationStatus: verificationStatusLine(draft),
      photoCount: images.length,
    },
  };
}

import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';

export type RentalWorkspaceHeroInput = {
  rentalId: string;
  viewerRole: 'owner' | 'renter';
  ownerUserId: string;
  renterUserId: string;
  requestTitle?: string | null;
  requestToolName?: string | null;
  listingSnapshot?: ListingIntentSnapshot | null;
  listingTitle?: string | null;
  listingImages?: string[] | null;
  offerImages?: string[] | null;
};

export type RentalWorkspaceHeroModel = {
  title: string;
  thumbUri: string | null;
  rentalCodeLabel: string;
  relationshipLine: string;
};

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t.length > 0) return t;
  }
  return null;
}

function firstImageUrl(...groups: (string[] | null | undefined)[]): string | null {
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const raw of group) {
      if (typeof raw !== 'string') continue;
      const u = raw.trim();
      if (u.length > 0) return u;
    }
  }
  return null;
}

/** Short rental reference for the hero footer (not a DB id). */
export function formatRentalWorkspaceHeroCode(rentalId: string): string {
  const t = rentalId.trim();
  if (t.length < 4) return 'Rental';
  const compact = t.replace(/-/g, '');
  const slice = compact.length >= 6 ? compact.slice(-6) : compact;
  return `Rental #${slice.toUpperCase()}`;
}

export function buildRentalWorkspaceHeroModel(input: RentalWorkspaceHeroInput): RentalWorkspaceHeroModel {
  const title =
    firstNonEmpty(
      input.requestTitle,
      input.requestToolName,
      input.listingSnapshot?.title,
      input.listingTitle
    ) ?? 'Rental item';

  const thumbUri = firstImageUrl(
    input.listingSnapshot?.hero_image_url ? [input.listingSnapshot.hero_image_url] : null,
    input.listingImages,
    input.offerImages
  );

  const counterpartyId = input.viewerRole === 'owner' ? input.renterUserId : input.ownerUserId;
  const counterpartyName = getProfileNameForUserId(counterpartyId).trim() || 'your guest';
  const relationshipLine =
    input.viewerRole === 'owner'
      ? `Rented to ${counterpartyName}`
      : `Borrowing from ${counterpartyName}`;

  return {
    title,
    thumbUri,
    rentalCodeLabel: formatRentalWorkspaceHeroCode(input.rentalId),
    relationshipLine,
  };
}

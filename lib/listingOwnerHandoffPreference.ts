import type { HandoffPreference } from '@/lib/insertRentalRequest';
import type { ReceivePreference } from '@/lib/listingOfferFromDraft';
import { parseStructuredListingDescription } from '@/lib/listingStructuredDescription';
import type { ToolListing } from '@/store/listingsStore';

/** Owner handoff mode from the listing wizard (`ListingHandoff`). */
export type ListingOwnerHandoffMode = 'pickup_only' | 'delivery' | 'both';

export function resolveListingHandoffSummary(listing: {
  meta?: { handoffSummary?: string };
  description?: string;
}): string | null {
  const fromMeta = listing.meta?.handoffSummary?.trim();
  if (fromMeta) return fromMeta;
  const parsed = parseStructuredListingDescription(listing.description?.trim() ?? '');
  return parsed.pickupDelivery?.trim() || null;
}

export function resolveListingHandoffSummaryFromListing(listing: ToolListing): string | null {
  return resolveListingHandoffSummary(listing);
}

export function parseOwnerHandoffFromSummary(
  handoffSummary: string | null | undefined
): ListingOwnerHandoffMode | null {
  const s = handoffSummary?.trim() ?? '';
  if (!s) return null;
  if (/^pickup\s*&\s*delivery/i.test(s)) return 'both';
  if (/^pickup only/i.test(s)) return 'pickup_only';
  if (/^delivery/i.test(s)) return 'delivery';
  return null;
}

export function parseOwnerHandoffFromListing(listing: ToolListing): ListingOwnerHandoffMode | null {
  return parseOwnerHandoffFromSummary(resolveListingHandoffSummaryFromListing(listing));
}

export function ownerHandoffLabel(mode: ListingOwnerHandoffMode): string {
  switch (mode) {
    case 'pickup_only':
      return 'Pickup only';
    case 'delivery':
      return 'Delivery';
    case 'both':
      return 'Pickup or delivery';
  }
}

export function defaultReceivePreferenceForOwnerHandoff(
  mode: ListingOwnerHandoffMode | null
): ReceivePreference {
  if (mode === 'delivery') return 'delivery';
  return 'pickup';
}

export function defaultHandoffPreferenceForOwnerHandoff(
  mode: ListingOwnerHandoffMode | null
): HandoffPreference {
  if (mode === 'delivery') return 'owner_delivery';
  return 'pickup';
}

export function renterReceivePreferenceLabel(pref: ReceivePreference): string {
  switch (pref) {
    case 'pickup':
      return 'Pickup';
    case 'delivery':
      return 'Delivery';
    case 'either':
      return 'Pickup or delivery';
  }
}

export function renterHandoffPreferenceLabel(pref: HandoffPreference): string {
  switch (pref) {
    case 'pickup':
      return 'Pickup';
    case 'owner_delivery':
      return 'Delivery';
    case 'either':
      return 'Pickup or delivery';
  }
}

export function renterReceivePreferenceMatchesOwner(
  ownerMode: ListingOwnerHandoffMode | null,
  renterPref: ReceivePreference
): boolean {
  if (ownerMode == null || ownerMode === 'both') return true;
  if (ownerMode === 'pickup_only') return renterPref === 'pickup';
  return renterPref === 'delivery';
}

export function renterHandoffPreferenceMatchesOwner(
  ownerMode: ListingOwnerHandoffMode | null,
  renterPref: HandoffPreference
): boolean {
  if (ownerMode == null || ownerMode === 'both') return true;
  if (ownerMode === 'pickup_only') return renterPref === 'pickup';
  return renterPref === 'owner_delivery';
}

export function listingHandoffMismatchPromptMessage(
  ownerMode: ListingOwnerHandoffMode,
  renterChoiceLabel: string
): string {
  return `This listing specifies ${ownerHandoffLabel(ownerMode)}, but you can request ${renterChoiceLabel}.`;
}

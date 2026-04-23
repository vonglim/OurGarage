export type RenbyEquipmentListing = {
  id: string;
  title: string;
  imageUrl: string;
  /** Whole dollars for display */
  pricePerDay: number;
  /** Miles from viewer */
  distanceMiles: number;
  description: string;
  ownerName: string;
  ownerRating: number;
  /** Neighborhood or area label */
  locationArea: string;
  /** City, state */
  locationCity: string;
};

/** Populated from backend when available. */
export const RENBY_LISTINGS: RenbyEquipmentListing[] = [];

export function getRenbyListingById(id: string): RenbyEquipmentListing | undefined {
  return RENBY_LISTINGS.find((l) => l.id === id);
}

export function formatRenbyPricePerDay(wholeDollars: number): string {
  return `$${wholeDollars}/day`;
}

export function formatRenbyDistance(mi: number): string {
  if (mi < 10) return `${mi.toFixed(1)} mi away`;
  return `${Math.round(mi)} mi away`;
}

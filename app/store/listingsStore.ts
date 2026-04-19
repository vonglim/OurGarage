import { create } from 'zustand';

import { formatUsd } from '../lib/money';

export type ToolListing = {
  id: string;
  name: string;
  price: number;
  /** e.g. "day", "week"; display defaults to "day" when omitted. */
  priceUnit?: string;
  description?: string;
  /** When set, listing is shown under My Activity → My Equipment for that user. */
  ownerUserId?: string;
  ownerName: string;
  rating: number;
  /** Miles (mock). */
  distance: number;
  createdAt: number;
};

type ListingsState = {
  listings: ToolListing[];
  appendListing: (row: ToolListing) => void;
};

export const useListingsStore = create<ListingsState>((set) => ({
  listings: [],
  appendListing: (row) =>
    set((s) => ({
      listings: [...s.listings, row],
    })),
}));

export function getListingById(id: string): ToolListing | undefined {
  return useListingsStore.getState().listings.find((l) => l.id === id);
}

export function formatListingPriceWithUnit(price: number, priceUnit?: string | null): string {
  const unit = priceUnit?.trim() || 'day';
  return `${formatUsd(price)} / ${unit}`;
}

const SEED_TOOLS = [
  'Cordless Drill',
  'Table Saw',
  'Extension Ladder',
  'Rotary Hammer',
  'Wet/Dry Vac',
  'Pressure Washer',
  'Oscillating multi-tool',
  'Air Compressor',
  'Nail Gun',
  'Floor Sander',
] as const;

const SEED_OWNERS = [
  'Alex Kim',
  'Jordan P.',
  'Sam Rivera',
  'Taylor Ng',
  'Riley Park',
  'Casey Wu',
  'Morgan Lee',
  'Jamie Ortiz',
  'Devon Shah',
  'Sky Chen',
] as const;

/** Dev-only: drops prior `listing-seed-*` rows, then fills up to 10 mock listings. */
export function seedTestData(): void {
  if (!__DEV__) return;

  const kept = useListingsStore.getState().listings.filter((l) => !String(l.id).startsWith('listing-seed-'));
  useListingsStore.setState({ listings: kept });

  const { listings, appendListing } = useListingsStore.getState();
  if (listings.length >= 10) return;

  const need = 10 - listings.length;
  const base = Date.now();

  for (let i = 0; i < need; i++) {
    const id = `listing-seed-${base}-${i}`;
    const price = 15 + ((i * 7) % 36);
    const rating = Math.round((3.6 + (i % 5) * 0.28) * 10) / 10;
    const span = need <= 1 ? 4.75 : (i / (need - 1)) * 9.5;
    const distance = Math.round((0.5 + span) * 10) / 10;
    appendListing({
      id,
      name: SEED_TOOLS[i % SEED_TOOLS.length],
      price,
      priceUnit: 'day',
      description: 'Well maintained. Pickup nearby.',
      ownerName: SEED_OWNERS[i % SEED_OWNERS.length],
      rating,
      distance,
      createdAt: base - i * 86_400_000 - i * 3_600_000,
    });
  }
}

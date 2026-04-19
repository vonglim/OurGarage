import { create } from 'zustand';

export type ToolListing = {
  id: string;
  toolName: string;
  description: string;
  price: number;
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

const SEED_TOOLS = [
  'Cordless Drill',
  'Table Saw',
  'Extension Ladder',
  'Rotary Hammer',
  'Wet/Dry Vac',
  'Pressure Washer',
  'Oscillating Multi-Tool',
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

/** Dev-only: fills up to 10 mock tool listings once. */
export function seedTestData(): void {
  if (!__DEV__) return;
  const { listings, appendListing } = useListingsStore.getState();
  if (listings.length >= 10) return;

  const need = 10 - listings.length;
  const base = Date.now();

  for (let i = 0; i < need; i++) {
    const id = `listing-seed-${base}-${i}`;
    const price = 15 + ((i * 7) % 36);
    const rating = Math.round((3.6 + (i % 5) * 0.28) * 10) / 10;
    const distance = Math.round((1.2 + (i % 7) * 2.1 + (i % 3) * 0.4) * 10) / 10;
    appendListing({
      id,
      toolName: SEED_TOOLS[i % SEED_TOOLS.length],
      description: 'Well maintained. Pickup within a few miles.',
      price,
      ownerName: SEED_OWNERS[i % SEED_OWNERS.length],
      rating,
      distance,
      createdAt: base - i * 86_400_000 - i * 3_600_000,
    });
  }
}

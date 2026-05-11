/**
 * Centralized dev/QA mock strings and numeric fields. All use lightweight randomness
 * so repeated autofill surfaces different copy (layout/edge-case testing).
 *
 * Future presets: pick `MockScenarioPreset` to bias pools (contractor, creator, etc.).
 */

import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';

// ——— scenario presets (easy to extend) ———

export type MockScenarioPreset =
  | 'contractor'
  | 'creator'
  | 'event_host'
  | 'outdoor'
  | 'budget'
  | 'premium'
  /** Same-day / urgent tool needs — good for deadline UI tests */
  | 'emergency'
  | 'mixed';

const SCENARIO_PRESETS: readonly MockScenarioPreset[] = [
  'contractor',
  'creator',
  'event_host',
  'outdoor',
  'budget',
  'premium',
  'emergency',
  'mixed',
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Biases item pools; use `mixed` for uniform cross-category variety. */
export function devMockScenario(): MockScenarioPreset {
  return pick([...SCENARIO_PRESETS]);
}

function isFormalTone(): boolean {
  return Math.random() < 0.35;
}

// ——— category item pools ———

const POOL_TOOLS = [
  'pressure washer',
  'wet tile saw',
  '12 ft extension ladder',
  'backpack leaf blower',
  'portable generator',
  'shop vac',
  'electric concrete mixer',
  'rotary hammer drill',
  'nail gun + compressor kit',
  'plate compactor',
] as const;

const POOL_CAMERA_CREATOR = [
  'Sony A7 III body + 28–70 kit',
  'Canon EOS R6 Mark II',
  'DJI Ronin-SC gimbal',
  'Shure SM7B podcast mic kit',
  'Aputure 300d II lighting kit',
  'Rode Wireless GO II mic set',
  'Sigma 24–70mm f/2.8 Art',
  'GoPro Hero bundle + mounts',
] as const;

const POOL_PARTY_EVENT = [
  '6 ft folding tables (qty 4)',
  'commercial bounce house',
  'JBL party speaker + stands',
  '4K short-throw projector',
  'low-fog machine + fluid',
  'pipe and drape backdrop kit',
  'LED uplights (set of 8)',
  'pop-up canopy 10×10',
] as const;

const POOL_OUTDOOR = [
  '6-person camping tent',
  'tandem kayak + paddles',
  'hitch bike rack (4 bikes)',
  'battery chainsaw + oil',
  'portable gas grill',
  'roof cargo box',
  'bear canister + stove kit',
  'inflatable SUP board',
] as const;

function itemsForScenario(s: MockScenarioPreset): readonly string[] {
  switch (s) {
    case 'contractor':
      return POOL_TOOLS;
    case 'creator':
      return POOL_CAMERA_CREATOR;
    case 'event_host':
      return POOL_PARTY_EVENT;
    case 'outdoor':
      return POOL_OUTDOOR;
    case 'budget':
      return [...POOL_TOOLS, ...POOL_OUTDOOR];
    case 'premium':
      return [...POOL_CAMERA_CREATOR, ...POOL_TOOLS];
    case 'emergency':
      return POOL_TOOLS;
    case 'mixed':
    default:
      return [...POOL_TOOLS, ...POOL_CAMERA_CREATOR, ...POOL_PARTY_EVENT, ...POOL_OUTDOOR];
  }
}

export function mockItemLabelForScenario(scenario?: MockScenarioPreset): string {
  const s = scenario ?? devMockScenario();
  return pick(itemsForScenario(s));
}

// ——— locations, areas, people ———

const AREAS = [
  'Montgomery County, MD',
  'Arlington, VA',
  'Rockville, MD',
  'Silver Spring, MD',
  'Bethesda, MD',
  'Fairfax, VA',
  'Alexandria, VA',
  'Baltimore County, MD',
  'Howard County, MD',
  'DC — Capitol Hill area',
] as const;

const MEETUP_LINES = [
  'Can meet near Rockville Town Center.',
  'Flexible on weekend mornings — Germantown or Clarksburg.',
  'Happy to coordinate pickup by the Pike & Rose garage.',
  'Delivery available within ~10 miles for a small fee.',
  'Usually free weekday evenings after 6 near 270.',
  'Can drop off if you’re along the Red Line corridor.',
] as const;

const NAMES = ['Alex Morgan', 'Jordan Lee', 'Sam Rivera', 'Casey Nguyen', 'Riley Brooks', 'Taylor Kim', 'Morgan Patel'] as const;

export function mockPersonFullName(_seed = 0): string {
  return pick(NAMES);
}

export function mockAgreementSignatureName(): string {
  return mockPersonFullName();
}

// ——— narrative snippets (formal / casual) ———

export function mockRenterNoteParagraph(): string {
  if (isFormalTone()) {
    return 'Received the item in the condition described. No visible damage noted at handoff. Appreciate the clear communication.';
  }
  return 'All good — picked up smooth, looks exactly like the pics. Thanks again!';
}

export function mockOwnerPickupInstruction(): string {
  if (isFormalTone()) {
    return 'Please bring a valid ID. Unit is packed in the gray Pelican-style case; serial is on the silver plate inside the lid.';
  }
  return 'I’ll be by the side entrance — gray case, can’t miss it. Text when you’re 5 out.';
}

export function mockMeetupLocation(): string {
  return pick([
    ...AREAS,
    'Near I-270 & Montrose Rd',
    'Wheaton Metro kiss-and-ride',
    'Tysons Galleria parking P2',
  ]);
}

export function mockListingTitle(): string {
  const item = mockItemLabelForScenario();
  const tag = Math.random() < 0.5 ? ' · tested & clean' : ' · ready to rent';
  return `${capitalizeWords(item)}${tag}`;
}

function capitalizeWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function mockListingDescription(): string {
  const item = mockItemLabelForScenario();
  const bullets = pick([
    'Includes all original accessories shown. Battery holds a solid charge.',
    'Light cosmetic wear on the case; glass/optics clean. Smoke-free home.',
    'Professionally maintained; last serviced within the last year.',
    'Great for a weekend project — I’ll walk you through setup if needed.',
  ]);
  return `Renting my ${item}. ${bullets} Message with dates if you need longer than a few days.`;
}

export function mockListingLocation(): string {
  return pick(AREAS);
}

export function mockChatSnippet(): string {
  return pick([
    'Hey — running a quick check on messages. Can you confirm you see this?',
    'Are you free Saturday morning for pickup? I can do 9–11.',
    'Thanks for the fast reply. Does the kit include the spare battery?',
    'Sounds good. I’ll bring cash for the deposit if that works.',
  ]);
}

export function mockDeclineReason(): string {
  return pick([
    'Scheduling conflict this week — need to pass for now.',
    'Found something closer to home. Thanks anyway.',
    'Budget shifted — can’t make the dates work. Appreciate the response.',
    'Going with another lender who had the exact model I needed.',
  ]);
}

export function mockIssueReportBody(): string {
  return pick([
    'QA: testing issue report flow — no real problem with the rental.',
    'Reporting for dev: verifying photo upload and category picker.',
    'Placeholder issue: handshake timing edge case on return day.',
  ]);
}

// ——— money helpers ———

function moneyString(n: number): string {
  return String(Math.max(0, Math.round(n)));
}

export function mockListingPriceInput(): string {
  return moneyString(randInt(22, 135));
}

export function mockReplacementValueInput(): string {
  return moneyString(randInt(120, 980));
}

export function mockLateFeeInput(): string {
  return moneyString(randInt(5, 22));
}

export function mockLateFeeCapInput(): string {
  const daily = Number(mockLateFeeInput());
  return moneyString(Math.max(daily, daily * randInt(4, 9)));
}

// ——— Request equipment (/request) ———

export function mockRequestEquipmentItemName(): string {
  return capitalizeWords(mockItemLabelForScenario());
}

export function mockRequestEquipmentDetailSuffix(): string {
  return pick([
    'weekend project — flexible pickup',
    'need for ~3 days, can return Sunday eve',
    'driveway + patio cleanup',
    'birthday party Saturday — early pickup preferred',
    'film shoot Sunday — must have before 8am',
    'camping trip — pickup Thursday PM',
  ]);
}

export function mockRequestRentalArea(): string {
  return pick(AREAS);
}

export function mockRequestRadiusPresetMiles(): '5' | '10' | '25' | '50' {
  return pick(['5', '10', '25', '50'] as const);
}

export function mockRequestDurationDaysInput(): string {
  return String(pick([1, 2, 3, 4, 5, 7, 10, 14]));
}

export function mockRequestPickupDateMask(_minDays = 5): string {
  const days = randInt(5, 21);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

export function mockRequestBudgetTotalInput(): string {
  return moneyString(randInt(55, 420));
}

export function mockRequestDeliveryFeeInput(): string {
  return moneyString(randInt(15, 85));
}

// ——— Make offer (/make-offer) ———

export type MakeOfferMockContext = {
  listedTotal: number | null;
  requestHow?: string | null;
  dayCount: number;
};

export function mockMakeOfferPriceInput(ctx: MakeOfferMockContext): string {
  const fallback = pick([89, 120, 165, 200, 240, 310]);
  const base = ctx.listedTotal != null && ctx.listedTotal > 0 ? ctx.listedTotal : fallback;
  const factor = 0.82 + Math.random() * 0.28;
  const jitter = randInt(-7, 11);
  const v = Math.max(12, Math.round(base * factor + jitter));
  return moneyString(v);
}

export function mockMakeOfferBrandModel(): string {
  return pick([
    'DeWalt DCS391 circular saw',
    'Milwaukee M18 fuel impact kit',
    'Makita XGT 40V trim router',
    'Bosch GCM12SD miter saw',
    'Honda EU2200i inverter gen',
    'Ridgid R4513 table saw',
    'Canon RF 24–105mm f/4 L',
    'Sony FE 35mm f/1.8',
    'JBL EON715 powered speaker',
  ]);
}

export function mockMakeOfferDescription(): string {
  return pick([
    'Includes battery, charger, and carrying bag. Light wear on housing; runs strong.',
    'Well maintained; stored indoors. All manuals and original box if you want them.',
    'Commercial-grade unit — I’ll include extra blades/bits we agreed on in chat.',
    'Deep cycle battery tested recently. Oil changed per schedule.',
    'Glass clean, no fungus. Body has minor scuffs; functionally perfect.',
    'Speaker + power cable + stand. No rattles; used for small gigs only.',
  ]);
}

export function mockMakeOfferMessage(): string {
  if (isFormalTone()) {
    return pick([
      'Available for handoff this weekend; please advise preferred window.',
      'Can meet near Rockville or coordinate delivery within a reasonable radius.',
      'Includes all accessories listed. Happy to answer spec questions before you accept.',
    ]);
  }
  return pick([
    'Available this weekend — Sat AM works best for me.',
    'Can meet near Rockville, flexible on Sunday too.',
    'Includes battery + charger. Let me know if you need an extra day.',
    'Delivery available within 10 miles if that helps — small fee is fine.',
    'Ping me when you’re close; I’ll bring it curbside.',
  ]);
}

export function mockMakeOfferReplacementValueInput(offerTotalApprox: number): string {
  const mult = 2.2 + Math.random() * 2.2;
  const v = Math.max(95, Math.round(Math.max(offerTotalApprox, 50) * mult));
  return moneyString(v);
}

export function mockMakeOfferDeliveryFeeInput(): string {
  if (Math.random() < 0.2) return '0';
  return moneyString(randInt(18, 75));
}

/** Varies pickup vs owner delivery; biases slightly toward request intent. */
export function mockMakeOfferNegotiationMethod(requestHow?: string | null): NegotiationDeliveryMethod {
  const r = Math.random();
  if (requestHow === 'delivery_only') {
    return r < 0.72 ? 'owner_delivery' : 'pickup';
  }
  if (requestHow === 'pickup_nearby') {
    return r < 0.58 ? 'pickup' : 'owner_delivery';
  }
  return r < 0.52 ? 'pickup' : 'owner_delivery';
}

import type { PickupPhotoCategory } from '@/lib/pickupVerificationPhotoBuckets';
import type { PartyRole, VerificationPhase } from '@/lib/rentalVerification';

export const OFFER_EVIDENCE_SCHEMA_VERSION = 1 as const;

/** Synthetic pickup rows merged from `offers.offer_evidence` for rental handoff display. */
export const OFFER_EVIDENCE_DISPLAY_ID_PREFIX = 'offer-evidence' as const;

export function isOfferEvidencePickupDisplayId(id: string): boolean {
  return id.startsWith(`${OFFER_EVIDENCE_DISPLAY_ID_PREFIX}:`);
}

export type OfferEvidencePhotoEntry = {
  url: string;
  category: PickupPhotoCategory;
};

export type StoredOfferEvidence = {
  v: typeof OFFER_EVIDENCE_SCHEMA_VERSION;
  photos: OfferEvidencePhotoEntry[];
};

/** Empty buckets keyed like pickup owner tiles (make-offer + rental handoff share categories). */
export function emptyOfferEvidenceBuckets(): Record<PickupPhotoCategory, string[]> {
  return {
    item: [],
    serial: [],
    timestamp_proof: [],
    additional: [],
  };
}

export function bucketsToStoredEvidence(
  buckets: Record<PickupPhotoCategory, string[]>
): StoredOfferEvidence | null {
  const photos: OfferEvidencePhotoEntry[] = [];
  (['item', 'serial', 'timestamp_proof', 'additional'] as const).forEach((cat) => {
    for (const url of buckets[cat]) {
      const u = String(url ?? '').trim();
      if (u) photos.push({ url: u, category: cat });
    }
  });
  if (photos.length === 0) return null;
  return { v: OFFER_EVIDENCE_SCHEMA_VERSION, photos };
}

export function parseStoredOfferEvidence(raw: unknown): OfferEvidencePhotoEntry[] {
  if (raw == null || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  if (o.v !== OFFER_EVIDENCE_SCHEMA_VERSION || !Array.isArray(o.photos)) return [];
  const out: OfferEvidencePhotoEntry[] = [];
  for (const p of o.photos) {
    if (p == null || typeof p !== 'object') continue;
    const row = p as Record<string, unknown>;
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    const c = row.category;
    if (!url) continue;
    if (c === 'item' || c === 'serial' || c === 'timestamp_proof' || c === 'additional') {
      out.push({ url, category: c });
    }
  }
  return out;
}

/** Flat URL list for `offers.offer_images` (order: item → serial → timestamp_proof → additional). */
export function flattenOfferImageUrlsFromEvidence(entries: OfferEvidencePhotoEntry[]): string[] {
  const order: PickupPhotoCategory[] = ['item', 'serial', 'timestamp_proof', 'additional'];
  const byCat = new Map<PickupPhotoCategory, string[]>();
  for (const cat of order) byCat.set(cat, []);
  for (const e of entries) {
    const list = byCat.get(e.category);
    if (list) list.push(e.url);
  }
  return order.flatMap((c) => byCat.get(c) ?? []);
}

export function storedEvidenceFromLegacyImageUrls(urls: string[] | undefined | null): StoredOfferEvidence | null {
  if (!urls?.length) return null;
  const photos: OfferEvidencePhotoEntry[] = urls
    .map((u) => String(u ?? '').trim())
    .filter(Boolean)
    .map((url) => ({ url, category: 'item' as const }));
  return photos.length ? { v: OFFER_EVIDENCE_SCHEMA_VERSION, photos } : null;
}

export function evidenceBucketsFromEntries(entries: OfferEvidencePhotoEntry[]): Record<PickupPhotoCategory, string[]> {
  const b = emptyOfferEvidenceBuckets();
  for (const e of entries) {
    const u = String(e.url ?? '').trim();
    if (!u) continue;
    if (e.category === 'item' || e.category === 'serial' || e.category === 'timestamp_proof' || e.category === 'additional') {
      b[e.category].push(u);
    }
  }
  return b;
}

/** Prefer structured `offer_evidence`; otherwise treat legacy `offer_images` as uncategorized item photos. */
export function getOfferEvidenceEntriesForOffer(offer: {
  offer_evidence?: unknown;
  offer_images?: string[];
}): OfferEvidencePhotoEntry[] {
  const fromJson = parseStoredOfferEvidence(offer.offer_evidence);
  if (fromJson.length > 0) return fromJson;
  const legacy = offer.offer_images;
  if (!Array.isArray(legacy) || legacy.length === 0) return [];
  return legacy
    .map((u) => String(u ?? '').trim())
    .filter(Boolean)
    .map((url) => ({ url, category: 'item' as const }));
}

export type OfferEvidencePickupMergeRow = {
  id: string;
  path?: string;
  signedUrl?: string;
  role?: PartyRole;
  phase?: VerificationPhase;
  userId?: string;
  createdAt?: string;
  pickupPhotoCategory?: PickupPhotoCategory | null;
};

/**
 * Prepend offer-stage evidence to pickup display (same categories as owner pickup tiles).
 * Skips URLs already present on DB-backed rows (same public URL re-used).
 */
export function mergeOfferEvidenceIntoPickupRows<T extends OfferEvidencePickupMergeRow>(
  dbRows: T[],
  offer:
    | {
        id: string;
        renterId: string;
        updatedAt: number;
        offer_evidence?: unknown;
        offer_images?: string[];
      }
    | undefined
): T[] {
  if (!offer) return dbRows;
  const entries = getOfferEvidenceEntriesForOffer(offer);
  if (entries.length === 0) return dbRows;

  const existingUrls = new Set<string>();
  for (const r of dbRows) {
    const u = String(r.signedUrl ?? '').trim();
    if (u) existingUrls.add(u);
  }

  const baseTime = Number.isFinite(offer.updatedAt) ? offer.updatedAt : Date.now();
  const synthetic: T[] = [];
  let i = 0;
  for (const e of entries) {
    const url = e.url.trim();
    if (!url || existingUrls.has(url)) continue;
    existingUrls.add(url);
    const createdAt = new Date(baseTime + i).toISOString();
    synthetic.push({
      id: `${OFFER_EVIDENCE_DISPLAY_ID_PREFIX}:${offer.id}:${i}:${e.category}`,
      signedUrl: url,
      role: 'owner' as PartyRole,
      phase: 'pickup' as VerificationPhase,
      userId: offer.renterId,
      createdAt,
      pickupPhotoCategory: e.category,
    } as T);
    i += 1;
  }
  if (synthetic.length === 0) return dbRows;
  return [...synthetic, ...dbRows];
}

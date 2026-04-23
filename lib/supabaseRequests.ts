import { fetchAndMergeProfileNames } from '@/lib/remoteProfileCache';
import { getSupabase } from '@/lib/supabase';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SupabaseRequestRow = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  user_id: string;
  created_at: string;
};

type RequestPayload = {
  toolName: string;
  when: string | null;
  how: string;
  pickupRadiusMiles: number | null;
  durationType: string;
  durationValue: number | null;
  totalPrice: number;
  deliveryFee: number | null;
  location: string;
  requestLat: number | null;
  requestLng: number | null;
};

/** Extra fields not in dedicated DB columns (single-table MVP). */
function encodeDescriptionExtras(payload: RequestPayload): string {
  const meta = {
    when: payload.when,
    how: payload.how,
    pickupRadiusMiles: payload.pickupRadiusMiles,
    durationType: payload.durationType,
    durationValue: payload.durationValue,
    deliveryFee: payload.deliveryFee,
    location: payload.location,
    requestLat: payload.requestLat,
    requestLng: payload.requestLng,
  };
  return JSON.stringify(meta);
}

function decodeDescriptionExtras(description: string | null): Partial<RequestPayload> {
  if (description == null || description.trim() === '') return {};
  try {
    const o = JSON.parse(description) as Record<string, unknown>;
    return {
      when: typeof o.when === 'string' ? o.when : null,
      how: typeof o.how === 'string' ? o.how : 'pickup_nearby',
      pickupRadiusMiles:
        typeof o.pickupRadiusMiles === 'number' && Number.isFinite(o.pickupRadiusMiles)
          ? o.pickupRadiusMiles
          : 10,
      durationType: typeof o.durationType === 'string' ? o.durationType : 'multiDay',
      durationValue:
        typeof o.durationValue === 'number' && Number.isFinite(o.durationValue)
          ? o.durationValue
          : 2,
      deliveryFee:
        typeof o.deliveryFee === 'number' && Number.isFinite(o.deliveryFee) ? o.deliveryFee : null,
      location: typeof o.location === 'string' ? o.location : '',
      requestLat:
        typeof o.requestLat === 'number' && Number.isFinite(o.requestLat) ? o.requestLat : null,
      requestLng:
        typeof o.requestLng === 'number' && Number.isFinite(o.requestLng) ? o.requestLng : null,
    };
  } catch {
    return {};
  }
}

export function mapSupabaseRowToAppRequest(row: SupabaseRequestRow): Record<string, unknown> {
  const extras = decodeDescriptionExtras(row.description);
  const ts = new Date(row.created_at).getTime();
  const expiresAt = ts + 7 * MS_PER_DAY;
  return {
    remoteId: row.id,
    id: row.id,
    toolName: row.title,
    description: '',
    totalPrice: Number(row.price),
    posterUserId: row.user_id,
    ownerId: row.user_id,
    timestamp: ts,
    createdAt: ts,
    matched: false,
    fulfilled: false,
    rentalStatus: 'pending',
    status: 'active',
    expiresAt,
    ...extras,
  };
}

/**
 * Maps a `requests` row from `select('*')` with authoritative `matched` / `accepted_*` from Supabase.
 */
export function mapSupabaseRequestSelectRowToApp(row: Record<string, unknown>): Record<string, unknown> {
  const r = row as {
    id?: string;
    title?: string;
    description?: string | null;
    price?: number;
    user_id?: string;
    /** @deprecated pre-migration column name; still read for safety */
    owner_id?: string;
    created_at?: string;
    matched?: boolean;
    accepted_offer_id?: string;
    accepted_price?: number;
  };
  const authorId = String(
    (typeof r.user_id === 'string' && r.user_id.trim() !== '' ? r.user_id : r.owner_id) ?? ''
  );
  const base = mapSupabaseRowToAppRequest({
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    description: r.description ?? null,
    price: Number(r.price ?? 0),
    user_id: authorId,
    created_at: String(r.created_at ?? new Date().toISOString()),
  } as SupabaseRequestRow);
  const matched = r.matched === true;
  const ap = r.accepted_price;
  const acceptedPrice =
    typeof ap === 'number' && Number.isFinite(ap) ? ap : (base as { acceptedPrice?: number }).acceptedPrice;
  return {
    ...base,
    matched,
    acceptedOfferId:
      typeof r.accepted_offer_id === 'string' && r.accepted_offer_id.trim() !== ''
        ? r.accepted_offer_id.trim()
        : null,
    acceptedPrice: acceptedPrice ?? null,
    rentalStatus: matched ? 'matched' : 'pending',
  };
}

function mergePreservingLocalRental(
  remote: Record<string, unknown>,
  local: Record<string, unknown>[]
): Record<string, unknown> {
  const rid = remote.remoteId;
  if (typeof rid !== 'string') return remote;
  const prev = local.find((p) => p.remoteId === rid);
  if (!prev) return remote;
  const st = prev.rentalStatus;
  const localRentalInProgress =
    st === 'active' || st === 'completed' || prev.fulfilled === true;
  if (localRentalInProgress) {
    return {
      ...remote,
      fulfilled: prev.fulfilled,
      rentalStatus: prev.rentalStatus,
      acceptedOfferId: prev.acceptedOfferId ?? remote.acceptedOfferId,
      acceptedPrice: prev.acceptedPrice ?? remote.acceptedPrice,
      rentalStart: prev.rentalStart,
      rentalActive: prev.rentalActive,
    };
  }
  return remote;
}

export async function fetchRemoteRequestsMerged(
  localRows: Record<string, unknown>[]
): Promise<Record<string, unknown>[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (__DEV__) console.warn('[Supabase requests] fetch error:', error.message);
    return null;
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const ownerIds = rows
    .map((r) => {
      const o = r as { user_id?: string; owner_id?: string };
      if (typeof o.user_id === 'string' && o.user_id.trim() !== '') return o.user_id.trim();
      if (typeof o.owner_id === 'string' && o.owner_id.trim() !== '') return o.owner_id.trim();
      return '';
    })
    .filter((s) => s.length > 0);
  await fetchAndMergeProfileNames(sb, ownerIds);

  return rows.map((r) => mergePreservingLocalRental(mapSupabaseRequestSelectRowToApp(r), localRows));
}

export async function insertRequestToSupabase(
  payload: RequestPayload,
  ownerId: string
): Promise<Record<string, unknown> | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const insert = {
    title: payload.toolName.trim(),
    description: encodeDescriptionExtras(payload),
    price: payload.totalPrice,
    user_id: ownerId,
  };

  const { data, error } = await sb.from('requests').insert(insert).select('*').single();

  if (error) {
    if (__DEV__) console.warn('[Supabase requests] insert error:', error.message);
    return null;
  }

  return mapSupabaseRowToAppRequest(data as SupabaseRequestRow);
}

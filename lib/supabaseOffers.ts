import type { SupabaseClient } from '@supabase/supabase-js';

import type { NegotiationOfferStatus, Offer } from '@/lib/negotiationOfferTypes';
import { mergeProfileRowsFromServer, getRemoteDisplayNameForUserId } from '@/lib/remoteProfileCache';
import { isUuidString } from '@/lib/requestOwnership';

function readCreatedAtMs(row: Record<string, unknown>): number {
  const v = row.updated_at ?? row.updatedAt ?? row.created_at;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : Date.now();
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return Date.now();
}

function readPrice(row: Record<string, unknown>): number {
  const candidates = [row.current_price, row.price, row.amount, row.offer_price];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
    if (typeof c === 'string' && c.trim() !== '') {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function readOffererId(row: Record<string, unknown>): string | undefined {
  const keys = ['user_id', 'offerer_id', 'lender_id', 'renter_id', 'offer_user_id', 'owner_id'];
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

function readOptionalString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

/**
 * PostgREST embed: `left join` `profiles` on `offers.user_id = profiles.id`
 * (requires FK; see `013_offers_user_id_profiles_fkey.sql`). Falls back to `select('*')` in fetch helpers.
 */
export const OFFERS_WITH_PROFILES_SELECT = '*, profiles(name)';

function readProfileNameFromOfferRow(row: Record<string, unknown>): string | null {
  const p = row.profiles;
  if (p == null) return null;
  if (Array.isArray(p)) {
    const first = p[0];
    if (first && typeof first === 'object' && typeof (first as { name?: unknown }).name === 'string') {
      const n = (first as { name: string }).name.trim();
      return n !== '' ? n : null;
    }
    return null;
  }
  if (typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string') {
    const n = (p as { name: string }).name.trim();
    return n !== '' ? n : null;
  }
  return null;
}

/**
 * Fetches `offers` for a request with `profiles.name` embedded; falls back to `*` if the embed is unavailable.
 */
export async function fetchOffersByRequestIdWithProfiles(
  supabase: SupabaseClient,
  requestRowId: string
): Promise<{ data: Record<string, unknown>[]; error: { message: string } | null }> {
  const a = await supabase
    .from('offers')
    .select(OFFERS_WITH_PROFILES_SELECT)
    .eq('request_id', requestRowId);
  if (a.error == null) {
    return { data: (a.data ?? []) as Record<string, unknown>[], error: null };
  }
  if (__DEV__) {
    console.warn('[offers] select with profiles failed, using *', a.error.message);
  }
  const b = await supabase.from('offers').select('*').eq('request_id', requestRowId);
  return {
    data: (b.data ?? []) as Record<string, unknown>[],
    error: b.error,
  };
}

/**
 * Fetches all `offers` with `profiles` embed (Activity refresh, etc.); falls back to `*`.
 */
export async function fetchAllOffersWithProfiles(
  supabase: SupabaseClient
): Promise<{ data: Record<string, unknown>[]; error: { message: string } | null }> {
  const a = await supabase.from('offers').select(OFFERS_WITH_PROFILES_SELECT);
  if (a.error == null) {
    return { data: (a.data ?? []) as Record<string, unknown>[], error: null };
  }
  if (__DEV__) {
    console.warn('[offers] select with profiles failed, using *', a.error.message);
  }
  const b = await supabase.from('offers').select('*');
  return {
    data: (b.data ?? []) as Record<string, unknown>[],
    error: b.error,
  };
}

function parseStatus(raw: unknown): NegotiationOfferStatus {
  if (
    raw === 'accepted' ||
    raw === 'declined' ||
    raw === 'closed' ||
    raw === 'pending' ||
    raw === 'pending_confirmation'
  )
    return raw;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (
      s === 'accepted' ||
      s === 'declined' ||
      s === 'closed' ||
      s === 'pending' ||
      s === 'pending_confirmation'
    )
      return s as NegotiationOfferStatus;
  }
  return 'pending';
}

/** Map a row from `offers` (Supabase) into the in-app negotiation `Offer` shape. */
export function mapSupabaseOfferRowToOffer(
  row: Record<string, unknown>,
  appRequestTimestamp: number
): Offer {
  const id =
    typeof row.id === 'string' && row.id.trim() !== ''
      ? row.id.trim()
      : `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const renterId = readOffererId(row) ?? '';
  const currentPrice = readPrice(row);
  const lastUpdatedBy =
    typeof row.last_updated_by === 'string' && row.last_updated_by.trim() !== ''
      ? row.last_updated_by.trim()
      : renterId;
  const status = parseStatus(row.status);
  const updatedAt = readCreatedAtMs(row);
  const message = readOptionalString(row, ['message', 'note', 'body']);
  const toolDescription = readOptionalString(row, ['tool_description', 'toolDescription']);
  const pc = row.poster_counter_count ?? row.posterCounterCount;
  const posterCounterCount =
    typeof pc === 'number' && Number.isFinite(pc) ? Math.max(0, Math.floor(pc)) : 0;

  const declined =
    row.declined === true ||
    row.declined === 't' ||
    row.declined === 'true' ||
    row.is_declined === true ||
    status === 'declined';

  const statusOut: NegotiationOfferStatus = declined
    ? 'declined'
    : status === 'accepted'
      ? 'accepted'
      : status === 'closed'
        ? 'closed'
        : status === 'pending_confirmation'
          ? 'pending_confirmation'
          : 'pending';

  const out: Offer = {
    id,
    requestId: appRequestTimestamp,
    renterId,
    currentPrice,
    price: currentPrice,
    lastUpdatedBy,
    status: statusOut,
    updatedAt,
    posterCounterCount,
    messageHistory: [],
  };
  if (message) out.message = message;
  if (toolDescription) out.toolDescription = toolDescription;

  const joinName = readProfileNameFromOfferRow(row);
  if (joinName) {
    out.offerUserName = joinName;
    if (isUuidString(renterId)) {
      mergeProfileRowsFromServer([{ id: renterId, name: joinName }]);
    }
  } else {
    const display = getRemoteDisplayNameForUserId(renterId);
    if (display && display.trim() !== '') {
      out.offerUserName = display.trim();
    }
  }
  return out;
}

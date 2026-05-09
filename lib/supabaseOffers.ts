import type { SupabaseClient } from '@supabase/supabase-js';

import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import type { NegotiationOfferStatus, Offer } from '@/lib/negotiationOfferTypes';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { fetchAndMergeProfileNames, mergeProfileRowsFromServer, getRemoteDisplayNameForUserId } from '@/lib/remoteProfileCache';
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
 * Parse optional embedded `profiles` (legacy) from a row; offers are loaded with `*`
 * and display names are filled via {@link fetchAndMergeProfileNames} + the remote name cache.
 */
export function readProfilesFromOfferRow(row: Record<string, unknown>): { id: string; name: string } | null {
  const p = row.profiles;
  if (p == null) return null;
  const node = Array.isArray(p) ? p[0] : p;
  if (node == null || typeof node !== 'object') return null;
  const o = node as { id?: unknown; name?: unknown };
  const id = typeof o.id === 'string' && o.id.trim() !== '' ? o.id.trim() : '';
  if (id === '' || !isUuidString(id)) return null;
  const raw =
    o.name == null ? '' : typeof o.name === 'string' ? o.name.trim() : String(o.name).trim();
  return { id, name: raw !== '' ? raw : PROFILE_NAME_FALLBACK };
}

function userIdsForOfferRows(rows: Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const id = readOffererId(r);
    if (id) out.push(id.trim());
  }
  return out;
}

/**
 * Fetches `offers` for a request, then batch-loads `profiles (id, name)` and merges into the
 * in-memory name cache (no PostgREST resource embeds).
 */
export async function fetchOffersByRequestIdWithProfiles(
  supabase: SupabaseClient,
  requestRowId: string
): Promise<{ data: Record<string, unknown>[]; error: { message: string } | null }> {
  const b = await supabase.from('offers').select('*').eq('request_id', requestRowId);
  if (b.error) {
    return { data: [], error: b.error };
  }
  const data = (b.data ?? []) as Record<string, unknown>[];
  await fetchAndMergeProfileNames(supabase, userIdsForOfferRows(data));
  return { data, error: null };
}

/**
 * Fetches all `offers` and batch-resolves offerer display names from `public.profiles`.
 */
export async function fetchAllOffersWithProfiles(
  supabase: SupabaseClient
): Promise<{ data: Record<string, unknown>[]; error: { message: string } | null }> {
  const b = await supabase.from('offers').select('*');
  if (b.error) {
    return { data: [], error: b.error };
  }
  const data = (b.data ?? []) as Record<string, unknown>[];
  await fetchAndMergeProfileNames(supabase, userIdsForOfferRows(data));
  return { data, error: null };
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

  const readInt = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
    }
    return undefined;
  };

  const negotiationDeclineTotal = readInt(
    row.negotiation_decline_total ?? row.negotiationDeclineTotal
  );
  const withdrawCycleCount = readInt(row.withdraw_cycle_count ?? row.withdrawCycleCount);
  const negotiationLocked =
    row.negotiation_locked === true ||
    row.negotiation_locked === 't' ||
    row.negotiationLocked === true;
  const lastWithdrawalRaw = row.last_withdrawal_at ?? row.lastWithdrawalAt;
  let lastWithdrawalAt: number | undefined;
  if (typeof lastWithdrawalRaw === 'string' && lastWithdrawalRaw.trim() !== '') {
    const t = Date.parse(lastWithdrawalRaw);
    if (Number.isFinite(t)) lastWithdrawalAt = t;
  }

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
  if (negotiationDeclineTotal !== undefined) out.negotiationDeclineTotal = negotiationDeclineTotal;
  if (withdrawCycleCount !== undefined) out.withdrawCycleCount = withdrawCycleCount;
  if (lastWithdrawalAt !== undefined) out.lastWithdrawalAt = lastWithdrawalAt;
  if (negotiationLocked) out.negotiationLocked = true;
  const nekRaw = row.last_negotiation_event_kind ?? row.lastNegotiationEventKind;
  if (typeof nekRaw === 'string' && nekRaw.trim() !== '') {
    out.lastNegotiationEventKind = nekRaw.trim();
  }
  const ndm = row.negotiation_delivery_method ?? row.negotiationDeliveryMethod;
  if (ndm === 'pickup' || ndm === 'owner_delivery') {
    out.negotiationDeliveryMethod = ndm as NegotiationDeliveryMethod;
  }
  const ndf = row.negotiation_delivery_fee ?? row.negotiationDeliveryFee;
  if (typeof ndf === 'number' && Number.isFinite(ndf)) {
    out.negotiationDeliveryFee = Math.max(0, ndf);
  } else if (ndm === 'pickup') {
    out.negotiationDeliveryFee = null;
  }
  if (message) out.message = message;
  if (toolDescription) out.toolDescription = toolDescription;

  const oi = row.offer_images;
  if (Array.isArray(oi)) {
    const urls = oi
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      .map((s) => s.trim());
    if (urls.length > 0) out.offer_images = urls;
  }

  const prof = readProfilesFromOfferRow(row);
  if (prof) {
    out.profiles = { id: prof.id, name: prof.name };
  }

  const fromJoin = prof?.name;
  const fromCache = getRemoteDisplayNameForUserId(renterId)?.trim() || '';
  const nameResolved = (fromJoin && fromJoin.trim() !== '' ? fromJoin : null) || (fromCache !== '' ? fromCache : null);
  if (nameResolved) {
    out.offerUserName = nameResolved;
    if (isUuidString(renterId)) {
      mergeProfileRowsFromServer([{ id: renterId, name: nameResolved }]);
    }
  } else if (isUuidString(renterId)) {
    out.offerUserName = PROFILE_NAME_FALLBACK;
  }
  return out;
}

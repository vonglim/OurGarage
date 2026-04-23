import type { Offer } from '@/lib/negotiationOfferTypes';
import { fetchAndMergeProfileNames } from '@/lib/remoteProfileCache';
import { getSupabase } from '@/lib/supabase';
import { fetchOffersByRequestIdWithProfiles, mapSupabaseOfferRowToOffer } from '@/lib/supabaseOffers';
import { mapSupabaseRequestSelectRowToApp } from '@/lib/supabaseRequests';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { useOffersStore } from '@/store/offersStore';
import { useRequestsStore } from '@/store/requestsStore';

const TAG = '[OfferSync]';

export function logOfferSync(phase: 'before_write' | 'supabase_response' | 'store_updated', message: string, extra?: unknown): void {
  if (!__DEV__) return;
  if (extra !== undefined) {
    console.log(TAG, phase, message, extra);
  } else {
    console.log(TAG, phase, message);
  }
}

function mergeLocalRequestForOfferSync(
  serverMapped: Record<string, unknown>,
  prev: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!prev) return serverMapped;
  const st = prev.rentalStatus;
  if (st === 'active' || st === 'completed' || prev.fulfilled === true) {
    return {
      ...serverMapped,
      fulfilled: prev.fulfilled,
      rentalStatus: prev.rentalStatus,
      acceptedOfferId: prev.acceptedOfferId ?? serverMapped.acceptedOfferId,
      acceptedPrice: prev.acceptedPrice ?? serverMapped.acceptedPrice,
      rentalStart: prev.rentalStart,
      rentalActive: prev.rentalActive,
    };
  }
  return serverMapped;
}

function mergeServerOfferWithLocalThreadFields(server: Offer, prevById: Map<string, Offer>): Offer {
  const prev = prevById.get(server.id);
  if (!prev) return server;
  return {
    ...server,
    messageHistory:
      server.messageHistory.length > 0 ? server.messageHistory : (prev.messageHistory ?? []),
    profiles: server.profiles ?? prev.profiles,
    offerUserName: server.offerUserName ?? prev.offerUserName,
    offerUserRating: prev.offerUserRating ?? server.offerUserRating,
    offerUserAvatar: prev.offerUserAvatar ?? server.offerUserAvatar,
    offerUserLastActive: prev.offerUserLastActive ?? server.offerUserLastActive,
  };
}

/**
 * Fetches a single `requests` row and all `offers` for that request from Supabase,
 * then updates Zustand. Supabase is authoritative for match and offer state.
 */
export async function syncRequestAndOffersFromSupabase(
  requestRowId: string,
  appRequestTimestamp: number
): Promise<boolean> {
  const supabase = getSupabase();
  logOfferSync('before_write', 'syncRequestAndOffersFromSupabase fetch', { requestRowId, appRequestTimestamp });

  const { data: reqData, error: reqErr } = await supabase
    .from('requests')
    .select('*')
    .eq('id', requestRowId)
    .maybeSingle();

  if (reqErr) {
    logOfferSync('supabase_response', 'request fetch failed', reqErr.message);
    return false;
  }
  if (reqData == null || typeof reqData !== 'object') {
    logOfferSync('supabase_response', 'request fetch empty', { requestRowId });
    return false;
  }

  const { data: offerRows, error: offErr } = await fetchOffersByRequestIdWithProfiles(
    supabase,
    requestRowId
  );

  if (offErr) {
    logOfferSync('supabase_response', 'offers fetch failed', offErr.message);
    return false;
  }

  const reqRow = reqData as Record<string, unknown>;
  const offerList = (offerRows ?? []) as Record<string, unknown>[];
  const offerUserIds = offerList
    .map((raw) => (typeof raw.user_id === 'string' ? raw.user_id.trim() : ''))
    .filter((s) => s.length > 0);
  const ownerRow = reqRow as { user_id?: string; owner_id?: string };
  const ownerId =
    typeof ownerRow.user_id === 'string' && ownerRow.user_id.trim() !== ''
      ? ownerRow.user_id.trim()
      : typeof ownerRow.owner_id === 'string'
        ? ownerRow.owner_id.trim()
        : '';
  await fetchAndMergeProfileNames(supabase, [ownerId, ...offerUserIds].filter((s) => s.length > 0));

  const remoteMapped = mapSupabaseRequestSelectRowToApp(reqRow);
  const list = useRequestsStore.getState().requests;
  const idx = list.findIndex((r) => (r as { timestamp?: number }).timestamp === appRequestTimestamp);
  const prev = idx >= 0 ? (list[idx] as Record<string, unknown>) : undefined;
  const mergedRequest = mergeLocalRequestForOfferSync(remoteMapped, prev);
  if (typeof (mergedRequest as { timestamp?: number }).timestamp !== 'number') {
    (mergedRequest as { timestamp: number }).timestamp = appRequestTimestamp;
  } else {
    (mergedRequest as { timestamp: number }).timestamp = appRequestTimestamp;
  }
  if (getRequestSupabaseRowId(mergedRequest) !== requestRowId) {
    (mergedRequest as { id: string; remoteId: string }).id = requestRowId;
    (mergedRequest as { remoteId: string }).remoteId = requestRowId;
  }

  const prevOffers = useOffersStore
    .getState()
    .offers.filter((o) => o.requestId === appRequestTimestamp);
  const prevById = new Map<string, Offer>(prevOffers.map((o) => [o.id, o]));
  const mappedOffers = offerList.map((raw) => {
    const o = mapSupabaseOfferRowToOffer(raw as Record<string, unknown>, appRequestTimestamp);
    return mergeServerOfferWithLocalThreadFields(o, prevById);
  });

  useRequestsStore.setState((s) => {
    const next = s.requests.map((r) =>
      (r as { timestamp?: number }).timestamp === appRequestTimestamp ? { ...r, ...mergedRequest } : r
    );
    if (!next.some((r) => (r as { timestamp?: number }).timestamp === appRequestTimestamp)) {
      return { requests: [...next, mergedRequest] };
    }
    return { requests: next };
  });

  useOffersStore.getState().replaceOffersForRequestThread(appRequestTimestamp, mappedOffers);

  logOfferSync('store_updated', 'request + offers merged from Supabase', {
    requestRowId,
    appRequestTimestamp,
    offerCount: mappedOffers.length,
  });
  return true;
}

import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import { resolveNegotiationDeliveryForWrite } from '@/lib/negotiationDelivery';
import type { StoredOfferEvidence } from '@/lib/offerEvidencePhotos';
import { logOfferSync } from '@/lib/supabaseOfferSync';
import { getSupabase } from '@/lib/supabase';

function stripOfferEvidenceField(row: Record<string, unknown>): Record<string, unknown> {
  const { offer_evidence: _removed, ...rest } = row;
  return rest;
}

/** Remote DB without migration `053_offers_offer_evidence` — PostgREST rejects unknown columns. */
function isMissingOfferEvidenceColumnError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (typeof e.message !== 'string') return false;
  if (!e.message.includes('offer_evidence')) return false;
  if (e.code === 'PGRST204') return true;
  const m = e.message.toLowerCase();
  return m.includes('schema cache') || m.includes('column') || m.includes('could not find');
}

function receiverIdForOfferMessage(author: string, poster: string | null, renter: string): string | null {
  const a = author.trim();
  const r = renter.trim();
  const p = typeof poster === 'string' ? poster.trim() : '';
  if (!a || !r) return null;
  if (p && p === r) return null;
  if (p && a === p) return r;
  if (a === r) return p || null;
  return null;
}

export type NegotiationOfferStatus =
  | 'pending'
  | 'pending_confirmation'
  | 'accepted'
  | 'declined'
  | 'closed';

export type OfferMessageKind =
  | 'initial'
  | 'renter_update'
  | 'poster_counter'
  | 'renter_accepts'
  | 'proposal_declined'
  | 'declined'
  | 'accepted';

export type NegotiationLifecycleDbWrite = {
  negotiationDeclineTotal?: number;
  withdrawCycleCount?: number;
  lastWithdrawalAtIso?: string | null;
  negotiationLocked?: boolean;
};

export async function upsertNegotiationOfferToSupabase(input: {
  requestRowId: string;
  /** Request owner; used with `renterId` to set `offer_messages.receiver_id`. */
  posterUserId: string | null;
  renterId: string;
  currentPrice: number;
  lastUpdatedBy: string;
  status?: NegotiationOfferStatus;
  message?: string;
  /**
   * When set, stored on the new `offer_messages` row only (e.g. proposal decline copy).
   * `offers.message` still uses `message` when provided.
   */
  threadEventBody?: string;
  posterCounterCount?: number;
  messageKind: OfferMessageKind;
  /** When set (including empty array), persisted on `offers` and copied to this `offer_messages` row. Omit to leave DB unchanged on update. */
  offer_images?: string[];
  /** When set, persisted on `offers.offer_evidence` (jsonb). Omit to leave unchanged. */
  offer_evidence?: StoredOfferEvidence | null;
  /** When set, persisted on `offers.tool_description`. Omit to leave unchanged. */
  toolDescription?: string | null;
  /** When set, persisted on `offers.replacement_value`. Omit to leave unchanged. */
  replacementValue?: number | null;
  /** When set, persisted on `offers.item_condition`. Omit to leave unchanged. */
  itemCondition?: 'excellent' | 'good' | 'fair' | null;
  /** Optional lifecycle counters (anti-spam); omitted fields are not written on update. */
  negotiationLifecycle?: NegotiationLifecycleDbWrite;
  /** When set, persisted on `offers` for the negotiated fulfillment terms. */
  negotiationDelivery?: { method: NegotiationDeliveryMethod; fee: number | null } | null;
  /** Used to infer delivery from legacy offer `message` when `negotiationDelivery` is omitted. */
  requestHowHint?: string | null;
}): Promise<{ id: string } | null> {
  const supabase = getSupabase();
  const status = input.status ?? 'pending';
  const msg = input.message?.trim();
  const threadBody = input.threadEventBody?.trim();
  const bodyForOfferMessage = threadBody && threadBody.length > 0 ? threadBody : msg;

  logOfferSync('before_write', 'upsertNegotiationOfferToSupabase', {
    requestRowId: input.requestRowId,
    messageKind: input.messageKind,
  });

  const { data: found, error: selErr } = await supabase
    .from('offers')
    .select('id')
    .eq('request_id', input.requestRowId)
    .eq('user_id', input.renterId)
    .maybeSingle();

  if (selErr && __DEV__) console.warn('[Negotiation] select offer:', selErr.message);

  const existingId =
    found && typeof (found as { id?: unknown }).id === 'string'
      ? String((found as { id: string }).id).trim()
      : '';

  const baseFields: Record<string, unknown> = {
    current_price: input.currentPrice,
    price: input.currentPrice,
    last_updated_by: input.lastUpdatedBy,
    status,
    poster_counter_count: input.posterCounterCount ?? 0,
    updated_at: new Date().toISOString(),
    last_negotiation_event_kind: input.messageKind,
  };
  if (msg) baseFields.message = msg;
  if (input.offer_images !== undefined) {
    baseFields.offer_images =
      input.offer_images.length > 0 ? input.offer_images.map((u) => String(u).trim()).filter(Boolean) : null;
  }
  if (input.offer_evidence !== undefined) {
    baseFields.offer_evidence = input.offer_evidence;
  }
  if (input.toolDescription !== undefined) {
    const t = input.toolDescription?.trim() ?? '';
    baseFields.tool_description = t.length > 0 ? t : null;
  }
  if (input.replacementValue !== undefined) {
    const rv = input.replacementValue;
    baseFields.replacement_value =
      rv != null && Number.isFinite(rv) && rv > 0 ? rv : null;
  }
  if (input.itemCondition !== undefined) {
    const c = input.itemCondition;
    baseFields.item_condition =
      c === 'excellent' || c === 'good' || c === 'fair' ? c : null;
  }
  const lc = input.negotiationLifecycle;
  if (lc != null) {
    if (lc.negotiationDeclineTotal !== undefined) {
      baseFields.negotiation_decline_total = lc.negotiationDeclineTotal;
    }
    if (lc.withdrawCycleCount !== undefined) {
      baseFields.withdraw_cycle_count = lc.withdrawCycleCount;
    }
    if (lc.lastWithdrawalAtIso !== undefined) {
      baseFields.last_withdrawal_at = lc.lastWithdrawalAtIso;
    }
    if (lc.negotiationLocked !== undefined) {
      baseFields.negotiation_locked = lc.negotiationLocked;
    }
  }

  const writeNegotiationDelivery =
    input.negotiationDelivery != null ||
    input.messageKind === 'initial' ||
    input.messageKind === 'renter_update' ||
    input.messageKind === 'poster_counter';
  if (writeNegotiationDelivery) {
    const resolved = resolveNegotiationDeliveryForWrite({
      message: msg ?? bodyForOfferMessage,
      explicit: input.negotiationDelivery ?? undefined,
      requestHowFallback: input.requestHowHint ?? null,
    });
    baseFields.negotiation_delivery_method = resolved.method;
    baseFields.negotiation_delivery_fee = resolved.method === 'pickup' ? null : resolved.fee;
  }

  let offerId: string;

  if (existingId) {
    offerId = existingId;
    let updatePayload: Record<string, unknown> = { ...baseFields };
    let { error: upErr } = await supabase.from('offers').update(updatePayload).eq('id', offerId);
    if (upErr && isMissingOfferEvidenceColumnError(upErr) && 'offer_evidence' in updatePayload) {
      if (__DEV__) {
        logOfferSync('supabase_response', 'offer update retry without offer_evidence', upErr.message);
      }
      updatePayload = stripOfferEvidenceField(updatePayload);
      ({ error: upErr } = await supabase.from('offers').update(updatePayload).eq('id', offerId));
    }
    if (upErr) {
      logOfferSync('supabase_response', 'offer update failed', upErr.message);
      return null;
    }
  } else {
    let insertRow: Record<string, unknown> = {
      ...baseFields,
      request_id: input.requestRowId,
      user_id: input.renterId,
      negotiation_decline_total: lc?.negotiationDeclineTotal ?? 0,
      withdraw_cycle_count: lc?.withdrawCycleCount ?? 0,
      last_withdrawal_at: lc?.lastWithdrawalAtIso ?? null,
      negotiation_locked: lc?.negotiationLocked ?? false,
    };
    let { data: ins, error: inErr } = await supabase
      .from('offers')
      .insert(insertRow)
      .select('id')
      .single();
    if (inErr && isMissingOfferEvidenceColumnError(inErr) && 'offer_evidence' in insertRow) {
      if (__DEV__) {
        logOfferSync('supabase_response', 'offer insert retry without offer_evidence', inErr.message);
      }
      insertRow = stripOfferEvidenceField(insertRow);
      ({ data: ins, error: inErr } = await supabase
        .from('offers')
        .insert(insertRow)
        .select('id')
        .single());
    }
    if (inErr || !ins || typeof (ins as { id?: unknown }).id !== 'string') {
      if (inErr) logOfferSync('supabase_response', 'offer insert failed', inErr.message);
      return null;
    }
    offerId = String((ins as { id: string }).id);
  }

  const receiverId = receiverIdForOfferMessage(
    input.lastUpdatedBy,
    input.posterUserId,
    input.renterId
  );

  const offerMsgRow: Record<string, unknown> = {
    request_id: input.requestRowId,
    offer_id: offerId,
    author_id: input.lastUpdatedBy,
    receiver_id: receiverId,
    body: bodyForOfferMessage ? bodyForOfferMessage : null,
    price: input.currentPrice,
    kind: input.messageKind,
  };
  if (input.offer_images !== undefined) {
    offerMsgRow.offer_images =
      input.offer_images.length > 0 ? input.offer_images.map((u) => String(u).trim()).filter(Boolean) : null;
  }
  const { error: msgErr } = await supabase.from('offer_messages').insert(offerMsgRow);
  if (msgErr) {
    logOfferSync('supabase_response', 'offer_messages insert failed', msgErr.message);
    return null;
  }

  logOfferSync('supabase_response', 'upsertNegotiationOfferToSupabase ok', { id: offerId });
  return { id: offerId };
}

function isUndefinedColumnNegotiation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '42703') return true;
  const m = String(err.message ?? '');
  return /column .+ does not exist/i.test(m) || /Could not find the '.+' column/i.test(m);
}

function parseMissingColumnNegotiation(message: string): string | null {
  const m1 = message.match(/column\s+"([^"]+)"\s+of\s+relation/i);
  if (m1?.[1]) return m1[1];
  const m2 = message.match(/Could not find the '([^']+)' column/i);
  if (m2?.[1]) return m2[1];
  return null;
}

/**
 * Negotiation thread keyed by `offers.listing_id` (no `requests` row). Reuses `offer_messages` with `request_id` null.
 */
export async function upsertNegotiationListingOfferToSupabase(input: {
  listingId: string;
  listingSnapshot: Record<string, unknown>;
  posterUserId: string | null;
  renterId: string;
  currentPrice: number;
  lastUpdatedBy: string;
  status?: NegotiationOfferStatus;
  message?: string;
  threadEventBody?: string;
  posterCounterCount?: number;
  messageKind: OfferMessageKind;
  offer_images?: string[];
  offer_evidence?: StoredOfferEvidence | null;
  toolDescription?: string | null;
  replacementValue?: number | null;
  itemCondition?: 'excellent' | 'good' | 'fair' | null;
  negotiationLifecycle?: NegotiationLifecycleDbWrite;
  negotiationDelivery?: { method: NegotiationDeliveryMethod; fee: number | null } | null;
}): Promise<{ id: string } | null> {
  const supabase = getSupabase();
  const listingId = input.listingId.trim();
  const status = input.status ?? 'pending';
  const msg = input.message?.trim();
  const threadBody = input.threadEventBody?.trim();
  const bodyForOfferMessage = threadBody && threadBody.length > 0 ? threadBody : msg;

  logOfferSync('before_write', 'upsertNegotiationListingOfferToSupabase', {
    listingId,
    messageKind: input.messageKind,
  });

  const { data: found, error: selErr } = await supabase
    .from('offers')
    .select('id')
    .eq('listing_id', listingId)
    .eq('user_id', input.renterId)
    .maybeSingle();

  if (selErr && __DEV__) console.warn('[Negotiation] select listing offer:', selErr.message);

  const existingId =
    found && typeof (found as { id?: unknown }).id === 'string'
      ? String((found as { id: string }).id).trim()
      : '';

  const baseFields: Record<string, unknown> = {
    current_price: input.currentPrice,
    price: input.currentPrice,
    last_updated_by: input.lastUpdatedBy,
    status,
    poster_counter_count: input.posterCounterCount ?? 0,
    updated_at: new Date().toISOString(),
    last_negotiation_event_kind: input.messageKind,
  };
  if (msg) baseFields.message = msg;
  if (input.offer_images !== undefined) {
    baseFields.offer_images =
      input.offer_images.length > 0 ? input.offer_images.map((u) => String(u).trim()).filter(Boolean) : null;
  }
  if (input.offer_evidence !== undefined) {
    baseFields.offer_evidence = input.offer_evidence;
  }
  if (input.toolDescription !== undefined) {
    const t = input.toolDescription?.trim() ?? '';
    baseFields.tool_description = t.length > 0 ? t : null;
  }
  if (input.replacementValue !== undefined) {
    const rv = input.replacementValue;
    baseFields.replacement_value =
      rv != null && Number.isFinite(rv) && rv > 0 ? rv : null;
  }
  if (input.itemCondition !== undefined) {
    const c = input.itemCondition;
    baseFields.item_condition =
      c === 'excellent' || c === 'good' || c === 'fair' ? c : null;
  }
  const lc = input.negotiationLifecycle;
  if (lc != null) {
    if (lc.negotiationDeclineTotal !== undefined) {
      baseFields.negotiation_decline_total = lc.negotiationDeclineTotal;
    }
    if (lc.withdrawCycleCount !== undefined) {
      baseFields.withdraw_cycle_count = lc.withdrawCycleCount;
    }
    if (lc.lastWithdrawalAtIso !== undefined) {
      baseFields.last_withdrawal_at = lc.lastWithdrawalAtIso;
    }
    if (lc.negotiationLocked !== undefined) {
      baseFields.negotiation_locked = lc.negotiationLocked;
    }
  }

  const writeNegotiationDelivery =
    input.negotiationDelivery != null ||
    input.messageKind === 'initial' ||
    input.messageKind === 'renter_update' ||
    input.messageKind === 'poster_counter';
  if (writeNegotiationDelivery) {
    const resolved = resolveNegotiationDeliveryForWrite({
      message: msg ?? bodyForOfferMessage,
      explicit: input.negotiationDelivery ?? undefined,
      requestHowFallback: null,
    });
    baseFields.negotiation_delivery_method = resolved.method;
    baseFields.negotiation_delivery_fee = resolved.method === 'pickup' ? null : resolved.fee;
  }

  let offerId: string;

  if (existingId) {
    offerId = existingId;
    let updatePayload: Record<string, unknown> = { ...baseFields };
    let { error: upErr } = await supabase.from('offers').update(updatePayload).eq('id', offerId);
    if (upErr && isMissingOfferEvidenceColumnError(upErr) && 'offer_evidence' in updatePayload) {
      updatePayload = stripOfferEvidenceField(updatePayload);
      ({ error: upErr } = await supabase.from('offers').update(updatePayload).eq('id', offerId));
    }
    if (upErr) {
      logOfferSync('supabase_response', 'listing offer update failed', upErr.message);
      return null;
    }
  } else {
    let insertRow: Record<string, unknown> = {
      ...baseFields,
      request_id: null,
      listing_id: listingId,
      listing_snapshot: input.listingSnapshot,
      user_id: input.renterId,
      negotiation_decline_total: lc?.negotiationDeclineTotal ?? 0,
      withdraw_cycle_count: lc?.withdrawCycleCount ?? 0,
      last_withdrawal_at: lc?.lastWithdrawalAtIso ?? null,
      negotiation_locked: lc?.negotiationLocked ?? false,
    };

    let ins: { id?: unknown } | null = null;
    let inErr: { message?: string; code?: string } | null = null;
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await supabase.from('offers').insert(insertRow).select('id').single();
      ins = res.data as { id?: unknown } | null;
      inErr = res.error as { message?: string; code?: string } | null;
      if (!inErr) break;
      if (isMissingOfferEvidenceColumnError(inErr) && 'offer_evidence' in insertRow) {
        insertRow = stripOfferEvidenceField(insertRow);
        continue;
      }
      if (isUndefinedColumnNegotiation(inErr)) {
        const col = parseMissingColumnNegotiation(String(inErr.message ?? ''));
        if (col && Object.prototype.hasOwnProperty.call(insertRow, col)) {
          const next = { ...insertRow };
          delete next[col];
          insertRow = next;
          if (__DEV__) {
            logOfferSync('supabase_response', 'listing offer insert strip column', { col, attempt });
          }
          continue;
        }
        const fallback = ['listing_snapshot', 'listing_id'] as const;
        let stripped = false;
        for (const key of fallback) {
          if (key in insertRow) {
            const next = { ...insertRow };
            delete next[key];
            insertRow = next;
            stripped = true;
            break;
          }
        }
        if (!stripped) break;
        continue;
      }
      break;
    }

    if (inErr || !ins || typeof ins.id !== 'string') {
      if (inErr) logOfferSync('supabase_response', 'listing offer insert failed', inErr.message);
      return null;
    }
    offerId = String(ins.id);
    if (__DEV__) {
      console.log('[listing-offer] successful insert payload keys', Object.keys(insertRow).sort().join(','));
    }
  }

  const receiverId = receiverIdForOfferMessage(
    input.lastUpdatedBy,
    input.posterUserId,
    input.renterId
  );

  const offerMsgRow: Record<string, unknown> = {
    request_id: null,
    offer_id: offerId,
    author_id: input.lastUpdatedBy,
    receiver_id: receiverId,
    body: bodyForOfferMessage ? bodyForOfferMessage : null,
    price: input.currentPrice,
    kind: input.messageKind,
  };
  if (input.offer_images !== undefined) {
    offerMsgRow.offer_images =
      input.offer_images.length > 0 ? input.offer_images.map((u) => String(u).trim()).filter(Boolean) : null;
  }
  const { error: msgErr } = await supabase.from('offer_messages').insert(offerMsgRow);
  if (msgErr) {
    logOfferSync('supabase_response', 'listing offer_messages insert failed', msgErr.message);
    return null;
  }

  logOfferSync('supabase_response', 'upsertNegotiationListingOfferToSupabase ok', { id: offerId });
  return { id: offerId };
}

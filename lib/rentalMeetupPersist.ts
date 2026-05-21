import type { SupabaseClient } from '@supabase/supabase-js';

import {
  reconcileOperationalPickupIso,
  reconcileOperationalReturnIso,
} from '@/lib/rentalWizard/proposedMeetupSchedule';

export type MeetupProposalPersistPhase = 'pickup' | 'return' | 'extension' | 'general';

export type MeetupProposalPersistInput = {
  meetupTimeIso: string;
  returnTimeIso: string;
  meetupLocation: string;
  returnLocation: string;
  viewerUserId: string;
  ownerUserId: string;
  renterUserId: string;
  proposalVersion: number;
  nowIso: string;
};

export type MeetupProposalPersistBaseline = {
  meetup_time?: string | null;
  pickup_datetime?: string | null;
  return_time?: string | null;
  return_datetime?: string | null;
  meetup_location?: string | null;
  return_location?: string | null;
};

function parsePersistIso(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !Number.isFinite(Date.parse(s))) return null;
  return s;
}

export type MeetupProposalPersistedRow = {
  meetup_time?: string | null;
  pickup_datetime?: string | null;
  return_time?: string | null;
  return_datetime?: string | null;
};

/** Atomic operational proposal columns — always sync legacy + canonical datetime fields. */
export function buildMeetupProposalPersistPayload(
  input: MeetupProposalPersistInput,
  options?: { phase?: MeetupProposalPersistPhase; baseline?: MeetupProposalPersistBaseline | null }
): Record<string, unknown> {
  const phase = options?.phase ?? 'general';
  const baseline = options?.baseline ?? null;

  let meetupTimeIso = input.meetupTimeIso;
  let returnTimeIso = input.returnTimeIso;
  let meetupLocation = input.meetupLocation;
  let returnLocation = input.returnLocation;

  if (baseline && phase === 'pickup') {
    const baselineReturn =
      parsePersistIso(baseline.return_datetime) ??
      reconcileOperationalReturnIso(baseline).iso ??
      returnTimeIso;
    const baselineReturnLoc = (
      baseline.return_location ??
      baseline.meetup_location ??
      returnLocation
    ).trim();
    returnTimeIso = baselineReturn;
    if (baselineReturnLoc) returnLocation = baselineReturnLoc;
  } else if (baseline && phase === 'return') {
    const baselinePickup =
      parsePersistIso(baseline.pickup_datetime) ??
      reconcileOperationalPickupIso(baseline).iso ??
      meetupTimeIso;
    const baselineMeetupLoc = (
      baseline.meetup_location ??
      baseline.return_location ??
      meetupLocation
    ).trim();
    meetupTimeIso = baselinePickup;
    if (baselineMeetupLoc) meetupLocation = baselineMeetupLoc;
  }

  const iAmOwner = input.viewerUserId === input.ownerUserId;
  const iAmRenter = input.viewerUserId === input.renterUserId;
  return {
    meetup_time: meetupTimeIso,
    pickup_datetime: meetupTimeIso,
    return_time: returnTimeIso,
    return_datetime: returnTimeIso,
    meetup_location: meetupLocation,
    return_location: returnLocation,
    confirmed_by_owner: iAmOwner,
    confirmed_by_renter: iAmRenter,
    owner_confirmed: iAmOwner,
    renter_confirmed: iAmRenter,
    agreement_status: 'pending',
    confirmed_at: null,
    last_proposed_by: input.viewerUserId,
    proposal_version: input.proposalVersion,
    proposal_updated_at: input.nowIso,
    latest_proposal_message_id: null,
  };
}

export function readPersistedMeetupOperationalRow(
  row: MeetupProposalPersistedRow | null | undefined
): {
  persistedPickupIso: string | null;
  persistedReturnIso: string | null;
  pickupFieldConflict: boolean;
  returnFieldConflict: boolean;
} {
  const pickup = reconcileOperationalPickupIso(row ?? {});
  const ret = reconcileOperationalReturnIso(row ?? {});
  return {
    persistedPickupIso: pickup.iso,
    persistedReturnIso: ret.iso,
    pickupFieldConflict: pickup.conflict,
    returnFieldConflict: ret.conflict,
  };
}

export function logRentalMeetupPersist(
  rentalId: string,
  input: {
    submittedPickupIso: string;
    submittedReturnIso: string;
    persistedPickupIso: string | null;
    persistedReturnIso: string | null;
    renderedPickupIso?: string | null;
    renderedReturnIso?: string | null;
    phase?: MeetupProposalPersistPhase;
    source?: string;
    pickupFieldConflict?: boolean;
    returnFieldConflict?: boolean;
    pickupPersistMismatch?: boolean;
    returnPersistMismatch?: boolean;
    rawMeetupTime?: string | null;
    rawPickupDatetime?: string | null;
    rawReturnTime?: string | null;
    rawReturnDatetime?: string | null;
  }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[rental-meetup-persist]', {
    rentalId,
    ...input,
  });
}

export async function fetchPersistedMeetupOperationalRow(
  supabase: SupabaseClient,
  rentalId: string
): Promise<MeetupProposalPersistedRow | null> {
  const { data } = await supabase
    .from('rentals')
    .select('meetup_time,pickup_datetime,return_time,return_datetime')
    .eq('id', rentalId)
    .maybeSingle();
  return (data as MeetupProposalPersistedRow | null) ?? null;
}

export async function persistMeetupProposalRow(
  supabase: SupabaseClient,
  rentalId: string,
  input: MeetupProposalPersistInput,
  logContext: {
    phase: MeetupProposalPersistPhase;
    source: string;
    renderedPickupIso?: string | null;
    renderedReturnIso?: string | null;
    baseline?: MeetupProposalPersistBaseline | null;
  }
): Promise<{ ok: boolean; persisted: MeetupProposalPersistedRow | null }> {
  const payload = buildMeetupProposalPersistPayload(input, {
    phase: logContext.phase,
    baseline: logContext.baseline ?? null,
  });
  const { error } = await supabase.from('rentals').update(payload).eq('id', rentalId);
  if (error) {
    if (__DEV__) {
      console.log('[rental-meetup-persist]', {
        rentalId,
        submittedPickupIso: input.meetupTimeIso,
        submittedReturnIso: input.returnTimeIso,
        persistedPickupIso: null,
        persistedReturnIso: null,
        phase: logContext.phase,
        source: logContext.source,
        persistError: error.message,
      });
    }
    return { ok: false, persisted: null };
  }

  const persistedRow = await fetchPersistedMeetupOperationalRow(supabase, rentalId);
  const read = readPersistedMeetupOperationalRow(persistedRow);
  const pickupMismatch =
    read.persistedPickupIso != null &&
    input.meetupTimeIso.trim() !== read.persistedPickupIso &&
    Date.parse(input.meetupTimeIso.trim()) !== Date.parse(read.persistedPickupIso);
  const returnMismatch =
    read.persistedReturnIso != null &&
    input.returnTimeIso.trim() !== read.persistedReturnIso &&
    Date.parse(input.returnTimeIso.trim()) !== Date.parse(read.persistedReturnIso);
  logRentalMeetupPersist(rentalId, {
    submittedPickupIso: input.meetupTimeIso,
    submittedReturnIso: input.returnTimeIso,
    persistedPickupIso: read.persistedPickupIso,
    persistedReturnIso: read.persistedReturnIso,
    renderedPickupIso: logContext.renderedPickupIso ?? null,
    renderedReturnIso: logContext.renderedReturnIso ?? null,
    phase: logContext.phase,
    source: logContext.source,
    pickupFieldConflict: read.pickupFieldConflict,
    returnFieldConflict: read.returnFieldConflict,
    pickupPersistMismatch: pickupMismatch,
    returnPersistMismatch: returnMismatch,
    rawMeetupTime: persistedRow?.meetup_time ?? null,
    rawPickupDatetime: persistedRow?.pickup_datetime ?? null,
    rawReturnTime: persistedRow?.return_time ?? null,
    rawReturnDatetime: persistedRow?.return_datetime ?? null,
  });
  return { ok: true, persisted: persistedRow };
}

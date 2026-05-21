/** Helpers for rental return extensions via meetup proposal infrastructure. */

import {
  isMeetupProposalExtensionRequest,
  type ContractualRentalWindowInput,
} from '@/lib/rentalContractWindow';

const MS_PER_DAY = 86_400_000;

export function addCalendarDaysToIso(iso: string, days: number): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || days < 0) return null;
  return new Date(t + days * MS_PER_DAY).toISOString();
}

export function resolveRentalPickupIso(rental: {
  pickup_datetime?: string | null;
  meetup_time?: string | null;
  agreed_pickup_datetime?: string | null;
}): string | null {
  for (const k of ['agreed_pickup_datetime', 'pickup_datetime', 'meetup_time'] as const) {
    const v = rental[k];
    if (typeof v === 'string' && v.trim() !== '') {
      const t = Date.parse(v);
      if (Number.isFinite(t)) return v.trim();
    }
  }
  return null;
}

export function resolveRentalReturnIso(rental: {
  return_datetime?: string | null;
  return_time?: string | null;
  agreed_return_datetime?: string | null;
}): string | null {
  for (const k of ['agreed_return_datetime', 'return_datetime', 'return_time'] as const) {
    const v = rental[k];
    if (typeof v === 'string' && v.trim() !== '') {
      const t = Date.parse(v);
      if (Number.isFinite(t)) return v.trim();
    }
  }
  return null;
}

export function buildExtensionReturnIso(currentReturnIso: string, extraDays: number): string | null {
  if (extraDays <= 0) return null;
  return addCalendarDaysToIso(currentReturnIso, extraDays);
}

/**
 * Extension = proposed return crosses beyond the contractual end calendar day,
 * or proposed pickup is before the contractual start calendar day.
 * Does NOT compare pickup↔return hour span.
 */
export function isReturnExtensionProposal(input: {
  baselinePickupIso?: string | null;
  baselineReturnIso?: string | null;
  proposedPickupIso: string;
  proposedReturnIso: string;
  schedulingMeta?: unknown;
  scheduleHints?: ContractualRentalWindowInput['scheduleHints'];
  explicitExtension?: boolean;
}): boolean {
  return isMeetupProposalExtensionRequest({
    proposedPickupIso: input.proposedPickupIso,
    proposedReturnIso: input.proposedReturnIso,
    schedulingMeta: input.schedulingMeta,
    scheduleHints: input.scheduleHints,
    explicitExtension: input.explicitExtension,
  });
}

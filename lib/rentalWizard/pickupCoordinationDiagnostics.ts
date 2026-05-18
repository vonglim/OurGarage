import {
  resolveAcceptedMeetupLocation,
  resolveAcceptedRentalPickupIso,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
import { buildRentalWizardContextFlags } from '@/lib/rentalWizard/rentalWizardContextFlags';
import type { RentalWizardContext, RentalWizardRentalRow } from '@/lib/rentalWizard/types';

const WIZARD_PICKUP_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__;

export type PickupCoordinationDiagnostic = {
  complete: boolean;
  reasons: string[];
  rentalId: string;
  agreement_status: string | null;
  last_proposed_by: string | null;
  meetingCompleted: boolean;
  hasPendingProposal: boolean;
  meetup_location: string | null;
  agreed_pickup_datetime: string | null;
  meetup_time: string | null;
  pickup_datetime: string | null;
  agreed_return_datetime: string | null;
  resolvedAcceptedPickupIso: string | null;
};

/** Wizard progression: bilateral agreement confirmed on the rental row. */
export function isAgreementConfirmedOnRental(rental: RentalWizardRentalRow): boolean {
  if (rental.agreement_status !== 'confirmed') return false;
  return !String(rental.last_proposed_by ?? '').trim();
}

/** Wizard progression: canonical accepted pickup time (agreed column only). */
export function hasCanonicalAgreedPickupDatetime(rental: RentalWizardRentalRow): boolean {
  const v = rental.agreed_pickup_datetime?.trim();
  if (!v) return false;
  return Number.isFinite(Date.parse(v));
}

/** Wizard progression: canonical accepted handoff location. */
export function hasCanonicalMeetupLocation(rental: RentalWizardRentalRow): boolean {
  return Boolean(rental.meetup_location?.trim());
}

export function diagnosePickupCoordination(ctx: RentalWizardContext): PickupCoordinationDiagnostic {
  const { meetingCompleted, hasPendingProposal, agreementStatus } = buildRentalWizardContextFlags(
    ctx.rental
  );
  const reasons: string[] = [];

  if (!isAgreementConfirmedOnRental(ctx.rental)) {
    if (ctx.rental.agreement_status !== 'confirmed') {
      reasons.push(
        `agreement_status not confirmed (is "${String(ctx.rental.agreement_status ?? 'null')}")`
      );
    }
    if (String(ctx.rental.last_proposed_by ?? '').trim()) {
      reasons.push(`last_proposed_by still set (${ctx.rental.last_proposed_by})`);
    }
  }

  if (!hasCanonicalAgreedPickupDatetime(ctx.rental)) {
    reasons.push('agreed_pickup_datetime missing or invalid on rental row');
  }

  if (!hasCanonicalMeetupLocation(ctx.rental)) {
    reasons.push('meetup_location missing on rental row');
  }

  if (meetingCompleted === false && reasons.length === 0) {
    reasons.push(
      `meetingCompleted false (agreementStatus=${agreementStatus}, hasPendingProposal=${hasPendingProposal})`
    );
  }

  const complete =
    isAgreementConfirmedOnRental(ctx.rental) &&
    hasCanonicalAgreedPickupDatetime(ctx.rental) &&
    hasCanonicalMeetupLocation(ctx.rental);

  return {
    complete,
    reasons,
    rentalId: ctx.rentalId,
    agreement_status: ctx.rental.agreement_status ?? null,
    last_proposed_by: ctx.rental.last_proposed_by ?? null,
    meetingCompleted,
    hasPendingProposal,
    meetup_location: ctx.rental.meetup_location ?? null,
    agreed_pickup_datetime: ctx.rental.agreed_pickup_datetime ?? null,
    meetup_time: ctx.rental.meetup_time ?? null,
    pickup_datetime: ctx.rental.pickup_datetime ?? null,
    agreed_return_datetime: ctx.rental.agreed_return_datetime ?? null,
    resolvedAcceptedPickupIso: resolveAcceptedRentalPickupIso(ctx.rental),
  };
}

export function isPickupCoordinationComplete(ctx: RentalWizardContext): boolean {
  return diagnosePickupCoordination(ctx).complete;
}

export function logPickupCoordinationDiagnostic(
  ctx: RentalWizardContext,
  tag: string,
  extra?: Record<string, unknown>
): PickupCoordinationDiagnostic {
  const diag = diagnosePickupCoordination(ctx);
  if (WIZARD_PICKUP_DEBUG) {
    console.log(`[rental-wizard][${tag}] pickup coordination`, {
      ...diag,
      meetup_location_resolved: resolveAcceptedMeetupLocation(ctx.rental),
      ...extra,
    });
    if (!diag.complete && diag.reasons.length > 0) {
      console.log(`[rental-wizard][${tag}] pickup incomplete because: ${diag.reasons.join('; ')}`);
    }
  }
  return diag;
}

export function logRentalRowAfterAccept(
  rental: Pick<
    RentalWizardRentalRow,
    | 'id'
    | 'agreement_status'
    | 'last_proposed_by'
    | 'meetup_location'
    | 'return_location'
    | 'agreed_pickup_datetime'
    | 'agreed_return_datetime'
    | 'meetup_time'
    | 'pickup_datetime'
    | 'return_time'
    | 'return_datetime'
    | 'owner_confirmed'
    | 'renter_confirmed'
  >,
  tag = 'acceptRentalMeetupProposal'
): void {
  if (!WIZARD_PICKUP_DEBUG) return;
  console.log(`[rental-wizard][${tag}] persisted rental row`, {
    rentalId: rental.id,
    agreement_status: rental.agreement_status ?? null,
    last_proposed_by: rental.last_proposed_by ?? null,
    meetup_location: rental.meetup_location ?? null,
    return_location: rental.return_location ?? null,
    agreed_pickup_datetime: rental.agreed_pickup_datetime ?? null,
    agreed_return_datetime: rental.agreed_return_datetime ?? null,
    meetup_time: rental.meetup_time ?? null,
    pickup_datetime: rental.pickup_datetime ?? null,
    return_time: rental.return_time ?? null,
    return_datetime: rental.return_datetime ?? null,
    owner_confirmed: rental.owner_confirmed ?? null,
    renter_confirmed: rental.renter_confirmed ?? null,
  });
}

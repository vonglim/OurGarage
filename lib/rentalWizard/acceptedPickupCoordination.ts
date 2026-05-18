import type { RentalWizardContext, RentalWizardRentalRow } from '@/lib/rentalWizard/types';
import {
  wizardHandoffFromNegotiation,
  type CoordinateReturnInheritedDefaults,
  type WizardHandoffMethod,
} from '@/lib/rentalWizard/wizardMeetupDraft';

/** Final accepted pickup time — `agreed_*` first, never request/listing hints. */
export function resolveAcceptedRentalPickupIso(rental: RentalWizardRentalRow): string | null {
  for (const k of ['agreed_pickup_datetime', 'pickup_datetime', 'meetup_time'] as const) {
    const v = rental[k];
    if (typeof v === 'string' && v.trim() !== '') {
      const t = Date.parse(v.trim());
      if (Number.isFinite(t)) return v.trim();
    }
  }
  return null;
}

/** Final accepted handoff location from bilateral pickup coordination. */
export function resolveAcceptedMeetupLocation(rental: RentalWizardRentalRow): string {
  return (rental.meetup_location ?? '').trim();
}

export type AcceptedPickupCoordination = CoordinateReturnInheritedDefaults & {
  deliveryFee: number | null;
};

/**
 * Source of truth for Screen 2 inherited state — only fields confirmed on `rentals`
 * after pickup coordination (not drafts, listing defaults, or request dates).
 */
export function buildAcceptedPickupCoordination(ctx: RentalWizardContext): AcceptedPickupCoordination {
  const method: WizardHandoffMethod = wizardHandoffFromNegotiation(ctx.agreedDeliveryMethod);
  const location = resolveAcceptedMeetupLocation(ctx.rental);
  const meetupTimeIso = resolveAcceptedRentalPickupIso(ctx.rental);
  return {
    location,
    meetupTimeIso,
    method,
    deliveryFee: ctx.agreedDeliveryFee,
  };
}

export function isAcceptedPickupCoordinationReady(accepted: AcceptedPickupCoordination): boolean {
  return accepted.location.length > 0 && Boolean(accepted.meetupTimeIso);
}

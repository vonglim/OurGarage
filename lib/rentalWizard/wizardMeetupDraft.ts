import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import { resolveRentalReturnIso } from '@/lib/rentalExtensionProposal';
import {
  resolveAcceptedMeetupLocation,
  resolveAcceptedRentalPickupIso,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
import {
  buildInheritedReturnDefaults,
  mergeReturnOntoEndDateIfNeeded,
  resolveReturnMeetupTimeIso,
} from '@/lib/rentalWizard/resolveReturnMeetupDefaults';
import type { RentalWizardContext, RentalWizardProgress } from '@/lib/rentalWizard/types';
import { formatUsd } from '@/lib/money';

export type WizardHandoffMethod = 'pickup' | 'delivery';

/** Immutable snapshot of what the viewer last submitted for a meetup phase (diff baseline). */
export type ViewerMeetupSubmissionSnapshot = {
  location: string;
  meetupTimeIso: string | null;
};

export type WizardMeetupProposalDraft = {
  method: WizardHandoffMethod;
  location: string;
  locationEditedByRenter: boolean;
  timeEditedByRenter: boolean;
  meetupTimeIso: string | null;
  /** Baseline from accepted offer / request — not mutated by UI toggles. */
  agreedMethod: WizardHandoffMethod;
  agreedDeliveryFee: number | null;
  /** Future: insurance, counter-proposal ids, AI suggestion refs. */
  extras?: Record<string, unknown>;
};

/** Pickup-agreed values Screen 2 inherits unless the renter edits them. */
export type CoordinateReturnInheritedDefaults = {
  location: string;
  meetupTimeIso: string | null;
  method: WizardHandoffMethod;
};

const DRAFT_KEY_PICKUP = 'coordinate_pickup_draft' as const;
const DRAFT_KEY_RETURN = 'coordinate_return_draft' as const;
const VIEWER_SUBMISSION_KEY_PICKUP = 'coordinate_pickup_viewer_last_submission' as const;
const VIEWER_SUBMISSION_KEY_RETURN = 'coordinate_return_viewer_last_submission' as const;

export type CoordinateMeetupPhase = 'pickup' | 'return';

export function wizardHandoffFromNegotiation(method: NegotiationDeliveryMethod): WizardHandoffMethod {
  return method === 'owner_delivery' ? 'delivery' : 'pickup';
}

export function parseHandoffPreference(pref: string | null | undefined): WizardHandoffMethod {
  const p = String(pref ?? '').toLowerCase();
  if (p.includes('deliver')) return 'delivery';
  return 'pickup';
}

function isoEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const as = typeof a === 'string' ? a.trim() : '';
  const bs = typeof b === 'string' ? b.trim() : '';
  if (!as && !bs) return true;
  const ta = Date.parse(as);
  const tb = Date.parse(bs);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb;
  return as === bs;
}

function normalizeDraft(partial: Partial<WizardMeetupProposalDraft>): WizardMeetupProposalDraft {
  return {
    method: partial.method === 'delivery' ? 'delivery' : 'pickup',
    location: String(partial.location ?? '').trim(),
    locationEditedByRenter: Boolean(partial.locationEditedByRenter),
    timeEditedByRenter: Boolean(partial.timeEditedByRenter),
    meetupTimeIso:
      typeof partial.meetupTimeIso === 'string' && partial.meetupTimeIso.trim()
        ? partial.meetupTimeIso.trim()
        : null,
    agreedMethod: partial.agreedMethod === 'delivery' ? 'delivery' : 'pickup',
    agreedDeliveryFee:
      typeof partial.agreedDeliveryFee === 'number' && Number.isFinite(partial.agreedDeliveryFee)
        ? Math.max(0, partial.agreedDeliveryFee)
        : null,
    extras:
      partial.extras && typeof partial.extras === 'object' && !Array.isArray(partial.extras)
        ? { ...partial.extras }
        : undefined,
  };
}

export function readCoordinatePickupDraft(progress: RentalWizardProgress): WizardMeetupProposalDraft | null {
  const raw = progress[DRAFT_KEY_PICKUP];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return normalizeDraft(raw as Partial<WizardMeetupProposalDraft>);
}

export function readCoordinateReturnDraft(progress: RentalWizardProgress): WizardMeetupProposalDraft | null {
  const raw = progress[DRAFT_KEY_RETURN];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return normalizeDraft(raw as Partial<WizardMeetupProposalDraft>);
}

export function buildDefaultCoordinatePickupDraft(ctx: RentalWizardContext): WizardMeetupProposalDraft {
  const agreedMethod = wizardHandoffFromNegotiation(ctx.agreedDeliveryMethod);
  const location =
    resolveAcceptedMeetupLocation(ctx.rental) || (ctx.rental.return_location ?? '').trim();
  const meetupTimeIso = resolveAcceptedRentalPickupIso(ctx.rental);
  return {
    method: agreedMethod,
    location,
    locationEditedByRenter: false,
    timeEditedByRenter: false,
    meetupTimeIso,
    agreedMethod,
    agreedDeliveryFee: ctx.agreedDeliveryFee,
  };
}

export { buildInheritedReturnDefaults } from '@/lib/rentalWizard/resolveReturnMeetupDefaults';

export function buildDefaultCoordinateReturnDraft(ctx: RentalWizardContext): WizardMeetupProposalDraft {
  const inherited = buildInheritedReturnDefaults(ctx);
  return {
    method: inherited.method,
    location: inherited.location,
    locationEditedByRenter: false,
    timeEditedByRenter: false,
    meetupTimeIso: inherited.meetupTimeIso,
    agreedMethod: inherited.method,
    agreedDeliveryFee: ctx.agreedDeliveryFee,
  };
}

/** True when draft differs from pickup-agreed inherited defaults. */
export function hasCoordinateReturnChangesFromPickup(
  draft: WizardMeetupProposalDraft,
  inherited: CoordinateReturnInheritedDefaults
): boolean {
  if (draft.location.trim() !== inherited.location.trim()) return true;
  if (!isoEqual(draft.meetupTimeIso, inherited.meetupTimeIso)) return true;
  return false;
}

function draftMatchesAgreedReturnOnRental(ctx: RentalWizardContext, draft: WizardMeetupProposalDraft): boolean {
  const agreedTime = resolveRentalReturnIso(ctx.rental);
  const agreedLoc = (ctx.rental.return_location ?? '').trim();
  if (!agreedTime || !agreedLoc) return false;
  return isoEqual(draft.meetupTimeIso, agreedTime) && draft.location.trim() === agreedLoc;
}

/**
 * Powers return-step CTA + notifications:
 * - false → confirm inherited/mirrored return (no owner proposal)
 * - true → propose changes to owner
 */
export function hasReturnChanges(
  draft: WizardMeetupProposalDraft,
  ctx: RentalWizardContext,
  inherited: CoordinateReturnInheritedDefaults = buildInheritedReturnDefaults(ctx)
): boolean {
  const editedFromPickup = hasCoordinateReturnChangesFromPickup(draft, inherited);
  if (!editedFromPickup) return false;
  if (
    ctx.returnCoordinationAgreed &&
    !ctx.hasPendingProposal &&
    draftMatchesAgreedReturnOnRental(ctx, draft)
  ) {
    return false;
  }
  return true;
}

export function mergeCoordinatePickupDraft(
  ctx: RentalWizardContext,
  stored: WizardMeetupProposalDraft | null
): WizardMeetupProposalDraft {
  const defaults = buildDefaultCoordinatePickupDraft(ctx);
  if (ctx.pickupCoordinationComplete && ctx.hasPendingProposal === false) {
    return defaults;
  }
  if (!stored) return defaults;
  return {
    ...defaults,
    ...stored,
    location: stored.location.trim() || defaults.location,
    agreedMethod: defaults.agreedMethod,
    agreedDeliveryFee: defaults.agreedDeliveryFee,
  };
}

export function mergeCoordinateReturnDraft(
  ctx: RentalWizardContext,
  stored: WizardMeetupProposalDraft | null
): WizardMeetupProposalDraft {
  const defaults = buildDefaultCoordinateReturnDraft(ctx);
  const inherited = buildInheritedReturnDefaults(ctx);
  if (!stored) return defaults;

  const renterEdited = stored.locationEditedByRenter || stored.timeEditedByRenter;

  if (!renterEdited) {
    return defaults;
  }

  return {
    ...defaults,
    location: stored.locationEditedByRenter
      ? stored.location.trim() || inherited.location
      : inherited.location,
    meetupTimeIso: stored.timeEditedByRenter
      ? stored.meetupTimeIso ?? inherited.meetupTimeIso
      : inherited.meetupTimeIso,
    locationEditedByRenter: stored.locationEditedByRenter,
    timeEditedByRenter: stored.timeEditedByRenter,
    method: defaults.agreedMethod,
    agreedMethod: defaults.agreedMethod,
    agreedDeliveryFee: defaults.agreedDeliveryFee,
  };
}

export function coordinatePickupDraftProgressPatch(
  draft: WizardMeetupProposalDraft
): Partial<RentalWizardProgress> {
  return { [DRAFT_KEY_PICKUP]: draft };
}

export function coordinateReturnDraftProgressPatch(
  draft: WizardMeetupProposalDraft
): Partial<RentalWizardProgress> {
  return { [DRAFT_KEY_RETURN]: draft };
}

export function readViewerLastMeetupSubmission(
  progress: RentalWizardProgress,
  phase: CoordinateMeetupPhase
): ViewerMeetupSubmissionSnapshot | null {
  const raw =
    phase === 'pickup'
      ? progress[VIEWER_SUBMISSION_KEY_PICKUP]
      : progress[VIEWER_SUBMISSION_KEY_RETURN];
  if (!raw) return null;
  const location = String(raw.location ?? '').trim();
  const meetupTimeIso =
    typeof raw.meetupTimeIso === 'string' && raw.meetupTimeIso.trim()
      ? raw.meetupTimeIso.trim()
      : null;
  if (!location && !meetupTimeIso) return null;
  return { location, meetupTimeIso };
}

export function viewerLastMeetupSubmissionPatch(
  phase: CoordinateMeetupPhase,
  snapshot: ViewerMeetupSubmissionSnapshot
): Partial<RentalWizardProgress> {
  const normalized: ViewerMeetupSubmissionSnapshot = {
    location: snapshot.location.trim(),
    meetupTimeIso:
      typeof snapshot.meetupTimeIso === 'string' && snapshot.meetupTimeIso.trim()
        ? snapshot.meetupTimeIso.trim()
        : null,
  };
  return phase === 'pickup'
    ? { [VIEWER_SUBMISSION_KEY_PICKUP]: normalized }
    : { [VIEWER_SUBMISSION_KEY_RETURN]: normalized };
}

export function snapshotFromMeetupDraft(
  draft: WizardMeetupProposalDraft
): ViewerMeetupSubmissionSnapshot {
  return {
    location: draft.location.trim(),
    meetupTimeIso: draft.meetupTimeIso,
  };
}

export function isCoordinateDraftValid(draft: WizardMeetupProposalDraft): boolean {
  return draft.location.trim().length > 0 && Boolean(draft.meetupTimeIso);
}

/** @deprecated Use isCoordinateDraftValid */
export const isCoordinatePickupDraftValid = isCoordinateDraftValid;

export function resolveProposalReturnIsoForPickup(
  ctx: RentalWizardContext,
  pickupIso: string
): string {
  const canonical = resolveReturnMeetupTimeIso(ctx);
  if (canonical.iso) return canonical.iso;
  const fromRental = resolveRentalReturnIso(ctx.rental);
  if (fromRental) return fromRental;
  if (ctx.scheduleHints.returnIso) return ctx.scheduleHints.returnIso;
  return mergeReturnOntoEndDateIfNeeded(ctx, pickupIso);
}

export function locationCardTitleForDraft(
  draft: WizardMeetupProposalDraft,
  phase: 'pickup' | 'return' = 'pickup'
): string {
  if (draft.locationEditedByRenter) {
    return phase === 'return' ? 'Your return location' : 'Your proposed location';
  }
  return phase === 'return' ? "Owner's proposed return location" : "Owner's proposed location";
}

export function returnLocationCardTitle(
  draft: WizardMeetupProposalDraft,
  hasChanges: boolean
): string {
  if (hasChanges || draft.locationEditedByRenter) return 'Your return location';
  return 'Return location';
}

export function returnTimeCardTitle(hasChanges: boolean): string {
  return hasChanges ? 'Your return time' : 'Return time';
}

export function agreedMethodLabel(
  method: WizardHandoffMethod,
  deliveryFee: number | null
): string {
  if (method === 'delivery') {
    return deliveryFee != null && deliveryFee > 0 ? `Delivery · ${formatUsd(deliveryFee)}` : 'Delivery';
  }
  return 'Pickup';
}

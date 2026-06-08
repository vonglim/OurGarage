import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { formatOwnerShortLabel } from '@/lib/rentalWizard/formatRentalConfirmedSummary';
import {
  resolveAcceptedMeetupLocation,
  resolveAcceptedRentalPickupIso,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
import { resolveRentalReturnIso } from '@/lib/rentalExtensionProposal';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export function formatPromptMeetupDateTime(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} • ${time}`;
}

/** Short renter label for owner-facing coordination copy, e.g. "Alex R." */
function formatRenterShortLabel(displayName: string): string {
  const n = displayName.trim();
  if (!n || n === PROFILE_NAME_FALLBACK) return 'The renter';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const lastInitial = parts[parts.length - 1]![0]?.toUpperCase();
    if (lastInitial) return `${first} ${lastInitial}.`;
  }
  return n;
}

export type MeetupCoordinationAcceptedPromptContent = {
  headline: string;
  body: string;
  detailLines: string[];
  primaryLabel: string;
};

export type PickupCoordinationAcceptedPromptContent = MeetupCoordinationAcceptedPromptContent;
export type ReturnCoordinationAcceptedPromptContent = MeetupCoordinationAcceptedPromptContent;

export function buildPickupCoordinationAcceptedPromptContent(
  ctx: RentalWizardContext
): PickupCoordinationAcceptedPromptContent {
  const pickupIso = resolveAcceptedRentalPickupIso(ctx.rental);
  const location = resolveAcceptedMeetupLocation(ctx.rental);
  const scheduleLine = formatPromptMeetupDateTime(pickupIso);

  const detailLines: string[] = [];
  if (scheduleLine) detailLines.push(scheduleLine);
  if (location) detailLines.push(location);

  if (ctx.viewerRole === 'owner') {
    const renterShort = formatRenterShortLabel(ctx.counterpartyDisplayName);
    const renterApproved =
      renterShort === 'The renter'
        ? 'The renter approved the pickup location and handoff time.'
        : `${renterShort} approved the pickup location and handoff time.`;
    return {
      headline: 'Pickup details confirmed',
      body: renterApproved,
      detailLines,
      primaryLabel: 'Continue to return details',
    };
  }

  const ownerShort = formatOwnerShortLabel(ctx.ownerDisplayName);
  return {
    headline: 'Pickup details confirmed',
    body: `${ownerShort} approved the pickup location and handoff time.`,
    detailLines,
    primaryLabel: 'Continue',
  };
}

export function buildReturnCoordinationAcceptedPromptContent(
  ctx: RentalWizardContext
): ReturnCoordinationAcceptedPromptContent {
  const returnIso = resolveRentalReturnIso(ctx.rental) ?? ctx.returnIso;
  const location = (ctx.rental.return_location ?? ctx.rental.meetup_location ?? '').trim();
  const scheduleLine = formatPromptMeetupDateTime(returnIso);

  const detailLines: string[] = [];
  if (scheduleLine) detailLines.push(scheduleLine);
  if (location) detailLines.push(location);

  if (ctx.viewerRole === 'owner') {
    const renterShort = formatRenterShortLabel(ctx.counterpartyDisplayName);
    const renterApproved =
      renterShort === 'The renter'
        ? 'The renter approved the return location and return time.'
        : `${renterShort} approved the return location and return time.`;
    return {
      headline: 'Return details confirmed',
      body: renterApproved,
      detailLines,
      primaryLabel: 'Continue',
    };
  }

  const ownerShort = formatOwnerShortLabel(ctx.ownerDisplayName);
  return {
    headline: 'Return details confirmed',
    body: `${ownerShort} approved the return location and return time.`,
    detailLines,
    primaryLabel: 'Continue',
  };
}

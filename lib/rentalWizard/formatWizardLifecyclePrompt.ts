import { formatOwnerShortLabel } from '@/lib/rentalWizard/formatRentalConfirmedSummary';
import {
  resolveAcceptedMeetupLocation,
  resolveAcceptedRentalPickupIso,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
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

export type PickupCoordinationAcceptedPromptContent = {
  headline: string;
  body: string;
  detailLines: string[];
};

export function buildPickupCoordinationAcceptedPromptContent(
  ctx: RentalWizardContext
): PickupCoordinationAcceptedPromptContent {
  const ownerShort = formatOwnerShortLabel(ctx.ownerDisplayName);
  const pickupIso = resolveAcceptedRentalPickupIso(ctx.rental);
  const location = resolveAcceptedMeetupLocation(ctx.rental);
  const scheduleLine = formatPromptMeetupDateTime(pickupIso);

  const detailLines: string[] = [];
  if (scheduleLine) detailLines.push(scheduleLine);
  if (location) detailLines.push(location);

  return {
    headline: 'Pickup details confirmed',
    body: `${ownerShort} approved the meetup location and pickup time.`,
    detailLines,
  };
}

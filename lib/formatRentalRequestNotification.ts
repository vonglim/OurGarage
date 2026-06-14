import { formatIsoDateMedium } from '@/lib/listingAvailabilityDates';
import type { PendingListingRentalRow } from '@/lib/fetchPendingRentalRequestsForOwner';
import { getRemoteDisplayNameForUserId } from '@/lib/remoteProfileCache';
import type { AppNotification } from '@/store/notificationsStore';

function durationLabel(durationType: string | null | undefined): string {
  switch (durationType?.trim().toLowerCase()) {
    case 'half':
      return 'Half day';
    case 'full':
      return 'Full day';
    case 'week':
      return 'Weekly';
    case 'multi_day':
      return 'Multi-day';
    default:
      return durationType?.trim() || 'Rental';
  }
}

export function formatRentalRequestDateLine(input: {
  requestedStartDate?: string | null;
  requestedEndDate?: string | null;
  durationType?: string | null;
}): string {
  const start = input.requestedStartDate?.trim();
  const end = input.requestedEndDate?.trim();
  if (start && end) return `${formatIsoDateMedium(start)} – ${formatIsoDateMedium(end)}`;
  if (start) return formatIsoDateMedium(start);
  return durationLabel(input.durationType);
}

/** Prefer pending inbox row details; fall back to notification payload / server copy. */
export function enrichRentalRequestNotificationMessage(
  notification: AppNotification,
  pendingRow?: PendingListingRentalRow | null
): { headline: string; detail: string; action: string } {
  if (pendingRow) {
    const renterName = getRemoteDisplayNameForUserId(pendingRow.renter_user_id) ?? 'Renter';
    const title =
      pendingRow.listing_snapshot?.title?.trim() ||
      pendingRow.listings?.title?.trim() ||
      'Your listing';
    return {
      headline: `${renterName} requested ${title}`,
      detail: formatRentalRequestDateLine({
        requestedStartDate: pendingRow.requested_start_date,
        requestedEndDate: pendingRow.requested_end_date,
        durationType: pendingRow.duration_type,
      }),
      action: 'Review and approve or decline this request.',
    };
  }

  const lines = notification.message.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return {
      headline: lines[0] ?? 'New rental request',
      detail: lines[1] ?? '',
      action: lines[2] ?? 'Review and approve or decline this request.',
    };
  }

  return {
    headline: lines[0] ?? 'New rental request',
    detail: '',
    action: 'Review and approve or decline this request.',
  };
}

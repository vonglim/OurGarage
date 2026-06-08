import type { UnifiedRentalRow } from '@/lib/fetchUnifiedRentalsForUser';
import {
  estimateCanonicalPhaseFromRentalRow,
  type RentalRowLifecycleEstimateInput,
} from '@/lib/rentalLifecycle/estimatePhaseFromRentalRow';
import type { CanonicalRentalPhase } from '@/lib/rentalLifecycle/canonicalPhases';
import { canonicalPhaseFromWizardStep } from '@/lib/rentalLifecycle/canonicalPhases';
import type { RentalWizardStep } from '@/lib/rentalWizard/types';

export type RentalCardStatusBadge = {
  label: string;
  tone: 'default' | 'warning' | 'danger' | 'muted';
};

const BADGE_BY_PHASE: Record<CanonicalRentalPhase, RentalCardStatusBadge> = {
  request_pending: { label: 'Request pending', tone: 'default' },
  approved: { label: 'Awaiting confirmation', tone: 'default' },
  rental_confirmed_transition: { label: 'Rental confirmed', tone: 'default' },
  coordinate_pickup: { label: 'Coordinate pickup', tone: 'default' },
  pickup_confirmed_transition: { label: 'Pickup confirmed', tone: 'default' },
  coordinate_return: { label: 'Coordinate return', tone: 'default' },
  all_set_transition: { label: 'All set', tone: 'default' },
  prepare_pickup: { label: 'Prepare for pickup', tone: 'default' },
  meetup_day: { label: 'Meetup day', tone: 'default' },
  pickup_confirmed: { label: 'Pickup confirmed', tone: 'default' },
  active_rental: { label: 'Active', tone: 'default' },
  return_pending: { label: 'Return pending', tone: 'warning' },
  review_pending: { label: 'Leave review', tone: 'default' },
  completed: { label: 'Completed', tone: 'default' },
  cancellation_requested: { label: 'Cancellation requested', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

const CTA_BY_PHASE: Partial<Record<CanonicalRentalPhase, string>> = {
  coordinate_pickup: 'Coordinate pickup',
  pickup_confirmed_transition: 'Continue',
  coordinate_return: 'Coordinate return',
  all_set_transition: 'Continue',
  prepare_pickup: 'Prepare for pickup',
  meetup_day: 'Meetup day',
  pickup_confirmed: 'Review rental agreement',
  active_rental: 'Enjoy your rental',
  return_pending: 'Prepare for return',
  review_pending: 'Leave review',
  completed: 'Leave review',
  cancellation_requested: 'Continue',
};

export function resolveRentalCardStatusBadgeFromPhase(
  phase: CanonicalRentalPhase,
  row: RentalRowLifecycleEstimateInput,
  viewerUserId: string
): RentalCardStatusBadge {
  const base = BADGE_BY_PHASE[phase];
  if (phase === 'approved' || phase === 'coordinate_pickup' || phase === 'coordinate_return') {
    const agreementStatus = String(row.agreement_status ?? '').trim().toLowerCase();
    const allConfirmed = row.owner_confirmed === true && row.renter_confirmed === true;
    const me = viewerUserId.trim();
    const lastProposer = String(row.last_proposed_by ?? '').trim();
    if (agreementStatus === 'pending' || !allConfirmed) {
      if (me && lastProposer && lastProposer === me) {
        return { label: 'Awaiting response', tone: 'default' };
      }
      if (me && lastProposer && lastProposer !== me) {
        return { label: 'Respond to proposal', tone: 'warning' };
      }
    }
  }
  return base;
}

export function resolveRentalCardStatusBadge(
  row: UnifiedRentalRow,
  _role: 'renting' | 'listing',
  viewerUserId: string
): RentalCardStatusBadge {
  const phase = estimateCanonicalPhaseFromRentalRow(row);
  return resolveRentalCardStatusBadgeFromPhase(phase, row, viewerUserId);
}

export function estimateActivityCtaFromRentalRow(
  row: RentalRowLifecycleEstimateInput
): string | null {
  const phase = estimateCanonicalPhaseFromRentalRow(row);
  if (phase === 'cancelled') return null;
  return CTA_BY_PHASE[phase] ?? 'Continue';
}

export function estimateActivityCtaFromWizardStep(step: RentalWizardStep): string | null {
  const phase = canonicalPhaseFromWizardStep(step);
  if (phase === 'cancelled') return null;
  return CTA_BY_PHASE[phase] ?? 'Continue';
}

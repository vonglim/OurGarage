import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import type { RentalVerificationRow } from '@/lib/rentalVerification';
import type { WizardMeetupProposalDraft } from '@/lib/rentalWizard/wizardMeetupDraft';

export type RentalWizardStep =
  | 'cancelled'
  | 'transition_rental_confirmed'
  | 'coordinate_pickup'
  | 'transition_pickup_confirmed'
  | 'coordinate_return'
  | 'transition_all_set'
  | 'prepare_pickup'
  | 'transition_pickup_ready'
  | 'meetup_day'
  | 'owner_confirmed_arrival'
  | 'equipment_confirmation'
  | 'transition_enjoy_rental'
  | 'active_rental'
  | 'transition_return_reminder'
  | 'prepare_return'
  | 'owner_notified'
  | 'return_handoff'
  | 'transition_return_complete'
  | 'leave_review';

export type RentalWizardTransitionKey =
  | 'rental_confirmed_seen'
  | 'pickup_confirmed_seen'
  | 'return_confirmed_seen'
  | 'all_set_seen'
  | 'pickup_ready_seen'
  | 'enjoy_rental_seen'
  | 'return_reminder_seen'
  | 'return_complete_seen';

export type RentalWizardProgress = {
  renter_pickup_im_here_at?: string | null;
  renter_return_im_here_at?: string | null;
  renter_approved_pickup_photos_at?: string | null;
  equipment_ack?: Record<string, boolean>;
  coordinate_pickup_draft?: WizardMeetupProposalDraft;
  coordinate_return_draft?: WizardMeetupProposalDraft;
  /** Set when renter completes the coordinate-return step (Screen 2). */
  pickup_return_coordination_ack_at?: string | null;
};

export type RentalWizardRentalRow = {
  id: string;
  owner_user_id: string;
  renter_user_id: string;
  status: string | null;
  price: number | null;
  agreement_status?: string | null;
  owner_confirmed?: boolean | null;
  renter_confirmed?: boolean | null;
  confirmed_by_owner?: boolean | null;
  confirmed_by_renter?: boolean | null;
  pickup_datetime?: string | null;
  return_datetime?: string | null;
  meetup_time?: string | null;
  return_time?: string | null;
  meetup_location?: string | null;
  return_location?: string | null;
  agreed_pickup_datetime?: string | null;
  agreed_return_datetime?: string | null;
  last_proposed_by?: string | null;
  handoff_approval_started_at?: string | null;
  handoff_approved_by_owner?: boolean | null;
  handoff_approved_by_renter?: boolean | null;
  signed_at?: string | null;
  signed_name?: string | null;
  owner_pickup_ready?: boolean | null;
  renter_pickup_ready?: boolean | null;
  pickup_operational_state?: string | null;
  return_operational_state?: string | null;
  offer_id?: string | null;
  request_id?: string | null;
  listing_id?: string | null;
  rental_request_id?: string | null;
  proposal_version?: number | null;
  proposal_updated_at?: string | null;
  latest_proposal_message_id?: string | null;
  cancellation_status?: string | null;
  cancellation_requested_by?: string | null;
  cancellation_requested_at?: string | null;
  cancellation_reason?: string | null;
  cancellation_resolved_at?: string | null;
  cancellation_resolved_by?: string | null;
};

export type RentalWizardContext = {
  rentalId: string;
  viewerUserId: string;
  viewerRole: 'renter';
  rental: RentalWizardRentalRow;
  displayTitle: string;
  ownerDisplayName: string;
  heroImageUrl: string | null;
  listingSnapshot: ListingIntentSnapshot | null;
  agreedDeliveryMethod: NegotiationDeliveryMethod;
  agreedDeliveryFee: number | null;
  scheduleHints: {
    rentalStartDate: string | null;
    rentalEndDate: string | null;
    returnIso: string | null;
  };
  requestSchedulingMeta: unknown;
  rentalCodeLabel: string;
  lifecyclePhase: 'pickup' | 'active' | 'return' | 'completed';
  termsCompleted: boolean;
  meetingCompleted: boolean;
  hasPendingProposal: boolean;
  pickupHandoffComplete: boolean;
  returnHandoffComplete: boolean;
  pickupAck: { owner: boolean; renter: boolean };
  returnAck: { owner: boolean; renter: boolean };
  ownerPickupPhotoCount: number;
  pickupIso: string | null;
  returnIso: string | null;
  seenTransitions: Set<RentalWizardTransitionKey>;
  wizardProgress: RentalWizardProgress;
  verificationRows: RentalVerificationRow[];
};

export type RentalWizardDestination = {
  step: RentalWizardStep;
  ctaLabel: string;
  path: string;
};

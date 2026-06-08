import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';
import type { PickupEvidenceReadiness } from '@/lib/pickupEvidenceReadiness';
import type { CanonicalMeetupCoordinationState } from '@/lib/canonicalMeetupCoordination';
import type { RentalVerificationRow } from '@/lib/rentalVerification';
import type { WizardMeetupProposalDraft, ViewerMeetupSubmissionSnapshot } from '@/lib/rentalWizard/wizardMeetupDraft';

export type RentalWizardStep =
  | 'cancelled'
  | 'transition_rental_confirmed'
  | 'coordinate_pickup'
  | 'transition_pickup_confirmed'
  | 'coordinate_return'
  | 'transition_return_confirmed'
  | 'transition_all_set'
  | 'prepare_pickup'
  | 'transition_pickup_ready'
  | 'meetup_day'
  | 'owner_confirmed_arrival'
  | 'equipment_confirmation'
  | 'rental_authorization'
  | 'rental_agreement_intro'
  | 'transition_agreement_reviewed'
  | 'transition_disclosures_complete'
  | 'transition_hold_authorized'
  | 'transition_agreement_signed'
  | 'transition_rental_activated'
  | 'rental_agreement'
  | 'liability_disclosures'
  | 'security_hold_authorization'
  | 'digital_signature'
  | 'rental_activation'
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
  | 'return_complete_seen'
  | 'agreement_signed_seen'
  | 'agreement_reviewed_seen'
  | 'disclosures_complete_seen'
  | 'hold_authorized_seen'
  | 'rental_activated_auth_seen';

export type RentalWizardProgress = {
  renter_pickup_im_here_at?: string | null;
  renter_return_im_here_at?: string | null;
  renter_approved_pickup_photos_at?: string | null;
  renter_confirmed_pickup_receipt_at?: string | null;
  renter_viewed_timestamp_proof_at?: string | null;
  /** Set when renter opens the pickup evidence review surface (required before approve). */
  renter_pickup_evidence_review_opened_at?: string | null;
  /** Fingerprint of owner pickup evidence when renter last opened review — invalidates review on change. */
  renter_pickup_evidence_seen_revision?: string | null;
  equipment_ack?: Record<string, boolean>;
  coordinate_pickup_draft?: WizardMeetupProposalDraft;
  coordinate_return_draft?: WizardMeetupProposalDraft;
  /** Last meetup values this viewer submitted — diff baseline during counterparty review. */
  coordinate_pickup_viewer_last_submission?: ViewerMeetupSubmissionSnapshot;
  coordinate_return_viewer_last_submission?: ViewerMeetupSubmissionSnapshot;
  /** Set when renter completes the coordinate-return step (Screen 2). */
  pickup_return_coordination_ack_at?: string | null;
  /** Renter reviewed and acknowledged liability / rental agreement text. */
  rental_agreement_acknowledged_at?: string | null;
  equipment_condition_acknowledged_at?: string | null;
  liability_disclosure_acknowledged_at?: string | null;
  late_fee_policy_acknowledged_at?: string | null;
  protection_declined_acknowledged_at?: string | null;
  /** Initials entered for high-risk / inherent-risk disclosure acknowledgment. */
  liability_risk_initials?: string | null;
  rental_agreement_intro_seen_at?: string | null;
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
  owner_arrived_at?: string | null;
  renter_arrived_at?: string | null;
  renter_confirmed_receipt_at?: string | null;
  owner_confirmed_handoff_at?: string | null;
  possession_transferred_at?: string | null;
  pickup_handoff_completed_at?: string | null;
  physical_possession_confirmed_at?: string | null;
  rental_activated_at?: string | null;
  agreement_acknowledged_at?: string | null;
  signed_agreement_version?: number | null;
  signed_liability_disclosure_version?: number | null;
  signed_agreement_user_id?: string | null;
  equipment_condition_acknowledged_at?: string | null;
  liability_disclosure_acknowledged_at?: string | null;
  late_fee_policy_acknowledged_at?: string | null;
  protection_declined_acknowledged_at?: string | null;
  protection_coverage_acknowledged?: boolean | null;
  preauth_status?: string | null;
  preauth_amount?: number | null;
  preauth_authorized_at?: string | null;
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
  viewerRole: 'renter' | 'owner';
  /** Counterparty display name (renter name on owner wizard, owner name on renter wizard). */
  counterpartyDisplayName: string;
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
  /** Bilateral pickup + return agreed (canonical progression). */
  meetingCompleted: boolean;
  /** `agreement_status` confirmed with no pending proposal (pickup slice may be done). */
  meetingAgreementCleared: boolean;
  pickupCoordinationComplete: boolean;
  returnCoordinationAgreed: boolean;
  meetupCoordinationComplete: boolean;
  hasPendingProposal: boolean;
  pickupHandoffComplete: boolean;
  returnHandoffComplete: boolean;
  pickupAck: { owner: boolean; renter: boolean };
  returnAck: { owner: boolean; renter: boolean };
  ownerPickupPhotoCount: number;
  ownerPickupEvidence: PickupEvidencePhoto[];
  pickupEvidenceReadiness: PickupEvidenceReadiness;
  pickupIso: string | null;
  returnIso: string | null;
  /** Canonical meetup coordination — single source for wizard meetup UI. */
  meetupCoordination: CanonicalMeetupCoordinationState;
  seenTransitions: Set<RentalWizardTransitionKey>;
  wizardProgress: RentalWizardProgress;
  verificationRows: RentalVerificationRow[];
  /** True when migrations 071–073 columns are absent from the rental row payload. */
  schemaDegraded?: boolean;
  missingActivationColumns?: string[];
};

export type RentalWizardDestination = {
  step: RentalWizardStep;
  ctaLabel: string;
  path: string;
};

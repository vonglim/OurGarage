export type RentalCancellationStatus = 'none' | 'requested' | 'declined' | 'cancelled';

export type RentalCancellationReasonKey =
  | 'change_of_plans'
  | 'found_another'
  | 'scheduling_conflict'
  | 'item_unavailable'
  | 'safety'
  | 'other';

export const RENTAL_CANCELLATION_REASONS: {
  key: RentalCancellationReasonKey;
  label: string;
}[] = [
  { key: 'change_of_plans', label: 'Change of plans' },
  { key: 'found_another', label: 'Found another item' },
  { key: 'scheduling_conflict', label: 'Scheduling conflict' },
  { key: 'item_unavailable', label: 'Item unavailable' },
  { key: 'safety', label: 'Safety concern' },
  { key: 'other', label: 'Other' },
];

export type RentalCancellationFields = {
  cancellation_status?: RentalCancellationStatus | string | null;
  cancellation_requested_by?: string | null;
  cancellation_requested_at?: string | null;
  cancellation_reason?: string | null;
  cancellation_resolved_at?: string | null;
  cancellation_resolved_by?: string | null;
  status?: string | null;
  agreed_pickup_datetime?: string | null;
  pickup_datetime?: string | null;
  meetup_time?: string | null;
  signed_at?: string | null;
  handoff_approved_by_owner?: boolean | null;
  handoff_approved_by_renter?: boolean | null;
  owner_user_id?: string | null;
  renter_user_id?: string | null;
  owner_confirmed?: boolean | null;
  renter_confirmed?: boolean | null;
};

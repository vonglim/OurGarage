-- Marketplace-grade rental authorization: agreement versions, disclosure acks, audit fields.

alter table public.rentals
  add column if not exists signed_agreement_version int null,
  add column if not exists signed_liability_disclosure_version int null,
  add column if not exists signed_agreement_user_id uuid null references auth.users(id),
  add column if not exists equipment_condition_acknowledged_at timestamptz null,
  add column if not exists liability_disclosure_acknowledged_at timestamptz null,
  add column if not exists late_fee_policy_acknowledged_at timestamptz null,
  add column if not exists protection_declined_acknowledged_at timestamptz null,
  add column if not exists protection_coverage_acknowledged boolean null default false;

comment on column public.rentals.signed_agreement_version is
  'Agreement template version at digital signature.';
comment on column public.rentals.signed_liability_disclosure_version is
  'Liability disclosure bundle version at signature.';
comment on column public.rentals.signed_agreement_user_id is
  'User id of renter who signed the rental agreement.';
comment on column public.rentals.equipment_condition_acknowledged_at is
  'Renter confirmed equipment condition vs inspection photos.';
comment on column public.rentals.liability_disclosure_acknowledged_at is
  'Renter accepted assumption-of-risk / liability waiver bundle.';
comment on column public.rentals.late_fee_policy_acknowledged_at is
  'Renter accepted late return fee policy.';
comment on column public.rentals.protection_declined_acknowledged_at is
  'Renter acknowledged financial responsibility when declining protection.';
comment on column public.rentals.protection_coverage_acknowledged is
  'True when renter accepted optional protection coverage disclosure.';

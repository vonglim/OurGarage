import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';
import { resolveAuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';

export type AuthorizationJourneyStepId =
  | 'intro'
  | 'agreement'
  | 'disclosures'
  | 'security_hold'
  | 'signature'
  | 'activation';

export const AUTHORIZATION_JOURNEY_STEPS: {
  id: AuthorizationJourneyStepId;
  label: string;
  wizardStep: RentalWizardStep;
}[] = [
  { id: 'intro', label: 'Overview', wizardStep: 'rental_agreement_intro' },
  { id: 'agreement', label: 'Agreement', wizardStep: 'rental_agreement' },
  { id: 'disclosures', label: 'Disclosures', wizardStep: 'liability_disclosures' },
  { id: 'security_hold', label: 'Security hold', wizardStep: 'security_hold_authorization' },
  { id: 'signature', label: 'Signature', wizardStep: 'digital_signature' },
  { id: 'activation', label: 'Activate', wizardStep: 'rental_activation' },
];

export function authorizationJourneyIndex(step: RentalWizardStep): number {
  const idx = AUTHORIZATION_JOURNEY_STEPS.findIndex((s) => s.wizardStep === step);
  return idx >= 0 ? idx : 0;
}

export function resolveAuthorizationJourneyProgress(step: RentalWizardStep): {
  current: number;
  total: number;
  fraction: number;
} {
  const current = authorizationJourneyIndex(step) + 1;
  const total = AUTHORIZATION_JOURNEY_STEPS.length;
  return { current, total, fraction: current / total };
}

export function buildEquipmentDisplay(ctx: RentalWizardContext): {
  title: string;
  category: string | null;
  ownerName: string;
  dateRange: string;
  pickupLocation: string;
  returnLocation: string;
  accessories: string;
  serialHint: string | null;
} {
  const snap = ctx.listingSnapshot;
  const category = snap?.condition_label?.trim() || null;
  const handoff = snap?.handoff_summary?.trim();
  const accessories = handoff
    ? handoff.length > 120
      ? `${handoff.slice(0, 117)}…`
      : handoff
    : 'As described in the listing and owner photos';

  const serialPhoto = ctx.ownerPickupEvidence.find(
    (p) => p.pickupPhotoCategory === 'serial'
  );

  return {
    title: ctx.displayTitle,
    category,
    ownerName: ctx.ownerDisplayName,
    dateRange: `${formatShort(ctx.pickupIso)} – ${formatShort(ctx.returnIso)}`,
    pickupLocation: formatLoc(ctx.rental.meetup_location),
    returnLocation: formatLoc(ctx.rental.return_location),
    accessories,
    serialHint: serialPhoto ? 'Serial plate shown in owner photos' : null,
  };
}

function formatShort(iso: string | null): string {
  if (!iso?.trim()) return 'TBD';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'TBD';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLoc(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t && t.length > 0 ? t : 'To be confirmed at meetup';
}

export function isAuthorizationJourneyStepComplete(
  ctx: RentalWizardContext,
  id: AuthorizationJourneyStepId
): boolean {
  const p = resolveAuthorizationProgress(ctx);
  switch (id) {
    case 'intro':
      return Boolean(ctx.wizardProgress.rental_agreement_intro_seen_at?.trim());
    case 'agreement':
      return p.rentalAgreementReviewed && p.equipmentConditionAcknowledged;
    case 'disclosures':
      return p.liabilityDisclosuresAccepted;
    case 'security_hold':
      return p.securityHoldAuthorized;
    case 'signature':
      return p.digitalSignatureComplete;
    case 'activation':
      return p.rentalActivated;
    default:
      return false;
  }
}

import type { Ionicons } from '@expo/vector-icons';
import type { RentalWizardStep, RentalWizardTransitionKey } from '@/lib/rentalWizard/types';

export type AuthorizationMilestoneConfig = {
  step: RentalWizardStep;
  seenKey: RentalWizardTransitionKey;
  gradient: readonly [string, string, string];
  icon: keyof typeof Ionicons.glyphMap;
  iconTint: string;
  headline: string;
  support: string;
  trustLines: string[];
  primaryLabel: string;
  nextStep: RentalWizardStep;
};

const SLATE_MILESTONE: readonly [string, string, string] = ['#0F172A', '#1E293B', '#334155'];
const GREEN_MILESTONE: readonly [string, string, string] = ['#064E3B', '#059669', '#34D399'];

export const AUTHORIZATION_MILESTONES: Record<string, AuthorizationMilestoneConfig> = {
  agreement_reviewed: {
    step: 'transition_agreement_reviewed',
    seenKey: 'agreement_reviewed_seen',
    gradient: SLATE_MILESTONE,
    icon: 'document-text-outline',
    iconTint: '#A5B4FC',
    headline: 'Agreement reviewed',
    support:
      'Equipment details and condition are on record. Next, a quick pass through policies — summaries only, no legal wall.',
    trustLines: [
      'Your agreement progress is securely stored',
      'Both renter and owner are protected',
    ],
    primaryLabel: 'Continue',
    nextStep: 'liability_disclosures',
  },
  disclosures_complete: {
    step: 'transition_disclosures_complete',
    seenKey: 'disclosures_complete_seen',
    gradient: SLATE_MILESTONE,
    icon: 'shield-checkmark-outline',
    iconTint: '#C7D2FE',
    headline: 'You’re covered',
    support:
      'Policies acknowledged. At pickup, you’ll authorize a temporary hold — not a charge today.',
    trustLines: [
      'Secure authorization — separate from signing',
      'No charge unless policy conditions apply',
    ],
    primaryLabel: 'Continue',
    nextStep: 'security_hold_authorization',
  },
  hold_authorized: {
    step: 'transition_hold_authorized',
    seenKey: 'hold_authorized_seen',
    gradient: SLATE_MILESTONE,
    icon: 'shield-checkmark-outline',
    iconTint: '#E0E7FF',
    headline: 'Hold authorized',
    support:
      'Your payment method is ready. One ceremonial signature left, then you can activate your rental.',
    trustLines: [
      'Temporary hold only — not an immediate charge',
      'Released when the rental closes cleanly',
    ],
    primaryLabel: 'Continue to signature',
    nextStep: 'digital_signature',
  },
  signature_complete: {
    step: 'transition_agreement_signed',
    seenKey: 'agreement_signed_seen',
    gradient: GREEN_MILESTONE,
    icon: 'create-outline',
    iconTint: '#A7F3D0',
    headline: 'Signature complete',
    support:
      'Your electronic signature is filed with a timestamp. Activate your rental when pickup inspection is finished.',
    trustLines: [
      'Agreement snapshot frozen for your records',
      'Future PDF export supported',
    ],
    primaryLabel: 'Continue',
    nextStep: 'rental_activation',
  },
  rental_activated: {
    step: 'transition_rental_activated',
    seenKey: 'rental_activated_auth_seen',
    gradient: GREEN_MILESTONE,
    icon: 'sparkles-outline',
    iconTint: '#BBF7D0',
    headline: 'Your rental is active',
    support:
      'You’re officially in your rental period. Message the owner anytime — we’ll guide you through return when it’s time.',
    trustLines: [
      'Return details are already confirmed',
      'Support is available throughout your rental',
    ],
    primaryLabel: 'Enjoy your rental',
    nextStep: 'transition_enjoy_rental',
  },
};

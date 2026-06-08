import { RENTAL_AGREEMENT_REVIEW_ACCORDION, type AgreementSectionDef } from '@/lib/rentalAuthorization/agreementSections';
import { formatWizardDateTime } from '@/lib/rentalWizard/formatWizardSchedule';

export function buildRentalAgreementReviewSections(input: {
  displayTitle: string;
  pickupIso: string | null;
  returnIso: string | null;
  /** When false, keep the static Rental Summary copy (e.g. sheet already shows dates above). */
  personalizeReturnSummary?: boolean;
}): AgreementSectionDef[] {
  if (input.personalizeReturnSummary === false) {
    return RENTAL_AGREEMENT_REVIEW_ACCORDION;
  }

  const summaryBase = RENTAL_AGREEMENT_REVIEW_ACCORDION.find((s) => s.id === 'return_expectations');
  const summarySection = summaryBase
    ? {
        ...summaryBase,
        summary: `${input.displayTitle} · ${formatWizardDateTime(input.pickupIso)} – ${formatWizardDateTime(input.returnIso)}`,
      }
    : null;

  return RENTAL_AGREEMENT_REVIEW_ACCORDION.map((section) =>
    section.id === 'return_expectations' && summarySection ? summarySection : section
  );
}

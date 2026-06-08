import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LegalAccordionSection } from '@/components/rentalAuthorization/LegalAccordionSection';
import { RentalAgreementSummaryCard } from '@/components/rentalWizard/RentalAgreementSummaryCard';
import { buildRentalAgreementReviewSections } from '@/lib/rentalAuthorization/buildRentalAgreementReviewSections';
import type { AgreementSectionDef } from '@/lib/rentalAuthorization/agreementSections';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type RentalAgreementReviewContentProps = {
  sections?: AgreementSectionDef[];
  ctx?: RentalWizardContext;
  showTrustBanner?: boolean;
  showSummaryCard?: boolean;
  hint?: string | null;
  personalizeReturnSummary?: boolean;
};

export function RentalAgreementReviewContent({
  sections: sectionsProp,
  ctx,
  showTrustBanner = true,
  showSummaryCard = false,
  hint,
  personalizeReturnSummary = true,
}: RentalAgreementReviewContentProps) {
  const sections = useMemo(() => {
    if (sectionsProp) return sectionsProp;
    if (!ctx) return [];
    return buildRentalAgreementReviewSections({
      displayTitle: ctx.displayTitle,
      pickupIso: ctx.pickupIso,
      returnIso: ctx.returnIso,
      personalizeReturnSummary,
    });
  }, [sectionsProp, ctx, personalizeReturnSummary]);

  return (
    <View style={styles.content}>
      {showSummaryCard && ctx ? <RentalAgreementSummaryCard ctx={ctx} /> : null}

      {showTrustBanner ? (
        <View style={styles.trustBanner}>
          <Text style={styles.trustTitle}>Protected rental</Text>
          <Text style={styles.trustBody}>
            Both you and the owner are covered. Your progress is stored securely.
          </Text>
        </View>
      ) : null}

      <View style={styles.accordionList}>
        {sections.map((section) => (
          <LegalAccordionSection key={section.id} section={section} />
        ))}
      </View>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  trustBanner: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
    gap: 4,
  },
  trustTitle: { fontSize: 14, fontWeight: '800', color: '#9A3412' },
  trustBody: { fontSize: 13, lineHeight: 18, color: '#C2410C' },
  accordionList: { gap: 10 },
  hint: { marginTop: 4, fontSize: 13, color: '#64748B', lineHeight: 18, textAlign: 'center' },
});

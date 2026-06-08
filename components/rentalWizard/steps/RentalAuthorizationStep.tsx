import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivationCheckpointList } from '@/components/rentalWizard/authorization/ActivationCheckpointList';
import { AuthGradientButton } from '@/components/rentalWizard/authorization/AuthGradientButton';
import { AuthorizationProgressHeader } from '@/components/rentalWizard/authorization/AuthorizationProgressHeader';
import { authPremium, authType } from '@/components/rentalWizard/authorization/authPremiumTheme';
import { WizardRentalSummaryCard } from '@/components/rentalWizard/WizardRentalSummaryCard';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import {
  wizardContentGutterStyle,
  wizardLayout,
  wizardScreenBleedStyle,
} from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';
import { buildEquipmentDisplay } from '@/lib/rentalAuthorization/authorizationJourney';
import { resolveAuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';
import { resolveAuthorizationWizardStep } from '@/lib/rentalAuthorization/resolveAuthorizationWizardStep';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { buildRentalConfirmedSummaryDisplay } from '@/lib/rentalWizard/formatRentalConfirmedSummary';
import { formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';

export function RentalAuthorizationStep() {
  const w = useRentalWizard();
  const { ctx } = w;
  const insets = useSafeAreaInsets();
  const progress = useMemo(() => resolveAuthorizationProgress(ctx), [ctx]);
  const nextStep = useMemo(() => resolveAuthorizationWizardStep(ctx), [ctx]);
  const equipment = useMemo(() => buildEquipmentDisplay(ctx), [ctx]);
  const summary = buildRentalConfirmedSummaryDisplay(ctx);
  const heroBg = authPremium.gradient.hero[0];

  const primaryLabel = progress.rentalActivated
    ? 'Rental active'
    : WIZARD_STEP_META[nextStep].continueLabel;

  return (
    <ScreenWrapper
      style={[styles.screen, wizardScreenBleedStyle, { backgroundColor: heroBg }]}
      innerStyle={styles.flex}
      edges={['top', 'left', 'right']}
    >
      <LinearGradient
        colors={[...authPremium.gradient.hero]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={[styles.heroInner, { paddingTop: Math.max(insets.top, 8) }]}>
          <AuthorizationProgressHeader ctx={ctx} activeStep="rental_authorization" variant="onDark" />
          <Text style={authType.heroHeadline}>Rental authorization</Text>
          <Text style={authType.heroSupport}>
            Guided steps to protect you and the owner before your rental begins.
          </Text>
        </View>
      </LinearGradient>

      <View style={[styles.body, wizardContentGutterStyle]}>
        <WizardRentalSummaryCard
          title={ctx.displayTitle}
          ownerLine={formatBorrowingFromOwner(ctx.ownerDisplayName)}
          rentalCode={ctx.rentalCodeLabel}
          thumbUri={ctx.heroImageUrl}
          dateRange={equipment.dateRange}
          durationDays={summary.durationDays}
          handoffTitle={formatWizardLocation(ctx.rental.meetup_location)}
          handoffSubtitle="Pickup"
          handoffIcon="location-outline"
        />
        <ActivationCheckpointList progress={progress} />
      </View>

      <View
        style={[
          styles.footer,
          wizardContentGutterStyle,
          { paddingBottom: Math.max(insets.bottom, wizardLayout.footerBottomMin) },
        ]}
      >
        <AuthGradientButton
          label={primaryLabel}
          onPress={w.openAuthorizationFlow}
          disabled={progress.rentalActivated}
          showArrow
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, backgroundColor: ui.background },
  hero: {
    borderBottomLeftRadius: authPremium.radius.hero,
    borderBottomRightRadius: authPremium.radius.hero,
    overflow: 'hidden',
  },
  heroInner: {
    ...wizardContentGutterStyle,
    paddingBottom: 24,
    gap: 12,
    alignItems: 'center',
  },
  body: {
    flex: 1,
    paddingTop: wizardLayout.scrollPaddingTop,
    gap: wizardLayout.bodyGap,
  },
  footer: {
    paddingTop: wizardLayout.footerPaddingTop,
    gap: wizardLayout.footerGap,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    backgroundColor: ui.background,
  },
});

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useGuidedRentalWizardBindings } from '@/components/rentalWizard/GuidedRentalWizardBindingsContext';
import { useCoordinationLiveBanner } from '@/components/rentalWizard/CoordinationLiveBannerContext';
import { logCoordinationBanner } from '@/lib/rentalWizard/coordinationInstrumentation';
import { proposalBannerDetails } from '@/lib/rentalWizard/coordinateProposalPresentation';
import { ui } from '@/constants/appUi';

const BANNER_SUCCESS = {
  background: '#F0FDF4',
  border: 'rgba(22, 163, 74, 0.22)',
  iconBg: '#DCFCE7',
  iconFg: '#166534',
} as const;

type WizardCoordinationLiveBannerSlotProps = {
  lane: 'pickup' | 'return';
  rentalId: string;
};

function isProposalReceivedKind(kind: string): boolean {
  return kind === 'pickup_proposal_received' || kind === 'return_proposal_received';
}

export function WizardCoordinationLiveBannerSlot({
  lane,
  rentalId,
}: WizardCoordinationLiveBannerSlotProps) {
  const liveBanner = useCoordinationLiveBanner();
  const bindings = useGuidedRentalWizardBindings();
  const banner = liveBanner?.banner;

  const details = useMemo(() => {
    if (!bindings?.ctx || !banner || banner.lane !== lane) return null;
    if (!isProposalReceivedKind(banner.kind)) return null;
    return proposalBannerDetails({ ctx: bindings.ctx, phase: lane });
  }, [banner, bindings?.ctx, lane]);

  useEffect(() => {
    if (!banner || banner.lane !== lane) return;
    logCoordinationBanner({
      event: 'rendered',
      rentalId,
      lane,
      kind: banner.kind,
      bannerShown: true,
    });
  }, [banner, lane, rentalId]);

  if (!liveBanner || !banner || banner.lane !== lane || !details) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.banner}>
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="sparkles" size={18} color={BANNER_SUCCESS.iconFg} />
          </View>
          <Text style={styles.headline}>{details.headline}</Text>
        </View>

        <Text style={styles.summaryLine}>{details.summaryLine}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  banner: {
    borderRadius: 16,
    backgroundColor: BANNER_SUCCESS.background,
    borderWidth: 1,
    borderColor: BANNER_SUCCESS.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BANNER_SUCCESS.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: ui.textPrimary,
    lineHeight: 22,
  },
  summaryLine: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 21,
  },
});

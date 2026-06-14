import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MeetupCountdownCard } from '@/components/rentalWizard/shared/MeetupCountdownCard';
import { MeetupLateExtensionSheet } from '@/components/rentalWizard/shared/MeetupLateExtensionSheet';
import { MeetupPickupProposalBanner } from '@/components/rentalWizard/shared/MeetupPickupProposalBanner';
import { buildMeetupCountdownState } from '@/lib/buildMeetupCountdownState';
import {
  canRequestMeetupDayPickupExtension,
  resolveMeetupDayPickupProposalState,
} from '@/lib/meetupDayLateExtension';
import { resolveLockedPickupSchedule } from '@/lib/rentalWizard/coordinateMeetupSchedule';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type MeetupDayScheduleSectionProps = {
  ctx: RentalWizardContext;
  proposalBusy?: boolean;
  onSubmitExtension: (newPickupIso: string) => Promise<boolean>;
  onAcceptProposal: () => Promise<boolean>;
  onDeclineProposal: () => Promise<boolean>;
};

export function MeetupDayScheduleSection({
  ctx,
  proposalBusy = false,
  onSubmitExtension,
  onAcceptProposal,
  onDeclineProposal,
}: MeetupDayScheduleSectionProps) {
  const [extensionOpen, setExtensionOpen] = useState(false);

  const proposal = useMemo(() => resolveMeetupDayPickupProposalState(ctx), [ctx]);
  const canRequestExtension = useMemo(() => canRequestMeetupDayPickupExtension(ctx), [ctx]);
  const lockedSchedule = useMemo(() => resolveLockedPickupSchedule(ctx), [ctx]);

  const countdownIso = proposal.pending
    ? proposal.acceptedPickupIso
    : proposal.acceptedPickupIso ?? ctx.pickupIso;

  const countdownPreview = useMemo(
    () =>
      buildMeetupCountdownState(countdownIso, undefined, {
        waitingForApproval: proposal.pending,
      }),
    [countdownIso, proposal.pending]
  );

  const showExtensionCta =
    canRequestExtension && countdownPreview.status === 'overdue' && !proposal.pending;

  const onSendExtension = async (iso: string) => {
    const ok = await onSubmitExtension(iso);
    if (ok) setExtensionOpen(false);
  };

  return (
    <View style={styles.stack}>
      {proposal.pending ? (
        <MeetupPickupProposalBanner
          acceptedPickupIso={proposal.acceptedPickupIso}
          pendingPickupIso={proposal.pendingPickupIso}
          viewerCanAccept={proposal.viewerCanAccept}
          viewerIsProposer={proposal.viewerIsProposer}
          busy={proposalBusy}
          onAccept={() => void onAcceptProposal()}
          onDecline={() => void onDeclineProposal()}
        />
      ) : null}
      <MeetupCountdownCard
        pickupIso={countdownIso}
        waitingForApproval={proposal.pending}
        showExtensionCta={showExtensionCta}
        onRequestExtension={() => setExtensionOpen(true)}
      />
      <MeetupLateExtensionSheet
        visible={extensionOpen}
        currentPickupIso={proposal.acceptedPickupIso}
        lockedDateYmd={lockedSchedule.dateYmd}
        busy={proposalBusy}
        onClose={() => setExtensionOpen(false)}
        onSubmit={(iso) => void onSendExtension(iso)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
});

import { useLayoutEffect, useMemo } from 'react';

import type { MeetupPhaseCoordinationLane } from '@/lib/rentalMeetupPhaseCoordinationState';
import {
  logCoordinateProposalFieldDiff,
  logReturnCoordinationFieldDiff,
  resolveCounterpartyProposalFieldHighlights,
  type CoordinateMeetupPhase,
} from '@/lib/rentalWizard/coordinateProposalFieldDiff';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export function useCoordinationProposalFieldHighlight(input: {
  phase: CoordinateMeetupPhase;
  reviewingCounterpartyProposal: boolean;
  coordinationFinalized: boolean;
  lane: MeetupPhaseCoordinationLane;
  ctx: RentalWizardContext;
  /** Dev log surface id, e.g. `owner_coordinate_pickup`. */
  logSurface?: string;
  /** Bumps when a newer proposal arrives — recomputes the field diff. */
  proposalVersion?: number | null;
}): { highlightLocation: boolean; highlightTime: boolean } {
  const { highlights, trace } = useMemo(() => {
    const result = resolveCounterpartyProposalFieldHighlights({
      phase: input.phase,
      reviewingCounterpartyProposal: input.reviewingCounterpartyProposal,
      coordinationFinalized: input.coordinationFinalized,
      lane: input.lane,
      ctx: input.ctx,
    });
    return {
      highlights: {
        highlightLocation: result.highlightLocation,
        highlightTime: result.highlightTime,
      },
      trace: result.trace,
    };
  }, [
    input.coordinationFinalized,
    input.ctx,
    input.ctx.meetupCoordination.revision,
    input.ctx.rental.last_proposed_by,
    input.ctx.rental.proposal_version,
    input.ctx.viewerRole,
    input.ctx.wizardProgress.coordinate_pickup_viewer_last_submission,
    input.ctx.wizardProgress.coordinate_return_viewer_last_submission,
    input.lane.dateTimeIso,
    input.lane.location,
    input.lane.proposedIso,
    input.lane,
    input.phase,
    input.proposalVersion,
    input.reviewingCounterpartyProposal,
  ]);

  useLayoutEffect(() => {
    if (!input.reviewingCounterpartyProposal || input.coordinationFinalized || !trace) return;
    if (input.phase === 'return') {
      logReturnCoordinationFieldDiff(trace);
      return;
    }
    logCoordinateProposalFieldDiff(
      input.logSurface ?? `coordinate_${input.phase}`,
      input.ctx.rentalId,
      trace
    );
  }, [
    input.coordinationFinalized,
    input.ctx.rentalId,
    input.logSurface,
    input.phase,
    input.reviewingCounterpartyProposal,
    trace,
  ]);

  return highlights;
}

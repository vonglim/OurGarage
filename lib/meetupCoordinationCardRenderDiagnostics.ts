import type { MeetupPhaseCoordinationLane } from '@/lib/rentalMeetupPhaseCoordinationState';

export type MeetupCoordinationCardDiagnostics = {
  coordinationLiveRevision: number;
  pendingPhase: string | null;
  surface: string;
  componentKey: string;
  meetingExpanded?: boolean;
  meetingShowFullCard?: boolean;
  cardsVisible?: boolean;
};

export type RentalCoordinationFieldAudit = {
  agreement_status: string | null;
  pickup_datetime: string | null;
  return_datetime: string | null;
  meetup_time: string | null;
  return_time: string | null;
  last_proposed_by: string | null;
};

type LaneFieldSnapshot = {
  status: MeetupPhaseCoordinationLane['status'];
  viewerCanAccept: boolean;
  isPendingThisPhase: boolean;
  dateTimeIso: string | null;
  location: string;
  statusLabel: string;
  viewerCanPropose: boolean;
  viewerCanModify: boolean;
  coordinationComplete: boolean;
  unlocked: boolean;
};

export type MeetupCoordinationCardRenderSnapshot = {
  laneRef: MeetupPhaseCoordinationLane;
  laneDigest: string;
  diagnosticsDigest: string;
  laneFields: LaneFieldSnapshot;
};

function laneFieldSnapshot(lane: MeetupPhaseCoordinationLane): LaneFieldSnapshot {
  return {
    status: lane.status,
    viewerCanAccept: lane.viewerCanAccept,
    isPendingThisPhase: lane.isPendingThisPhase,
    dateTimeIso: lane.dateTimeIso,
    location: lane.location,
    statusLabel: lane.statusLabel,
    viewerCanPropose: lane.viewerCanPropose,
    viewerCanModify: lane.viewerCanModify,
    coordinationComplete: lane.coordinationComplete,
    unlocked: lane.unlocked,
  };
}

function laneDigest(lane: MeetupPhaseCoordinationLane): string {
  return JSON.stringify(laneFieldSnapshot(lane));
}

const renderCountsByKey = new Map<string, number>();

function laneFieldDelta(
  prev: LaneFieldSnapshot | null,
  next: LaneFieldSnapshot
): Partial<Record<keyof LaneFieldSnapshot, { from: unknown; to: unknown }>> | null {
  if (!prev) return null;
  const delta: Partial<Record<keyof LaneFieldSnapshot, { from: unknown; to: unknown }>> = {};
  (Object.keys(next) as (keyof LaneFieldSnapshot)[]).forEach((key) => {
    if (prev[key] !== next[key]) {
      delta[key] = { from: prev[key], to: next[key] };
    }
  });
  return Object.keys(delta).length > 0 ? delta : null;
}

export function logMeetupCoordinationCardRender(input: {
  lane: MeetupPhaseCoordinationLane;
  diagnostics: MeetupCoordinationCardDiagnostics;
  prev: MeetupCoordinationCardRenderSnapshot | null;
  rentalAudit?: RentalCoordinationFieldAudit | null;
}): MeetupCoordinationCardRenderSnapshot {
  const { lane, diagnostics, prev, rentalAudit } = input;
  const renderCount = (renderCountsByKey.get(diagnostics.componentKey) ?? 0) + 1;
  renderCountsByKey.set(diagnostics.componentKey, renderCount);

  const laneFields = laneFieldSnapshot(lane);
  const laneDigestNow = laneDigest(lane);
  const diagnosticsDigest = JSON.stringify(diagnostics);
  const tag =
    lane.phase === 'pickup' ? '[pickup-coordination-card-render]' : '[return-coordination-card-render]';

  const lanePayload = {
    status: lane.status,
    viewerCanAccept: lane.viewerCanAccept,
    pendingPhase: diagnostics.pendingPhase,
    scheduleIso: lane.dateTimeIso,
    location: lane.location,
  };

  console.log(tag, {
    surface: diagnostics.surface,
    componentKey: diagnostics.componentKey,
    lanePhase: lane.phase,
    laneSource: `meetupCoordination.${lane.phase}Lane`,
    usesCanonicalLanePropOnly: true,
    ...(lane.phase === 'pickup' ? { pickupLane: lanePayload } : { returnLane: lanePayload }),
    coordinationLiveRevision: diagnostics.coordinationLiveRevision,
    renderCount,
    meetingExpanded: diagnostics.meetingExpanded ?? null,
    meetingShowFullCard: diagnostics.meetingShowFullCard ?? null,
    cardsVisible: diagnostics.cardsVisible ?? null,
    laneStatusLabel: lane.statusLabel,
    laneCoordinationComplete: lane.coordinationComplete,
    propsEquality: {
      laneReferenceChanged: prev != null && prev.laneRef !== lane,
      laneDigestChanged: prev == null || prev.laneDigest !== laneDigestNow,
      diagnosticsDigestChanged: prev == null || prev.diagnosticsDigest !== diagnosticsDigest,
      laneFieldDelta: laneFieldDelta(prev?.laneFields ?? null, laneFields),
      prevLaneDigest: prev?.laneDigest ?? null,
      nextLaneDigest: laneDigestNow,
    },
    rentalFieldAudit: rentalAudit ?? null,
    rentalVsLaneMismatchHints:
      rentalAudit && lane.phase === 'pickup'
        ? {
            agreementPendingButLaneNotNeedsResponse:
              rentalAudit.agreement_status === 'pending' && lane.status !== 'needs_response',
            agreementConfirmedButLanePending:
              rentalAudit.agreement_status === 'confirmed' && lane.isPendingThisPhase,
            rentalPickupDatetime: rentalAudit.pickup_datetime,
            laneScheduleIso: lane.dateTimeIso,
            scheduleDiffersFromRentalPickup:
              (rentalAudit.pickup_datetime ?? null) !== (lane.dateTimeIso ?? null),
          }
        : rentalAudit && lane.phase === 'return'
          ? {
              rentalReturnDatetime: rentalAudit.return_datetime,
              laneScheduleIso: lane.dateTimeIso,
              scheduleDiffersFromRentalReturn:
                (rentalAudit.return_datetime ?? null) !== (lane.dateTimeIso ?? null),
            }
          : null,
  });

  return {
    laneRef: lane,
    laneDigest: laneDigestNow,
    diagnosticsDigest,
    laneFields,
  };
}

export function logMeetupCoordinationUiTree(input: {
  rentalId: string;
  coordinationLiveRevision: number;
  meetingShowFullCard: boolean;
  meetingExpanded: boolean;
  cardsMounted: boolean;
  pendingPhase: string | null;
  pickupLane: LaneFieldSnapshot;
  returnLane: LaneFieldSnapshot;
  meetingStatusText: string;
  meetingInlineTitle: string;
}): void {
  console.log('[meetup-coordination-ui-tree]', {
    rentalId: input.rentalId,
    coordinationLiveRevision: input.coordinationLiveRevision,
    meetingShowFullCard: input.meetingShowFullCard,
    meetingExpanded: input.meetingExpanded,
    cardsMounted: input.cardsMounted,
    pendingPhase: input.pendingPhase,
    pickupLane: input.pickupLane,
    returnLane: input.returnLane,
    meetingStatusText: input.meetingStatusText,
    meetingInlineTitle: input.meetingInlineTitle,
    note: input.cardsMounted
      ? 'MeetupPhaseCoordinationCard children should mount and emit [pickup-coordination-card-render].'
      : 'Cards not mounted — UI shows inline strip or collapsed summary only.',
  });
}

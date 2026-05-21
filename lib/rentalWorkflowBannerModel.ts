export type RentalWorkflowBannerModel =
  | { kind: 'hidden' }
  | {
      kind: 'coordinate';
      title: string;
      body: string;
      showMessagesCta: true;
    }
  | {
      kind: 'waiting_review';
      title: string;
      body: string;
    }
  | {
      kind: 'waiting_sent';
      title: string;
      body: string;
    }
  | {
      kind: 'pickup_confirmed';
      title: string;
      body: string;
    }
  | {
      kind: 'rental_active';
      title: string;
      body: string;
    }
  | {
      kind: 'return_coordination';
      title: string;
      body: string;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatPickupBannerWhen(iso: string | null | undefined): string {
  if (!iso) return 'Time not set';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'Time not set';
  const d = new Date(t);
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const now = Date.now();
  const dayDiff = Math.round((startOfLocalDay(t) - startOfLocalDay(now)) / DAY_MS);
  if (dayDiff === 0) return `Today at ${timePart}`;
  if (dayDiff === 1) return `Tomorrow at ${timePart}`;
  if (dayDiff === -1) return `Yesterday at ${timePart}`;
  const datePart = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  return `${datePart} at ${timePart}`;
}

export function computeRentalWorkflowBannerModel(input: {
  lifecyclePhase: 'pickup' | 'active' | 'return' | 'completed';
  termsCompleted: boolean;
  pickupCoordinationComplete: boolean;
  meetupCoordinationComplete: boolean;
  hasPendingProposal: boolean;
  iProposedLast: boolean;
  meetupLocation: string;
  pickupIso: string | null | undefined;
}): RentalWorkflowBannerModel {
  if (!input.termsCompleted || input.lifecyclePhase === 'completed') {
    return { kind: 'hidden' };
  }

  if (input.lifecyclePhase === 'return') {
    return {
      kind: 'return_coordination',
      title: 'Coordinate return',
      body:
        'Use Messages or Propose Changes to coordinate return/drop-off details.',
    };
  }

  if (input.lifecyclePhase === 'active') {
    return {
      kind: 'rental_active',
      title: 'Rental active',
      body:
        'Use this workspace to:\n• coordinate return\n• request additional rental days\n• report issues',
    };
  }

  if (
    input.pickupCoordinationComplete &&
    !input.meetupCoordinationComplete &&
    input.lifecyclePhase === 'pickup'
  ) {
    const loc = input.meetupLocation.trim() || 'Location not set';
    const when = formatPickupBannerWhen(input.pickupIso);
    return {
      kind: 'pickup_confirmed',
      title: 'Pickup confirmed',
      body: `Meet at:\n${loc}\n\n${when}`,
    };
  }

  if (input.hasPendingProposal && !input.iProposedLast) {
    return {
      kind: 'waiting_review',
      title: 'Waiting for response',
      body:
        'Review the proposed:\n• meetup location\n• pickup time\n• return time\n\nYou can accept or modify the proposal below.',
    };
  }

  if (input.hasPendingProposal && input.iProposedLast) {
    return {
      kind: 'waiting_sent',
      title: 'Waiting for their response',
      body: 'The other party can accept or modify your proposal below.',
    };
  }

  return {
    kind: 'coordinate',
    title: 'Next step',
    body:
      'Coordinate pickup location and times with the other party.\n\nUse “Propose Changes” below to suggest:\n• meetup location\n• pickup time\n• return time',
    showMessagesCta: true,
  };
}

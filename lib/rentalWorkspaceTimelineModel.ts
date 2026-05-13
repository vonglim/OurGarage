function formatCompactDateTime(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return 'Not set';
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} • ${timePart}`;
}

export type RentalWorkspaceTimelineTone = 'done' | 'current' | 'upcoming';

export type RentalWorkspaceTimelineEvent = {
  id: string;
  title: string;
  subtitle?: string;
  tone: RentalWorkspaceTimelineTone;
};

function isoOrNull(v: string | null | undefined): string | null {
  if (v == null || String(v).trim() === '') return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? String(v) : null;
}

/** Lightweight operational timeline derived from existing rental + agreement flags (no new APIs). */
export function buildRentalWorkspaceTimelineModel(input: {
  rentalStatus: string;
  termsCompleted: boolean;
  meetingCompleted: boolean;
  handoffCompleted: boolean;
  returnCompleted: boolean;
  lifecyclePhase: 'pickup' | 'active' | 'return' | 'completed';
  signedAt: string | null | undefined;
  pickupIso: string | null | undefined;
  returnIso: string | null | undefined;
}): RentalWorkspaceTimelineEvent[] {
  const events: RentalWorkspaceTimelineEvent[] = [];
  const st = String(input.rentalStatus ?? '').trim().toLowerCase();

  events.push({
    id: 'matched',
    title: 'Rental matched',
    subtitle: 'Request approved and rental workspace opened.',
    tone: 'done',
  });

  if (input.termsCompleted) {
    events.push({
      id: 'terms',
      title: 'Pricing & terms on file',
      subtitle: 'Agreed financial snapshot is available for both parties.',
      tone: 'done',
    });
  } else {
    events.push({
      id: 'terms',
      title: 'Pricing & terms',
      subtitle: 'Waiting for agreed pricing details to be recorded.',
      tone: st === 'pending' ? 'current' : 'upcoming',
    });
  }

  if (input.meetingCompleted) {
    const pIso = isoOrNull(input.pickupIso);
    const rIso = isoOrNull(input.returnIso);
    events.push({
      id: 'meetup',
      title: 'Meetup details confirmed',
      subtitle: [pIso ? `Pickup ${formatCompactDateTime(pIso)}` : null, rIso ? `Return ${formatCompactDateTime(rIso)}` : null]
        .filter(Boolean)
        .join(' · '),
      tone: 'done',
    });
  } else if (input.termsCompleted) {
    events.push({
      id: 'meetup',
      title: 'Meetup coordination',
      subtitle: 'Confirm pickup, return, and location together.',
      tone: 'current',
    });
  } else {
    events.push({
      id: 'meetup',
      title: 'Meetup coordination',
      subtitle: 'Unlocks after pricing & terms are in place.',
      tone: 'upcoming',
    });
  }

  if (input.handoffCompleted) {
    events.push({
      id: 'handoff',
      title: 'Pickup / handoff complete',
      subtitle: input.signedAt ? `Renter sign-off ${formatCompactDateTime(input.signedAt)}` : undefined,
      tone: 'done',
    });
  } else if (input.meetingCompleted) {
    events.push({
      id: 'handoff',
      title: 'Pickup / handoff',
      subtitle: 'Photos, checklists, and confirmations for both sides.',
      tone: input.lifecyclePhase === 'pickup' ? 'current' : 'upcoming',
    });
  } else {
    events.push({
      id: 'handoff',
      title: 'Pickup / handoff',
      subtitle: 'Starts after meetup details are confirmed.',
      tone: 'upcoming',
    });
  }

  if (input.returnCompleted) {
    events.push({
      id: 'return',
      title: 'Return complete',
      subtitle: 'Verification and confirmations are on record.',
      tone: 'done',
    });
  } else if (input.handoffCompleted) {
    const returnCurrent = input.lifecyclePhase === 'return' || st === 'return_pending';
    events.push({
      id: 'return',
      title: 'Return & drop-off',
      subtitle: 'Photos, checklist, and final confirmations.',
      tone: returnCurrent ? 'current' : input.lifecyclePhase === 'active' ? 'upcoming' : 'upcoming',
    });
  }

  return events;
}

export type RentalWorkspaceViewerRole = 'owner' | 'renter';

/** Active-rental prep card (shown during ON RENT). */
export function activePrepareCardTitle(role: RentalWorkspaceViewerRole): string {
  return role === 'owner' ? 'Prepare to receive the return' : 'Prepare for return';
}

export function activePrepareRemindersHead(role: RentalWorkspaceViewerRole): string {
  return role === 'owner' ? 'Before drop-off' : 'Before you return';
}

export function activePrepareReminderLines(role: RentalWorkspaceViewerRole): string[] {
  if (role === 'owner') {
    return [
      'Coordinate drop-off timing in Messages',
      'Be available at the agreed return location',
      'Review return photos once the renter submits them',
      'Confirm returned condition when everything looks right',
    ];
  }
  return [
    'Recharge battery if needed',
    'Clean the item if your agreement expects it',
    'Include all accessories',
    'Plan return photos in the Return section before meetup',
  ];
}

export function activeRentalHelpCallout(role: RentalWorkspaceViewerRole): string {
  return role === 'owner'
    ? 'Questions about timing or condition? Open Messages—drop-off notes and return photos stay in one thread.'
    : 'Need help? Open Messages—meetup notes, return photos, and chat stay together for this rental.';
}

/** Workbench / hero guidance for return stage. */
export function workspaceReturnGuidanceLine(role: RentalWorkspaceViewerRole): string {
  return role === 'owner'
    ? 'Review the renter’s return photos and checklist, then confirm when the item looks right.'
    : 'Finish your return checklist and photos, then confirm when drop-off is complete.';
}

export function returnSectionCollapsedMeta(
  role: RentalWorkspaceViewerRole,
  returnCompleted: boolean
): string {
  if (returnCompleted) {
    return 'Return workflow complete — return photos are saved on the rental.';
  }
  return role === 'owner'
    ? 'Review return submissions, checklist, and confirm when the item looks right.'
    : 'Track your return checklist, photos, and final confirmation.';
}

export function returnPhotosSectionHelper(role: RentalWorkspaceViewerRole): string {
  return role === 'owner'
    ? 'Return photos are uploaded by the renter. Review them here before you confirm the return.'
    : 'Capture clear return photos in the app. They stay visible only to you and the host until the rental is complete.';
}

export function returnResponsibilitiesSectionTitle(role: RentalWorkspaceViewerRole): string {
  return role === 'owner' ? 'Your review checklist' : 'Your responsibilities';
}

/** Operational context under the stage workbench (counts, timing). */
export function buildActiveWorkbenchContextLine(
  role: RentalWorkspaceViewerRole,
  parts: string[]
): string | null {
  if (parts.length === 0) {
    return role === 'owner'
      ? 'The item is out with the renter—stay reachable for return coordination.'
      : null;
  }
  return parts.join(' · ');
}

export function formatReturnWorkbenchContextLine(
  role: RentalWorkspaceViewerRole,
  checklistDone: number,
  checklistTotal: number,
  photoCount: number
): string {
  const photos =
    photoCount === 0
      ? role === 'owner'
        ? 'waiting on renter return photos'
        : 'add return photos when ready'
      : `${photoCount} return photo${photoCount === 1 ? '' : 's'}`;
  if (role === 'owner') {
    return photoCount === 0
      ? `Your review ${checklistDone}/${checklistTotal} · ${photos}`
      : `Your review ${checklistDone}/${checklistTotal} · Renter submitted ${photos}`;
  }
  return `Your checklist ${checklistDone}/${checklistTotal} · ${photos}`;
}

/** Short kicker above embedded workflow in the stage workbench. */
export function rentalWorkbenchFocusHeadline(
  benchTone: 'coordination' | 'pickup' | 'active' | 'return' | 'closure' | 'neutral',
  role: RentalWorkspaceViewerRole
): string {
  switch (benchTone) {
    case 'coordination':
      return 'Coordinate meetup';
    case 'pickup':
      return role === 'owner' ? 'Handoff prep (host)' : 'Handoff prep (renter)';
    case 'active':
      return role === 'owner' ? 'While it’s out' : 'While you have it';
    case 'return':
      return role === 'owner' ? 'Receive the return' : 'Complete your return';
    case 'closure':
      return 'Summary';
    default:
      return 'Details';
  }
}

export function activeReturnCountdownFragment(
  role: RentalWorkspaceViewerRole,
  kind: 'passed' | 'here' | 'hours' | 'days',
  value?: number
): string {
  switch (kind) {
    case 'passed':
      return role === 'owner'
        ? 'Return date has passed — align drop-off in Messages.'
        : 'Return date has passed — finish drop-off coordination in Messages.';
    case 'here':
      return role === 'owner'
        ? 'Return window is here — be ready for drop-off.'
        : 'Return window is here — plan your drop-off and photos.';
    case 'hours':
      return `Return in about ${value ?? 1} hour${value === 1 ? '' : 's'}.`;
    case 'days':
      return `Return in ${value ?? 1} day${value === 1 ? '' : 's'}.`;
    default:
      return '';
  }
}

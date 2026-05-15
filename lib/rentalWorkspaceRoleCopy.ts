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
    ? 'Coordinate the return and review updates in Messages—drop-off notes and return photos stay in one thread.'
    : 'Need help? Open Messages—meetup notes, return photos, and chat stay together for this rental.';
}

/** ON RENT workbench summary — role-aware operational tone. */
export function activeOnRentSummaryLine(
  role: RentalWorkspaceViewerRole,
  returnScheduleLabel: string | null
): string {
  if (role === 'owner') {
    return returnScheduleLabel
      ? `Your item is currently rented out until ${returnScheduleLabel}. Coordinate the return and review updates in Messages.`
      : 'Your item is currently rented out. Coordinate the return and stay reachable in Messages.';
  }
  return returnScheduleLabel
    ? `You’re responsible for returning this item by ${returnScheduleLabel}. Request an extension before the return window closes if you need more time.`
    : 'You’re responsible for returning this item on time. Request an extension in advance if you need more time.';
}

export function activeExtensionUrgencyLine(role: RentalWorkspaceViewerRole): string | null {
  return role === 'renter'
    ? 'Need more time? Request an extension before the return window closes.'
    : null;
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

export function returnSectionIntroLine(role: RentalWorkspaceViewerRole): string {
  return role === 'owner'
    ? 'Review the renter’s return photos, checklist, and notes — then confirm when the item matches what you expect.'
    : 'Document the item as you’re returning it. Same photo system as pickup — clear tiles, clear expectations.';
}

export function returnPhotosSectionHelper(role: RentalWorkspaceViewerRole): string {
  return role === 'owner'
    ? 'Photos are uploaded by the renter. Preview each group below before you complete your review.'
    : 'Use the tiles for return photos — full item first, then any issues or extras. All captures stay in this rental record.';
}

export function returnResponsibilitiesSectionTitle(role: RentalWorkspaceViewerRole): string {
  return role === 'owner' ? 'Your review checklist' : 'Your responsibilities';
}

export function returnGuidanceTitle(role: RentalWorkspaceViewerRole): string {
  return role === 'owner' ? 'What to look for in return photos' : 'How your return photos should look';
}

export function returnGuidanceBullets(role: RentalWorkspaceViewerRole): string[] {
  if (role === 'owner') {
    return [
      'Full item visible with clear lighting',
      'Current condition matches what you expect',
      'Accessories and components shown',
      'Any wear or issues called out by the renter',
    ];
  }
  return [
    'Include the full item in frame',
    'Show current condition clearly',
    'Photograph accessories and components',
    'Use clear lighting and a simple background',
  ];
}

export function returnGuidanceMuted(role: RentalWorkspaceViewerRole): string {
  return role === 'owner'
    ? 'Compare against pickup evidence in Messages if anything looks different.'
    : 'These photos help the owner confirm a smooth return — same trust model as pickup.';
}

export function returnPrimaryCtaLabel(role: RentalWorkspaceViewerRole, ready: boolean): string {
  if (role === 'owner') return ready ? 'Confirm item returned' : 'Complete return review';
  return ready ? 'Return prep complete' : 'Confirm return photos';
}

export function returnPrimaryFootnote(
  role: RentalWorkspaceViewerRole,
  ready: boolean,
  photoCount: number,
  requiredPhotos: number
): string | null {
  if (role === 'owner') {
    return ready
      ? 'This records your side of the return. The rental completes once both parties have confirmed.'
      : `Finish your review checklist after the renter submits at least ${requiredPhotos} return photos.`;
  }
  if (ready) return 'Coordinate drop-off timing in Messages when you head out.';
  return photoCount > 0
    ? `${photoCount} of ${requiredPhotos} return photos saved — add clear item shots until you’re ready.`
    : `Add at least ${requiredPhotos} return photos using the tiles above.`;
}

export function returnNotesAccordionTitle(role: RentalWorkspaceViewerRole): string {
  return role === 'renter' ? 'Return notes (optional)' : 'Renter return notes';
}

export function returnNotesAccordionHelper(role: RentalWorkspaceViewerRole): string {
  return role === 'renter'
    ? 'Tap to note wear, accessories, or anything the owner should know'
    : 'Tap to read notes from the renter';
}

export function returnInfoBannerText(role: RentalWorkspaceViewerRole): string {
  return role === 'owner'
    ? 'Review return photos and your checklist, then confirm when the item looks right.'
    : 'Upload return photos, finish your checklist, then coordinate drop-off in Messages.';
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

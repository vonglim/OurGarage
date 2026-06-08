export const OWNER_RETURN_PREP_MANUAL_ITEM_ID = 'or-prep-inspection';

export const OWNER_RETURN_PREP_CHECKLIST = [
  {
    id: 'or-review-meetup',
    label: 'Review return meetup details',
    detail: 'Confirm return location and time',
  },
  {
    id: 'or-review-photos',
    label: 'Review renter return photos',
    detail: 'Check photos when the renter uploads them',
  },
  {
    id: OWNER_RETURN_PREP_MANUAL_ITEM_ID,
    label: 'Prepare for inspection',
    detail: 'Be ready to inspect the item at return',
    manual: true as const,
  },
] as const;

export function buildOwnerReturnPrepChecklistDone(input: {
  meetupDetailsConfirmed: boolean;
  renterReturnPhotoCount: number;
  storedManual: Record<string, boolean>;
}): Record<string, boolean> {
  return {
    'or-review-meetup': input.meetupDetailsConfirmed,
    'or-review-photos': input.renterReturnPhotoCount > 0,
    [OWNER_RETURN_PREP_MANUAL_ITEM_ID]: Boolean(input.storedManual[OWNER_RETURN_PREP_MANUAL_ITEM_ID]),
  };
}

export function isOwnerReturnPrepChecklistComplete(done: Record<string, boolean>): boolean {
  return OWNER_RETURN_PREP_CHECKLIST.every((item) => Boolean(done[item.id]));
}

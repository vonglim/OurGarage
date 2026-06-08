/** Shared owner arrival gating — wizard and rental workspace use the same rules. */

export function ownerSeesRenterAtMeetup(input: {
  renterArrived: boolean;
  renterPickupImHereAt?: string | null;
}): boolean {
  return input.renterArrived || Boolean(input.renterPickupImHereAt?.trim());
}

export function canOwnerMarkImHereAtPickup(input: {
  renterArrived: boolean;
  renterPickupImHereAt?: string | null;
  ownerArrived: boolean;
  handoffApprovalStarted: boolean;
}): boolean {
  return (
    ownerSeesRenterAtMeetup(input) &&
    !input.ownerArrived &&
    input.handoffApprovalStarted
  );
}

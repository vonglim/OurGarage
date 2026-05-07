/** Tracks which offer thread chat screen is focused (for suppressing duplicate alerts when viewing that thread). */

let activeOfferThreadId: string | null = null;

export function setActiveChatOfferThreadId(offerId: string | null): void {
  activeOfferThreadId =
    offerId != null && String(offerId).trim() !== '' ? String(offerId).trim() : null;
}

export function getActiveChatOfferThreadId(): string | null {
  return activeOfferThreadId;
}

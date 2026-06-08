type ReviewRequestHandler = () => void;

const handlers = new Map<string, ReviewRequestHandler>();

export function coordinateProposalReviewKey(rentalId: string, lane: 'pickup' | 'return'): string {
  return `${rentalId.trim()}:${lane}`;
}

export function registerCoordinateProposalReviewHandler(
  rentalId: string,
  lane: 'pickup' | 'return',
  handler: ReviewRequestHandler
): () => void {
  const key = coordinateProposalReviewKey(rentalId, lane);
  handlers.set(key, handler);
  return () => {
    if (handlers.get(key) === handler) {
      handlers.delete(key);
    }
  };
}

export function requestCoordinateProposalReview(rentalId: string, lane: 'pickup' | 'return'): void {
  handlers.get(coordinationProposalReviewKey(rentalId, lane))?.();
}

function coordinationProposalReviewKey(rentalId: string, lane: 'pickup' | 'return'): string {
  return coordinateProposalReviewKey(rentalId, lane);
}

import { create } from 'zustand';

/**
 * Shared capture session items — URI is device-local until upload pipeline runs.
 * IDs are stable for the capture session only (used for cover selection + animations).
 */
export type MediaCaptureItem = {
  id: string;
  localUri: string;
};

export type MediaCaptureListingBootstrap = {
  items: MediaCaptureItem[];
  coverId: string;
};

export type MediaCaptureListingCommit = {
  items: MediaCaptureItem[];
  coverId: string;
};

type State = {
  /** Set by Listing Wizard (or future flows) immediately before navigating to `/media-capture`. */
  listingBootstrap: MediaCaptureListingBootstrap | null;
  /** Set by `/media-capture` on Done; consumed when Listing photos step regains focus. */
  listingPendingCommit: MediaCaptureListingCommit | null;
  setListingBootstrap: (b: MediaCaptureListingBootstrap | null) => void;
  takeListingBootstrap: () => MediaCaptureListingBootstrap | null;
  setListingPendingCommit: (c: MediaCaptureListingCommit | null) => void;
  takeListingPendingCommit: () => MediaCaptureListingCommit | null;
};

export const useMediaCaptureSessionStore = create<State>((set, get) => ({
  listingBootstrap: null,
  listingPendingCommit: null,

  setListingBootstrap: (b) => set({ listingBootstrap: b }),

  takeListingBootstrap: () => {
    const v = get().listingBootstrap;
    set({ listingBootstrap: null });
    return v;
  },

  setListingPendingCommit: (c) => set({ listingPendingCommit: c }),

  takeListingPendingCommit: () => {
    const v = get().listingPendingCommit;
    set({ listingPendingCommit: null });
    return v;
  },
}));

export function newMediaCaptureItemId(): string {
  return `cap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

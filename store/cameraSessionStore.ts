import { create } from 'zustand';

import type { PickupPhotoCategory } from '@/lib/pickupVerificationPhotoBuckets';
import type { VerificationPhase } from '@/lib/rentalVerification';

/**
 * Holds URIs from the multi-capture camera screen so the previous route can read them after `router.back()`.
 */
export type EvidenceCaptureMode = 'photo' | 'video';

export type RentalEvidenceCameraSession = {
  rentalId: string;
  phase: VerificationPhase;
  /** Owner pickup tile; all captures in this session share this category. */
  pickupPhotoCategory?: PickupPhotoCategory | null;
  captureMode?: EvidenceCaptureMode;
};

type CameraSessionState = {
  capturedPhotoUris: string[];
  setCapturedPhotoUris: (uris: string[]) => void;
  /** When set, `/camera` return should upload to rental verification evidence (not listing/offer). */
  rentalEvidenceSession: RentalEvidenceCameraSession | null;
  setRentalEvidenceSession: (session: RentalEvidenceCameraSession | null) => void;
  /** When set, `/camera` return on Make Offer flows into this pickup category bucket. */
  makeOfferEvidenceCategory: PickupPhotoCategory | null;
  setMakeOfferEvidenceCategory: (category: PickupPhotoCategory | null) => void;
};

export const useCameraSessionStore = create<CameraSessionState>((set) => ({
  capturedPhotoUris: [],
  setCapturedPhotoUris: (uris) => set({ capturedPhotoUris: [...uris] }),
  rentalEvidenceSession: null,
  setRentalEvidenceSession: (session) => set({ rentalEvidenceSession: session }),
  makeOfferEvidenceCategory: null,
  setMakeOfferEvidenceCategory: (category) => set({ makeOfferEvidenceCategory: category }),
}));

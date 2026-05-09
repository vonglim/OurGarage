import { create } from 'zustand';

import type { PickupPhotoCategory } from '@/lib/pickupVerificationPhotoBuckets';
import type { VerificationPhase } from '@/lib/rentalVerification';

/**
 * Holds URIs from the multi-capture camera screen so the previous route can read them after `router.back()`.
 */
export type RentalEvidenceCameraSession = {
  rentalId: string;
  phase: VerificationPhase;
  /** Owner pickup tile; all captures in this session share this category. */
  pickupPhotoCategory?: PickupPhotoCategory | null;
};

type CameraSessionState = {
  capturedPhotoUris: string[];
  setCapturedPhotoUris: (uris: string[]) => void;
  /** When set, `/camera` return should upload to rental verification evidence (not listing/offer). */
  rentalEvidenceSession: RentalEvidenceCameraSession | null;
  setRentalEvidenceSession: (session: RentalEvidenceCameraSession | null) => void;
};

export const useCameraSessionStore = create<CameraSessionState>((set) => ({
  capturedPhotoUris: [],
  setCapturedPhotoUris: (uris) => set({ capturedPhotoUris: [...uris] }),
  rentalEvidenceSession: null,
  setRentalEvidenceSession: (session) => set({ rentalEvidenceSession: session }),
}));

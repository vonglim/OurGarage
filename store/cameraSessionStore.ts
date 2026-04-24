import { create } from 'zustand';

/**
 * Holds URIs from the multi-capture camera screen so the previous route can read them after `router.back()`.
 */
type CameraSessionState = {
  capturedPhotoUris: string[];
  setCapturedPhotoUris: (uris: string[]) => void;
};

export const useCameraSessionStore = create<CameraSessionState>((set) => ({
  capturedPhotoUris: [],
  setCapturedPhotoUris: (uris) => set({ capturedPhotoUris: [...uris] }),
}));

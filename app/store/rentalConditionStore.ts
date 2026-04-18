import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = '@ourgarage/rental_condition_v1';

type PhotoMaps = {
  handoffPhotoByRequest: Record<string, string>;
  returnPhotoByRequest: Record<string, string>;
};

function key(ts: number): string {
  return String(ts);
}

async function persist(maps: PhotoMaps): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
  } catch {
    /* ignore */
  }
}

type RentalConditionState = PhotoMaps & {
  hydrate: () => Promise<void>;
  setHandoffPhoto: (requestTimestamp: number, uri: string | null) => void;
  setReturnPhoto: (requestTimestamp: number, uri: string | null) => void;
};

export const useRentalConditionStore = create<RentalConditionState>((set) => ({
  handoffPhotoByRequest: {},
  returnPhotoByRequest: {},
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Record<string, unknown>;
      const handoff =
        p.handoffPhotoByRequest && typeof p.handoffPhotoByRequest === 'object'
          ? (p.handoffPhotoByRequest as Record<string, string>)
          : {};
      const ret =
        p.returnPhotoByRequest && typeof p.returnPhotoByRequest === 'object'
          ? (p.returnPhotoByRequest as Record<string, string>)
          : {};
      set({ handoffPhotoByRequest: handoff, returnPhotoByRequest: ret });
    } catch {
      /* ignore */
    }
  },
  setHandoffPhoto: (requestTimestamp, uri) => {
    const k = key(requestTimestamp);
    set((s) => {
      const handoffPhotoByRequest = { ...s.handoffPhotoByRequest };
      if (uri == null || uri === '') delete handoffPhotoByRequest[k];
      else handoffPhotoByRequest[k] = uri;
      void persist({
        handoffPhotoByRequest,
        returnPhotoByRequest: s.returnPhotoByRequest,
      });
      return { handoffPhotoByRequest };
    });
  },
  setReturnPhoto: (requestTimestamp, uri) => {
    const k = key(requestTimestamp);
    set((s) => {
      const returnPhotoByRequest = { ...s.returnPhotoByRequest };
      if (uri == null || uri === '') delete returnPhotoByRequest[k];
      else returnPhotoByRequest[k] = uri;
      void persist({
        handoffPhotoByRequest: s.handoffPhotoByRequest,
        returnPhotoByRequest,
      });
      return { returnPhotoByRequest };
    });
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { isValidPresetId } from '../lib/userAvatarPresets';

const STORAGE_KEY = '@ourgarage/user_avatar_v1';

export type AvatarMode = 'preset' | 'custom';

export type UserAvatarPersisted = {
  mode: AvatarMode;
  presetId: string;
  customUri: string | null;
};

let state: UserAvatarPersisted = {
  mode: 'preset',
  presetId: 'person',
  customUri: null,
};

let version = 0;
const listeners = new Set<() => void>();
let loadStarted = false;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function normalizeLoaded(parsed: unknown): UserAvatarPersisted {
  if (!parsed || typeof parsed !== 'object') return { ...state };
  const p = parsed as Record<string, unknown>;
  const mode = p.mode === 'custom' ? 'custom' : 'preset';
  const presetId =
    typeof p.presetId === 'string' && isValidPresetId(p.presetId)
      ? p.presetId
      : 'person';
  const customUri = typeof p.customUri === 'string' ? p.customUri : null;
  if (mode === 'custom' && customUri) {
    return { mode: 'custom', presetId, customUri };
  }
  return { mode: 'preset', presetId, customUri: null };
}

async function loadFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = normalizeLoaded(JSON.parse(raw));
    }
  } catch {
    /* ignore */
  }
  emit();
}

function ensureLoad() {
  if (!loadStarted) {
    loadStarted = true;
    void loadFromStorage();
  }
}

export function subscribeUserAvatar(listener: () => void) {
  ensureLoad();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUserAvatarVersion(): number {
  ensureLoad();
  return version;
}

export function getUserAvatarState(): UserAvatarPersisted {
  ensureLoad();
  return state;
}

export async function setUserAvatarPreset(presetId: string): Promise<void> {
  state = {
    mode: 'preset',
    presetId: isValidPresetId(presetId) ? presetId : 'person',
    customUri: null,
  };
  emit();
  await persist();
}

export async function setUserAvatarCustom(uri: string): Promise<void> {
  state = {
    mode: 'custom',
    presetId: state.presetId,
    customUri: uri,
  };
  emit();
  await persist();
}

/** Subscribe to persisted avatar; safe for SSR/web snapshot. */
export function useUserAvatar(): UserAvatarPersisted {
  useSyncExternalStore(
    subscribeUserAvatar,
    getUserAvatarVersion,
    getUserAvatarVersion
  );
  return getUserAvatarState();
}

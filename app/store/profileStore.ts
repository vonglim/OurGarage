import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { formatPresetAvatar, normalizeAvatarField } from '../lib/profileAvatar';
import { isValidPresetId } from '../lib/userAvatarPresets';

const STORAGE_KEY = '@ourgarage/profile_v1';
const LEGACY_AVATAR_KEY = '@ourgarage/user_avatar_v1';

export type UserProfile = {
  name: string;
  bio: string;
  /** Preset: `preset:<id>`. Custom: image URI. */
  avatar: string;
};

const defaultProfile: UserProfile = {
  name: '',
  bio: '',
  avatar: formatPresetAvatar('person'),
};

let state: UserProfile = { ...defaultProfile };
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

function normalizeLoadedProfile(parsed: unknown): UserProfile {
  if (!parsed || typeof parsed !== 'object') {
    return { ...defaultProfile };
  }
  const p = parsed as Record<string, unknown>;
  const name = typeof p.name === 'string' ? p.name : '';
  const bio = typeof p.bio === 'string' ? p.bio : '';
  const avatarRaw = typeof p.avatar === 'string' ? p.avatar : defaultProfile.avatar;
  const avatar = normalizeAvatarField(avatarRaw);
  return { name, bio, avatar };
}

type LegacyAvatar = {
  mode: 'preset' | 'custom';
  presetId: string;
  customUri: string | null;
};

function normalizeLegacyAvatar(parsed: unknown): LegacyAvatar | null {
  if (!parsed || typeof parsed !== 'object') return null;
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
      state = normalizeLoadedProfile(JSON.parse(raw));
    } else {
      const legacyRaw = await AsyncStorage.getItem(LEGACY_AVATAR_KEY);
      if (legacyRaw) {
        try {
          const legacy = normalizeLegacyAvatar(JSON.parse(legacyRaw));
          if (legacy) {
            state = {
              ...defaultProfile,
              avatar:
                legacy.mode === 'custom' && legacy.customUri
                  ? legacy.customUri
                  : formatPresetAvatar(legacy.presetId),
            };
            await persist();
            await AsyncStorage.removeItem(LEGACY_AVATAR_KEY);
          }
        } catch {
          /* keep legacy key if parse/migrate fails */
        }
      }
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

export function subscribeProfile(listener: () => void) {
  ensureLoad();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getProfileVersion(): number {
  ensureLoad();
  return version;
}

export function getProfile(): UserProfile {
  ensureLoad();
  return { ...state };
}

export async function updateProfile(data: Partial<UserProfile>): Promise<void> {
  ensureLoad();
  if (data.name !== undefined) {
    state = { ...state, name: data.name };
  }
  if (data.bio !== undefined) {
    state = { ...state, bio: data.bio };
  }
  if (data.avatar !== undefined) {
    state = { ...state, avatar: normalizeAvatarField(data.avatar) };
  }
  emit();
  await persist();
}

export function useProfile(): UserProfile {
  useSyncExternalStore(subscribeProfile, getProfileVersion, getProfileVersion);
  return getProfile();
}

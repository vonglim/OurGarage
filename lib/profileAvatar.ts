import { isValidPresetId } from './userAvatarPresets';

const PRESET_PREFIX = 'preset:';

/** Preset avatars use `preset:<id>`; custom photos use the image URI. */
export function formatPresetAvatar(presetId: string): string {
  const id = isValidPresetId(presetId) ? presetId : 'person';
  return `${PRESET_PREFIX}${id}`;
}

export function parseProfileAvatar(avatar: string): { kind: 'preset'; id: string } | { kind: 'custom'; uri: string } {
  const trimmed = avatar.trim();
  if (trimmed.startsWith(PRESET_PREFIX)) {
    const id = trimmed.slice(PRESET_PREFIX.length);
    return { kind: 'preset', id: isValidPresetId(id) ? id : 'person' };
  }
  if (trimmed.length > 0) {
    return { kind: 'custom', uri: trimmed };
  }
  return { kind: 'preset', id: 'person' };
}

export function normalizeAvatarField(avatar: string): string {
  const t = avatar.trim();
  if (t.startsWith(PRESET_PREFIX)) {
    const id = t.slice(PRESET_PREFIX.length);
    return isValidPresetId(id) ? t : formatPresetAvatar('person');
  }
  return t.length > 0 ? t : formatPresetAvatar('person');
}

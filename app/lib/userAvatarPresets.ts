export type UserAvatarPreset = {
  id: string;
  /** Ionicons glyph name */
  icon: string;
  color: string;
};

/** Small built-in set for profile avatar selection. */
export const USER_AVATAR_PRESETS: readonly UserAvatarPreset[] = [
  { id: 'person', icon: 'person', color: '#5C6BC0' },
  { id: 'hammer', icon: 'hammer', color: '#8D6E63' },
  { id: 'leaf', icon: 'leaf', color: '#43A047' },
  { id: 'rocket', icon: 'rocket', color: '#E53935' },
  { id: 'color-palette', icon: 'color-palette', color: '#8E24AA' },
  { id: 'fish', icon: 'fish', color: '#1E88E5' },
] as const;

export function getPresetById(id: string): UserAvatarPreset {
  return USER_AVATAR_PRESETS.find((p) => p.id === id) ?? USER_AVATAR_PRESETS[0];
}

export function isValidPresetId(id: string): boolean {
  return USER_AVATAR_PRESETS.some((p) => p.id === id);
}

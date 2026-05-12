import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const COALESCE_MS = 110;

let lastAt = 0;

/**
 * Subtle light impact. Coalesces bursts (e.g. press + immediate navigation) so it stays rare.
 */
export function lightImpact(): void {
  if (Platform.OS === 'web') return;
  const now = Date.now();
  if (now - lastAt < COALESCE_MS) return;
  lastAt = now;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Slightly stronger tap — e.g. camera shutter confirmation. */
export function mediumImpact(): void {
  if (Platform.OS === 'web') return;
  const now = Date.now();
  if (now - lastAt < COALESCE_MS) return;
  lastAt = now;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

import { useRouter, useSegments } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '../store/profileStore';
import { UserAvatar } from './UserAvatar';

/** Extra offset below safe-area inset (avoids status bar / notch). */
const TOP_PAD = 8;
/** Target ~60pt from top on compact status bars; notches use inset + pad. */
const TOP_MIN = 60;

function isProfileTab(segments: string[]): boolean {
  return segments[0] === '(tabs)' && segments[1] === 'profile';
}

export function GlobalProfileAvatarOverlay() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { avatar } = useProfile();
  const top = Math.max(TOP_MIN, insets.top + TOP_PAD);

  if (isProfileTab(segments)) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top,
          right: 20,
        },
      ]}
    >
      <Pressable
        accessibilityLabel="Profile"
        hitSlop={10}
        onPress={() => router.navigate('/(tabs)/profile')}
        style={({ pressed }) => [styles.ring, pressed && styles.pressed]}
      >
        <UserAvatar variant="overlay" avatar={avatar} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 9999,
  },
  ring: {
    padding: 5,
    borderRadius: 999,
    backgroundColor: '#F2F2F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  pressed: {
    opacity: 0.82,
  },
});

import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { UserAvatar } from './UserAvatar';

export function ProfileNavButton() {
  const router = useRouter();

  return (
    <Pressable
      accessibilityLabel="Profile"
      hitSlop={10}
      onPress={() => router.push('/profile')}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      <View style={styles.ring}>
        <UserAvatar variant="header" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  pressed: {
    opacity: 0.82,
  },
  ring: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: '#F2F2F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
});

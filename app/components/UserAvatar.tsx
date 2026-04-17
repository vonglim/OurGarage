import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { getPresetById } from '../lib/userAvatarPresets';
import { parseProfileAvatar } from '../lib/profileAvatar';
import { useProfile } from '../store/profileStore';

/** `overlay` is ~20% smaller than the former header size for the global corner control. */
const SIZES = { header: 70, overlay: 56, profile: 152 } as const;

export type UserAvatarVariant = keyof typeof SIZES;

type Props = {
  variant: UserAvatarVariant;
  /** When set, render from this value (e.g. `profile.avatar`) instead of only the live store read. */
  avatar?: string;
};

export function UserAvatar({ variant, avatar: avatarProp }: Props) {
  const { avatar: storeAvatar } = useProfile();
  const avatar = avatarProp ?? storeAvatar;
  const parsed = parseProfileAvatar(avatar);
  const size = SIZES[variant];
  const radius = size / 2;
  const iconSize =
    variant === 'profile'
      ? Math.round(size * 0.36)
      : Math.round(size * 0.4);

  if (parsed.kind === 'custom') {
    return (
      <View
        style={[
          styles.clip,
          {
            width: size,
            height: size,
            borderRadius: radius,
          },
        ]}
      >
        <Image
          source={{ uri: parsed.uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
          transition={120}
        />
      </View>
    );
  }

  const preset = getPresetById(parsed.id);
  return (
    <View
      style={[
        styles.presetCircle,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: preset.color,
        },
      ]}
    >
      <Ionicons
        name={preset.icon as React.ComponentProps<typeof Ionicons>['name']}
        size={iconSize}
        color="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    backgroundColor: '#E5E5EA',
  },
  presetCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

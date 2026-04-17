import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { getPresetById } from '../lib/userAvatarPresets';
import { useUserAvatar } from '../store/userAvatarStore';

const SIZES = { header: 70, profile: 152 } as const;

export type UserAvatarVariant = keyof typeof SIZES;

type Props = {
  variant: UserAvatarVariant;
};

export function UserAvatar({ variant }: Props) {
  const avatar = useUserAvatar();
  const size = SIZES[variant];
  const radius = size / 2;
  const iconSize =
    variant === 'header' ? Math.round(size * 0.4) : Math.round(size * 0.36);

  if (avatar.mode === 'custom' && avatar.customUri) {
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
          source={{ uri: avatar.customUri }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
          transition={120}
        />
      </View>
    );
  }

  const preset = getPresetById(avatar.presetId);
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
        // Preset icons are validated against Ionicons at build time in presets file.
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

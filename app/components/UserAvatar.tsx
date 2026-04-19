import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { IMAGE_TRANSITION_MS } from '@/constants/interactionTiming';
import { ui } from '@/constants/appUi';
import { getPresetById } from '../lib/userAvatarPresets';
import { parseProfileAvatar } from '../lib/profileAvatar';
import { useProfile } from '../store/profileStore';

const SIZE = 152;
const ICON_SIZE = Math.round(SIZE * 0.36);

type Props = {
  /** When set, render from this value instead of only the live store read. */
  avatar?: string;
};

export function UserAvatar({ avatar: avatarProp }: Props) {
  const { avatar: storeAvatar } = useProfile();
  const avatar = avatarProp ?? storeAvatar;
  const parsed = parseProfileAvatar(avatar);
  const radius = SIZE / 2;

  if (parsed.kind === 'custom') {
    return (
      <View
        style={[
          styles.clip,
          {
            width: SIZE,
            height: SIZE,
            borderRadius: radius,
          },
        ]}
      >
        <Image
          source={{ uri: parsed.uri }}
          style={{ width: SIZE, height: SIZE, borderRadius: radius }}
          contentFit="cover"
          transition={IMAGE_TRANSITION_MS}
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
          width: SIZE,
          height: SIZE,
          borderRadius: radius,
          backgroundColor: preset.color,
        },
      ]}
    >
      <Ionicons
        name={preset.icon as React.ComponentProps<typeof Ionicons>['name']}
        size={ICON_SIZE}
        color={ui.primaryOn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    backgroundColor: ui.border,
  },
  presetCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { UserActivityDot } from '@/components/UserActivityDot';
import { ui } from '@/constants/appUi';
import { IMAGE_TRANSITION_MS } from '@/constants/interactionTiming';
import { parseProfileAvatar } from '@/lib/profileAvatar';
import { getPresetById } from '@/lib/userAvatarPresets';

const AVATAR = 40;
const ICON = 20;

type Props = {
  name: string;
  rating: number;
  avatar: string;
  lastActive: number;
  onPress?: () => void;
  /** When false, the row is not tappable (e.g. when an outer card handles navigation). */
  isClickable?: boolean;
};

export function OfferOffererRow({
  name,
  rating,
  avatar,
  lastActive,
  onPress,
  isClickable = true,
}: Props) {
  const parsed = parseProfileAvatar(avatar);
  const accent =
    parsed.kind === 'preset' ? getPresetById(parsed.id).color : ui.border;
  const radius = AVATAR / 2;

  const avatarNode =
    parsed.kind === 'custom' ? (
      <View style={[styles.avatarClip, { width: AVATAR, height: AVATAR, borderRadius: radius }]}>
        <Image
          source={{ uri: parsed.uri }}
          style={{ width: AVATAR, height: AVATAR, borderRadius: radius }}
          contentFit="cover"
          transition={IMAGE_TRANSITION_MS}
        />
      </View>
    ) : (
      <View
        style={[
          styles.presetWrap,
          {
            width: AVATAR,
            height: AVATAR,
            borderRadius: radius,
            backgroundColor: accent,
          },
        ]}
      >
        <Ionicons
          name={getPresetById(parsed.id).icon as React.ComponentProps<typeof Ionicons>['name']}
          size={ICON}
          color={ui.primaryOn}
        />
      </View>
    );

  const inner = (
    <>
      {avatarNode}
      <View style={styles.meta}>
        <View style={styles.nameRow}>
          <UserActivityDot lastActive={lastActive} />
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Text style={styles.rating}>⭐ {rating.toFixed(1)}</Text>
      </View>
    </>
  );

  const canPress = isClickable && typeof onPress === 'function';
  if (canPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${name}, open profile`}
      >
        {inner}
      </Pressable>
    );
  }

  return <View style={styles.row}>{inner}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  rowPressed: {
    opacity: 0.9,
  },
  avatarClip: {
    overflow: 'hidden',
    backgroundColor: ui.border,
  },
  presetWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  meta: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    minWidth: 0,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    minWidth: 0,
  },
  rating: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textPrimary,
  },
});

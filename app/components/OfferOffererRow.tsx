import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { parseProfileAvatar } from '../lib/profileAvatar';
import { getPresetById } from '../lib/userAvatarPresets';
import { UserActivityDot } from './UserActivityDot';

const AVATAR = 30;
const AVATAR_ICON = Math.round(AVATAR * 0.42);

type Props = {
  name: string;
  rating: number;
  avatar: string;
  lastActive: number | null | undefined;
  onPress: () => void;
};

function OfferAvatar({ avatar }: { avatar: string }) {
  const parsed = parseProfileAvatar(avatar);
  const r = AVATAR / 2;
  if (parsed.kind === 'custom') {
    return (
      <View style={[styles.avatarRing, { width: AVATAR, height: AVATAR, borderRadius: r }]}>
        <Image
          source={{ uri: parsed.uri }}
          style={{ width: AVATAR, height: AVATAR, borderRadius: r }}
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
        styles.avatarRing,
        {
          width: AVATAR,
          height: AVATAR,
          borderRadius: r,
          backgroundColor: preset.color,
        },
      ]}
    >
      <Ionicons
        name={preset.icon as React.ComponentProps<typeof Ionicons>['name']}
        size={AVATAR_ICON}
        color="#FFFFFF"
      />
    </View>
  );
}

/** Top-of-card identity: avatar, status dot, name, rating — one tappable row. */
export function OfferOffererRow({
  name,
  rating,
  avatar,
  lastActive,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, rating ${rating.toFixed(1)}, open profile`}
    >
      <OfferAvatar avatar={avatar} />
      <View style={styles.identityLine}>
        <UserActivityDot lastActive={lastActive} style={styles.statusDotSpacing} />
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.rating} numberOfLines={1}>
          ⭐ {rating.toFixed(1)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 12,
    paddingVertical: 2,
    gap: 10,
    minWidth: 0,
  },
  rowPressed: {
    opacity: 0.88,
  },
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    flexShrink: 0,
  },
  identityLine: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 8,
  },
  statusDotSpacing: {
    marginRight: 0,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  rating: {
    flexShrink: 0,
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
});

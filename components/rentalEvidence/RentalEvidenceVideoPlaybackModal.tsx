import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type RentalEvidenceVideoPlaybackModalProps = {
  visible: boolean;
  uri: string | null;
  title?: string;
  onClose: () => void;
};

export function RentalEvidenceVideoPlaybackModal({
  visible,
  uri,
  title = 'Video (Optional)',
  onClose,
}: RentalEvidenceVideoPlaybackModalProps) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri ?? '', (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!visible || !uri) {
      player.pause();
      return;
    }
    player.replace(uri);
    player.play();
  }, [visible, uri, player]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}>
          <Pressable pressOpacityFeedback={false} onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={ui.textPrimary} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.closeBtn} />
        </View>

        <View style={styles.playerWrap}>
          {uri ? (
            <VideoView style={styles.video} player={player} nativeControls contentFit="contain" />
          ) : (
            <Text style={styles.fallback}>Video unavailable.</Text>
          )}
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
    zIndex: 2,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  playerWrap: { flex: 1, justifyContent: 'center' },
  video: { width: '100%', height: '100%' },
  fallback: { color: '#FFFFFF', textAlign: 'center', fontSize: 15 },
});

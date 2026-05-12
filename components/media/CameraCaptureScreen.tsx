import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaptureButton } from '@/components/media/CaptureButton';
import { CropGuideOverlay } from '@/components/media/CropGuideOverlay';
import { PhotoThumbnailRail } from '@/components/media/PhotoThumbnailRail';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { mediumImpact } from '@/lib/haptics';
import { newMediaCaptureItemId, type MediaCaptureItem } from '@/store/mediaCaptureSessionStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export type CameraCaptureScreenProps = {
  maxPhotos: number;
  initialItems?: MediaCaptureItem[];
  initialCoverId?: string | null;
  /** Short context line (e.g. “Listing photos”) — makes the screen feel like a wizard step. */
  flowContextTitle?: string;
  flowContextSubtitle?: string;
  onClose: () => void;
  onDone: (result: { items: MediaCaptureItem[]; coverId: string }) => void;
};

const FLASH_CYCLE: FlashMode[] = ['off', 'on', 'auto'];

/**
 * Fullscreen multi-capture camera session — reusable Renby media foundation (listing first).
 * Camera stays open after each shot; thumbnails animate into the rail.
 */
export function CameraCaptureScreen({
  maxPhotos,
  initialItems,
  initialCoverId,
  flowContextTitle = 'Listing photos',
  flowContextSubtitle = 'Tap Done to save photos to your listing.',
  onClose,
  onDone,
}: CameraCaptureScreenProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<InstanceType<typeof CameraView>>(null);
  const railRef = useRef<ScrollView>(null);
  const shutterPulse = useSharedValue(1);
  const shutterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterPulse.value }],
  }));
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [capturing, setCapturing] = useState(false);
  const [items, setItems] = useState<MediaCaptureItem[]>(() => initialItems ?? []);
  const [coverId, setCoverId] = useState(() => {
    if (initialCoverId && (initialItems ?? []).some((i) => i.id === initialCoverId)) return initialCoverId;
    return initialItems?.[0]?.id ?? '';
  });
  const [preview, setPreview] = useState<MediaCaptureItem | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      setCoverId('');
      return;
    }
    if (!coverId || !items.some((i) => i.id === coverId)) {
      setCoverId(items[0].id);
    }
  }, [items, coverId]);

  useEffect(() => {
    if (items.length === 0) return;
    requestAnimationFrame(() => {
      railRef.current?.scrollToEnd({ animated: true });
    });
  }, [items.length]);

  const requestClose = useCallback(() => {
    if (items.length === 0) {
      onClose();
      return;
    }
    Alert.alert('Discard captured photos?', 'Your photos are not saved until you tap Done.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  }, [items.length, onClose]);

  const cycleFlash = useCallback(() => {
    setFlash((prev) => {
      const i = FLASH_CYCLE.indexOf(prev);
      return FLASH_CYCLE[(i + 1) % FLASH_CYCLE.length];
    });
  }, []);

  const onShutter = useCallback(async () => {
    if (!cameraReady || capturing) return;
    if (items.length >= maxPhotos) {
      showFeedbackToast(`You can add up to ${maxPhotos} photos.`);
      return;
    }
    const cam = cameraRef.current;
    if (!cam) return;
    setCapturing(true);
    try {
      const photo = await cam.takePictureAsync({ quality: 0.72, shutterSound: true });
      if (!photo?.uri) return;
      mediumImpact();
      shutterPulse.value = withSequence(
        withTiming(0.88, { duration: 75 }),
        withSpring(1, { damping: 15, stiffness: 280 })
      );
      const id = newMediaCaptureItemId();
      setItems((prev) => [...prev, { id, localUri: photo.uri }]);
    } catch {
      showFeedbackToast('Could not capture photo. Try again.');
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, capturing, items.length, maxPhotos, shutterPulse]);

  const importGallery = useCallback(async () => {
    const remaining = maxPhotos - items.length;
    if (remaining <= 0) {
      showFeedbackToast(`You can add up to ${maxPhotos} photos.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showFeedbackToast('Allow photo library access in Settings to import photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled || !result.assets?.length) return;
    const additions: MediaCaptureItem[] = result.assets
      .map((a) => a.uri)
      .filter(Boolean)
      .slice(0, remaining)
      .map((localUri) => ({ id: newMediaCaptureItemId(), localUri }));
    if (additions.length === 0) return;
    setItems((prev) => [...prev, ...additions]);
  }, [items.length, maxPhotos]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    setPreview((p) => (p?.id === id ? null : p));
  }, []);

  const onThumbPress = useCallback(
    (item: MediaCaptureItem) => {
      if (Platform.OS === 'web') {
        setPreview(item);
        return;
      }
      Alert.alert('Photo', undefined, [
        {
          text: 'Preview',
          onPress: () => setPreview(item),
        },
        {
          text: 'Set as cover',
          onPress: () => setCoverId(item.id),
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeItem(item.id),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [removeItem]
  );

  const handleDone = useCallback(() => {
    if (items.length === 0) {
      showFeedbackToast('Add at least one photo to continue.');
      return;
    }
    const cid = coverId && items.some((i) => i.id === coverId) ? coverId : items[0].id;
    onDone({ items, coverId: cid });
  }, [coverId, items, onDone]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webRoot}>
        <Text style={styles.webTitle}>{flowContextTitle}</Text>
        <Text style={styles.webBody}>
          Camera capture is available on the iOS and Android app. Import photos here, then tap Done to save them
          to your listing.
        </Text>
        <Pressable onPress={importGallery} style={styles.webBtn} haptic>
          <Text style={styles.webBtnText}>Import from gallery</Text>
        </Pressable>
        <Pressable
          onPress={handleDone}
          disabled={items.length === 0}
          style={[styles.webDone, items.length === 0 && styles.webDoneDisabled]}
          haptic
        >
          <Text style={[styles.webDoneText, items.length === 0 && styles.webDoneTextDisabled]}>Done</Text>
        </Pressable>
        <Pressable onPress={requestClose} style={styles.webLink}>
          <Text style={styles.webLinkText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={ui.primaryOn} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permBlock}>
        <Text style={styles.permTitle}>Camera access</Text>
        <Text style={styles.permBody}>Allow camera access to capture clear photos of your equipment.</Text>
        <Pressable onPress={() => void requestPermission()} style={styles.permBtn} haptic>
          <Text style={styles.permBtnText}>Continue</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.permCancel}>
          <Text style={styles.permCancelText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const topPad = Math.max(insets.top, 12);
  const bottomPad = Math.max(insets.bottom, 12);
  const railToShutter = 22;
  const shutterToActions = 18;

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        mode="picture"
        animateShutter
        onCameraReady={() => setCameraReady(true)}
      />

      <View style={[styles.topBar, { paddingTop: topPad, paddingHorizontal: 16 }]} pointerEvents="box-none">
        <Pressable
          onPress={requestClose}
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={26} color="rgba(255,255,255,0.95)" />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={cycleFlash} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Flash">
          <Ionicons
            name={flash === 'on' ? 'flash' : flash === 'auto' ? 'flash-outline' : 'flash-off-outline'}
            size={22}
            color="rgba(255,255,255,0.95)"
          />
        </Pressable>
        <View style={{ width: 10 }} />
        <Pressable
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Flip camera"
        >
          <Ionicons name="camera-reverse-outline" size={22} color="rgba(255,255,255,0.95)" />
        </Pressable>
      </View>

      <View style={[styles.stepContext, { top: topPad + 50 }]} pointerEvents="none">
        <Text style={styles.stepContextTitle}>{flowContextTitle}</Text>
        <Text style={styles.stepContextSub}>{flowContextSubtitle}</Text>
      </View>

      <CropGuideOverlay />

      <View style={[styles.bottomStack, { paddingBottom: bottomPad, paddingHorizontal: 16 }]} pointerEvents="box-none">
        <PhotoThumbnailRail ref={railRef} items={items} coverId={coverId} maxPhotos={maxPhotos} onPressItem={onThumbPress} />
        <View style={{ height: railToShutter }} />
        <View style={styles.shutterRow}>
          <Animated.View style={shutterAnimatedStyle}>
            <CaptureButton disabled={!cameraReady} busy={capturing} onPress={() => void onShutter()} />
          </Animated.View>
        </View>
        <View style={{ height: shutterToActions }} />
        <View style={styles.actionsRow}>
          <Pressable onPress={() => void importGallery()} style={styles.importBtn} haptic>
            <Ionicons name="images-outline" size={18} color="rgba(255,255,255,0.92)" />
            <Text style={styles.importBtnLabel}>Import</Text>
          </Pressable>
          <Pressable
            onPress={handleDone}
            disabled={items.length === 0}
            style={({ pressed }) => [
              styles.donePill,
              items.length > 0 && styles.donePillActive,
              pressed && items.length > 0 && { opacity: 0.92 },
              items.length === 0 && styles.donePillDisabled,
            ]}
            haptic
            accessibilityRole="button"
            accessibilityLabel="Save photos and continue"
          >
            <Text style={[styles.donePillText, items.length > 0 && styles.donePillTextActive]}>Done</Text>
          </Pressable>
        </View>
      </View>

      {!cameraReady ? (
        <View style={styles.readyOverlay} pointerEvents="none">
          <ActivityIndicator color={ui.primaryOn} size="large" />
        </View>
      ) : null}

      <Modal visible={preview != null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreview(null)} />
          {preview ? (
            <View style={styles.previewCard}>
              <Image source={{ uri: preview.localUri }} style={styles.previewImg} resizeMode="contain" />
              <View style={styles.previewActions}>
                <Pressable
                  onPress={() => {
                    setCoverId(preview.id);
                    setPreview(null);
                  }}
                  style={styles.previewBtn}
                >
                  <Text style={styles.previewBtnText}>Set as cover</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    removeItem(preview.id);
                    setPreview(null);
                  }}
                  style={styles.previewBtnDanger}
                >
                  <Text style={styles.previewBtnDangerText}>Remove</Text>
                </Pressable>
                <Pressable onPress={() => setPreview(null)} style={styles.previewBtnGhost}>
                  <Text style={styles.previewBtnGhostText}>Close</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,31,58,0.28)',
  },
  bottomStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
  },
  stepContext: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 5,
  },
  stepContextTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  stepContextSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 18,
  },
  shutterRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    gap: 12,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(11,31,58,0.22)',
  },
  importBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
  },
  donePill: {
    minWidth: 124,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  donePillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  donePillDisabled: {
    opacity: 0.4,
  },
  donePillText: {
    fontSize: 16,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: -0.2,
  },
  donePillTextActive: {
    color: ui.primary,
  },
  readyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
    zIndex: 4,
  },
  centered: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permBlock: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  permTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  permBody: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 22,
    marginBottom: 24,
  },
  permBtn: {
    backgroundColor: ui.primaryOn,
    borderRadius: ui.radiusButton,
    paddingVertical: 14,
    alignItems: 'center',
  },
  permBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.primary,
  },
  permCancel: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  permCancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  webRoot: {
    flex: 1,
    backgroundColor: ui.background,
    padding: 24,
    justifyContent: 'center',
  },
  webTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  webBody: {
    fontSize: 16,
    color: ui.textSecondary,
    lineHeight: 24,
    marginBottom: 24,
  },
  webBtn: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  webDone: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  webDoneDisabled: {
    opacity: 0.4,
  },
  webDoneText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '800',
  },
  webDoneTextDisabled: {
    color: ui.primaryOn,
  },
  webBtnText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '700',
  },
  webLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  webLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.primary,
  },
  previewRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  previewCard: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    overflow: 'hidden',
  },
  previewImg: {
    width: '100%',
    height: 360,
    backgroundColor: '#000',
  },
  previewActions: {
    padding: ui.spaceMd,
    gap: 10,
  },
  previewBtn: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: 12,
    alignItems: 'center',
  },
  previewBtnText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '700',
  },
  previewBtnDanger: {
    borderRadius: ui.radiusButton,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.danger,
  },
  previewBtnDangerText: {
    color: ui.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  previewBtnGhost: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  previewBtnGhostText: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textSecondary,
  },
});

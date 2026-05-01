import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { lightImpact } from '@/lib/haptics';
import { useCameraSessionStore } from '@/store/cameraSessionStore';

const CAPTURE_SIZE = 76;
const CAPTURE_BORDER = 4;
const THUMB = 60;
const THUMB_GAP = 8;

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<InstanceType<typeof CameraView>>(null);
  const thumbScrollRef = useRef<ScrollView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [captures, setCaptures] = useState<string[]>([]);
  const capturingRef = useRef(false);
  const SHUTTER_GAP = 28;

  const setCapturedPhotoUris = useCameraSessionStore((s) => s.setCapturedPhotoUris);

  const onDone = useCallback(() => {
    setCapturedPhotoUris(captures);
    router.back();
  }, [captures, router, setCapturedPhotoUris]);

  const onShutter = useCallback(async () => {
    if (!cameraReady || capturingRef.current) return;
    const cam = cameraRef.current;
    if (!cam) return;
    capturingRef.current = true;
    try {
      lightImpact();
      const photo = await cam.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        setCaptures((prev) => [...prev, photo.uri]);
        requestAnimationFrame(() => thumbScrollRef.current?.scrollToEnd({ animated: true }));
      }
    } catch {
    } finally {
      capturingRef.current = false;
    }
  }, [cameraReady]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webFallback}>
        <Text style={styles.webFallbackText}>Camera is available on the iOS and Android app.</Text>
        <ScreenBackButton onPress={() => router.back()} />
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionBlock}>
        <Text style={styles.permissionTitle}>Camera access</Text>
        <Text style={styles.permissionBody}>Allow camera access to take photos of your equipment.</Text>
        <Pressable
          onPress={() => void requestPermission()}
          style={({ pressed }) => [styles.permissionBtn, pressed && styles.permissionBtnPressed]}
          haptic
        >
          <Text style={styles.permissionBtnText}>Continue</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.permissionCancel}>
          <Text style={styles.permissionCancelText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const stripHeight = THUMB + 32 + insets.bottom;
  const stripBottom = 8 + insets.bottom;

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        mode="picture"
        animateShutter
        onCameraReady={() => setCameraReady(true)}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

        {/* ✅ GUIDE OVERLAY */}
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.guideBox} />
          <Text style={styles.guideText}>Center your item</Text>
        </View>

        {/* Dark bottom fade */}
        <View
  pointerEvents="none"
  style={[
    styles.bottomDim,
    { height: THUMB + 32 + insets.bottom },
  ]}
/>

        <Pressable
          onPress={onDone}
          style={[styles.doneBtn, { top: insets.top + 8, right: 16 }]}
          hitSlop={12}
          haptic
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>

        <Pressable
          onPress={onShutter}
          disabled={!cameraReady}
          style={({ pressed }) => [
            styles.shutterOuter,
            {
              bottom: stripHeight + SHUTTER_GAP,
              opacity: !cameraReady ? 0.45 : pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
        />

        <ScrollView
          ref={thumbScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={[styles.thumbStrip, { bottom: stripBottom }]}
          contentContainerStyle={styles.thumbStripContent}
        >
          {captures.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={styles.thumb}
              contentFit="cover"
              transition={0}
            />
          ))}
        </ScrollView>
      </View>

      {!cameraReady ? (
        <View style={styles.readyOverlay} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },

  /* ✅ NEW OVERLAY STYLES */
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideBox: {
    width: '80%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
  },
  guideText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },

  bottomDim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  doneBtn: {
    position: 'absolute',
    zIndex: 2,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  doneLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  shutterOuter: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 2,
    width: CAPTURE_SIZE,
    height: CAPTURE_SIZE,
    borderRadius: CAPTURE_SIZE / 2,
    borderWidth: CAPTURE_BORDER,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  thumbStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    maxHeight: THUMB + 16,
  },
  thumbStripContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    marginRight: THUMB_GAP,
    backgroundColor: '#1F2937',
  },
  centered: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  permissionBlock: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  permissionBody: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  permissionBtnPressed: {
    opacity: 0.9,
  },
  permissionBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  permissionCancel: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  permissionCancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  webFallback: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webFallbackText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
});
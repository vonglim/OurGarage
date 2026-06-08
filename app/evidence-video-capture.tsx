import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { OPTIONAL_OPERATIONAL_VIDEO_MAX_SECONDS } from '@/lib/ownerOptionalVideoEvidence';
import { useCameraSessionStore } from '@/store/cameraSessionStore';

export default function EvidenceVideoCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<InstanceType<typeof CameraView>>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const setCapturedPhotoUris = useCameraSessionStore((s) => s.setCapturedPhotoUris);

  const onDone = useCallback(() => {
    if (!videoUri) {
      Alert.alert('Add a video', 'Record a short video before continuing.');
      return;
    }
    setCapturedPhotoUris([videoUri]);
    router.back();
  }, [router, setCapturedPhotoUris, videoUri]);

  const startRecording = useCallback(async () => {
    if (!cameraReady || recording || videoUri) return;
    const cam = cameraRef.current;
    if (!cam) return;
    setRecording(true);
    try {
      const result = await cam.recordAsync({
        maxDuration: OPTIONAL_OPERATIONAL_VIDEO_MAX_SECONDS,
      });
      if (result?.uri) setVideoUri(result.uri);
    } catch {
      Alert.alert('Could not record', 'Try again in a moment.');
    } finally {
      setRecording(false);
    }
  }, [cameraReady, recording, videoUri]);

  const stopRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  const retake = useCallback(() => {
    setVideoUri(null);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Video capture is available on the iOS and Android app.</Text>
        <Pressable onPress={() => router.back()} style={styles.fallbackBtn}>
          <Text style={styles.fallbackBtnText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  if (!cameraPermission || !micPermission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <View style={styles.permissionBlock}>
        <Text style={styles.permissionTitle}>Camera & microphone</Text>
        <Text style={styles.permissionBody}>
          Allow access to record a short optional video of the item operating.
        </Text>
        <Pressable
          onPress={() => void requestCameraPermission().then(() => requestMicPermission())}
          style={styles.permissionBtn}
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

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        mode="video"
        videoQuality="480p"
        onCameraReady={() => setCameraReady(true)}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Video (Optional)</Text>
        <Text style={styles.subtitle}>Max {OPTIONAL_OPERATIONAL_VIDEO_MAX_SECONDS} seconds</Text>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {videoUri ? (
          <Text style={styles.statusText}>Video ready · tap Done to upload</Text>
        ) : recording ? (
          <Text style={styles.statusText}>Recording…</Text>
        ) : (
          <Text style={styles.statusText}>Record the item operating before pickup</Text>
        )}

        <View style={styles.actions}>
          {videoUri ? (
            <Pressable onPress={retake} style={styles.secondaryBtn} haptic>
              <Text style={styles.secondaryBtnText}>Retake</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={recording ? stopRecording : () => void startRecording()}
              disabled={!cameraReady}
              style={[styles.recordBtn, recording && styles.recordBtnActive, !cameraReady && styles.recordBtnDisabled]}
              haptic
            >
              <Text style={styles.recordBtnText}>{recording ? 'Stop' : 'Record'}</Text>
            </Pressable>
          )}
          <Pressable onPress={onDone} disabled={!videoUri} style={[styles.doneBtn, !videoUri && styles.doneBtnDisabled]} haptic>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', gap: 4 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '500' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  statusText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  recordBtn: {
    minWidth: 120,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  recordBtnActive: { backgroundColor: '#991B1B' },
  recordBtnDisabled: { opacity: 0.45 },
  recordBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    minWidth: 120,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  doneBtn: {
    minWidth: 120,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  doneBtnDisabled: { opacity: 0.4 },
  doneBtnText: { color: '#111827', fontSize: 16, fontWeight: '700' },
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  permissionBlock: { flex: 1, backgroundColor: '#000', padding: 24, justifyContent: 'center' },
  permissionTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 8 },
  permissionBody: { fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 22, marginBottom: 24 },
  permissionBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  permissionBtnText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  permissionCancel: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  permissionCancelText: { fontSize: 16, color: 'rgba(255,255,255,0.7)' },
  fallback: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  fallbackText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  fallbackBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  fallbackBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});

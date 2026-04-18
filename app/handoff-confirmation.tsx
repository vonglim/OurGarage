import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { pickPhotoFromLibrary } from './lib/pickProfileImage';
import { useRentalConditionStore } from './store/rentalConditionStore';
import { confirmRentalHandoff, getRequestByTimestamp } from './store/requestsStore';
import { ui } from '@/constants/appUi';

const ITEMS: { id: string; label: string }[] = [
  { id: 'inspected', label: 'I have inspected the tool' },
  { id: 'working', label: 'The tool is working as expected' },
  { id: 'how', label: 'I understand how to use it' },
  { id: 'condition', label: 'I agree this reflects the current condition' },
];

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function HandoffConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestIdStr = firstParam(params.requestId);
  const [tick, setTick] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ITEMS.map((i) => [i.id, false]))
  );
  const hydrateConditions = useRentalConditionStore((s) => s.hydrate);
  const handoffPhotoUri = useRentalConditionStore((s) =>
    requestIdStr && Number.isFinite(Number(requestIdStr))
      ? s.handoffPhotoByRequest[requestIdStr]
      : undefined
  );
  const setHandoffPhoto = useRentalConditionStore((s) => s.setHandoffPhoto);

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
      void hydrateConditions();
    }, [hydrateConditions])
  );

  const request = useMemo(() => {
    void tick;
    const id = Number(requestIdStr);
    if (!Number.isFinite(id)) return undefined;
    return getRequestByTimestamp(id);
  }, [requestIdStr, tick]);

  const allChecked = ITEMS.every((i) => checks[i.id]);

  const onConfirm = () => {
    if (!allChecked || request?.timestamp == null) return;
    confirmRentalHandoff(request.timestamp);
    router.replace({
      pathname: '/request-details',
      params: { requestId: String(request.timestamp) },
    });
  };

  if (!requestIdStr || !Number.isFinite(Number(requestIdStr))) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
        <Text style={styles.muted}>Invalid request.</Text>
        <Pressable onPress={() => router.back()} style={styles.textBtn} hitSlop={12}>
          <Text style={styles.textBtnLabel}>Go back</Text>
        </Pressable>
      </KeyboardDismissScreen>
    );
  }

  if (!request) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
        <Text style={styles.muted}>Request not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.textBtn} hitSlop={12}>
          <Text style={styles.textBtnLabel}>Go back</Text>
        </Pressable>
      </KeyboardDismissScreen>
    );
  }

  if (!request.matched) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
        <Text style={styles.muted}>This request is not matched yet.</Text>
        <Pressable onPress={() => router.back()} style={styles.textBtn} hitSlop={12}>
          <Text style={styles.textBtnLabel}>Go back</Text>
        </Pressable>
      </KeyboardDismissScreen>
    );
  }

  if (request.rentalStart != null) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.alreadyTitle}>Rental already started</Text>
        <Text style={styles.muted}>Handoff was confirmed earlier.</Text>
        <Pressable
          onPress={() =>
            router.replace({
              pathname: '/request-details',
              params: { requestId: String(request.timestamp) },
            })
          }
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        >
          <Text style={styles.primaryBtnText}>Open request</Text>
        </Pressable>
      </KeyboardDismissScreen>
    );
  }

  const toggle = (id: string) => {
    setChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const onAddHandoffPhoto = async () => {
    if (request.timestamp == null) return;
    const uri = await pickPhotoFromLibrary();
    if (uri) setHandoffPhoto(request.timestamp, uri);
  };

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Tool handoff</Text>
        <Text style={styles.headerSub}>
          Confirm you are ready to start the rental. All items below are required.
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {ITEMS.map((item, index) => {
            const on = !!checks[item.id];
            return (
              <Pressable
                key={item.id}
                onPress={() => toggle(item.id)}
                style={({ pressed }) => [
                  styles.checkRow,
                  index > 0 && styles.checkRowBorder,
                  pressed && styles.checkRowPressed,
                ]}
              >
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={styles.checkLabel}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.optionalBlock}>
          <Text style={styles.optionalLabel}>Pickup (optional)</Text>
          <Pressable
            onPress={onAddHandoffPhoto}
            style={({ pressed }) => [styles.photoBtn, pressed && styles.photoBtnPressed]}
          >
            <Text style={styles.photoBtnText}>Add Photo</Text>
          </Pressable>
          {handoffPhotoUri ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: handoffPhotoUri }} style={styles.photoPreview} contentFit="cover" />
              <Pressable
                onPress={() => request.timestamp != null && setHandoffPhoto(request.timestamp, null)}
                hitSlop={8}
                style={({ pressed }) => [styles.removePhoto, pressed && styles.photoBtnPressed]}
              >
                <Text style={styles.removePhotoText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          onPress={onConfirm}
          disabled={!allChecked}
          style={({ pressed }) => [
            styles.primaryBtn,
            !allChecked && styles.primaryBtnDisabled,
            pressed && allChecked && styles.primaryBtnPressed,
          ]}
        >
          <Text style={styles.primaryBtnText}>Confirm & Start Rental</Text>
        </Pressable>
      </View>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  backHit: {
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: ui.primary,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
  },
  headerSub: {
    marginTop: 6,
    fontSize: 14,
    color: '#6D6D72',
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 14,
  },
  optionalBlock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  optionalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D6D72',
    marginBottom: 10,
  },
  photoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#F2F2F7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  photoBtnPressed: {
    opacity: 0.75,
  },
  photoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.primary,
  },
  photoPreviewWrap: {
    marginTop: 12,
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 10,
    backgroundColor: '#ECECEC',
  },
  removePhoto: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
  },
  removePhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  checkRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ECECEC',
  },
  checkRowPressed: {
    backgroundColor: '#F9F9F9',
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxOn: {
    borderColor: ui.primary,
    backgroundColor: ui.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  checkLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: '#1C1C1E',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    opacity: ui.pressOpacity,
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  textBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  textBtnLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.primary,
  },
  alreadyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
});

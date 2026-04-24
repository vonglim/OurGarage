import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useCameraSessionStore } from '@/store/cameraSessionStore';

const NAVY = '#0B1F3A';
const BORDER = '#E5E7EB';
const HELPER_GRAY = '#6B7280';

export default function RentOutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [halfDay, setHalfDay] = useState('');
  const [daily, setDaily] = useState('');
  const [weekly, setWeekly] = useState('');
  const [replacementValue, setReplacementValue] = useState('');
  /** URIs from the camera session; first is shown in the hero preview. */
  const [listingPhotoUris, setListingPhotoUris] = useState<string[]>([]);
  const previewUri = listingPhotoUris[0] ?? null;

  const bottomPad = Math.max(16, tabBarHeight + insets.bottom + 16);

  useFocusEffect(
    useCallback(() => {
      const { capturedPhotoUris, setCapturedPhotoUris } = useCameraSessionStore.getState();
      if (capturedPhotoUris.length === 0) return;
      setListingPhotoUris(capturedPhotoUris);
      setCapturedPhotoUris([]);
    }, [])
  );

  const goToCamera = useCallback(() => {
    router.push('/camera');
  }, [router]);

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={styles.headerTitle}>List Your Equipment</Text>

      <Pressable
        style={styles.photoBox}
        onPress={goToCamera}
        accessibilityRole="button"
        accessibilityLabel="Take photos of your item"
      >
        {previewUri != null ? (
          <Image source={{ uri: previewUri }} style={styles.photoPreview} contentFit="cover" />
        ) : (
          <View style={styles.photoEmpty}>
            <Ionicons name="camera-outline" size={32} color="#6B7280" />
            <Text style={styles.photoLabel}>Take Photos</Text>
          </View>
        )}
      </Pressable>

      <Text style={styles.photoHelperText}>Use real photos of your item. No stock images.</Text>

      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Item name (e.g. Power Drill)"
        placeholderTextColor="#9CA3AF"
      />

      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the item"
        placeholderTextColor="#9CA3AF"
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.sectionTitle}>Pricing</Text>

      <TextInput
        style={styles.input}
        value={halfDay}
        onChangeText={setHalfDay}
        placeholder="Half-day price ($)"
        placeholderTextColor="#9CA3AF"
        keyboardType="numeric"
      />

      <TextInput
        style={styles.input}
        value={daily}
        onChangeText={setDaily}
        placeholder="Daily price ($)"
        placeholderTextColor="#9CA3AF"
        keyboardType="numeric"
      />

      <TextInput
        style={styles.input}
        value={weekly}
        onChangeText={setWeekly}
        placeholder="Weekly price ($)"
        placeholderTextColor="#9CA3AF"
        keyboardType="numeric"
      />

      <Text style={styles.sectionTitle}>Protection</Text>

      <TextInput
        style={[styles.input, styles.inputTightBottom]}
        value={replacementValue}
        onChangeText={setReplacementValue}
        placeholder="Replacement value ($)"
        placeholderTextColor="#9CA3AF"
        keyboardType="numeric"
      />

      <Text style={styles.helperText}>
        {
          "Set a fair replacement value based on the item's current used condition. Excessively high values may not be fully honored."
        }
      </Text>

      <Text style={styles.helperTextFollowUp}>
        If unsure, enter an estimated used value. This helps protect both you and the renter.
      </Text>

      <View style={styles.protectionInfoRow}>
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={HELPER_GRAY}
          style={styles.protectionInfoIcon}
        />
        <Text style={styles.protectionInfoNote}>
          We may use market data to verify listings in the future.
        </Text>
      </View>

      <Pressable
        style={styles.submit}
        onPress={() => {}}
        pressOpacityFeedback={false}
        accessibilityRole="button"
      >
        <Text style={styles.submitLabel}>List Item</Text>
      </Pressable>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    marginTop: 16,
  },
  photoBox: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  photoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  photoPreview: {
    width: '100%',
    height: 120,
  },
  photoLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  photoHelperText: {
    fontSize: 13,
    lineHeight: 18,
    color: HELPER_GRAY,
    marginTop: 6,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
  },
  inputMultiline: {
    minHeight: 120,
    paddingTop: 12,
  },
  inputTightBottom: {
    marginBottom: 0,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    color: HELPER_GRAY,
    marginTop: 6,
    marginBottom: 0,
  },
  helperTextFollowUp: {
    fontSize: 13,
    lineHeight: 18,
    color: HELPER_GRAY,
    marginTop: 10,
    marginBottom: 0,
  },
  protectionInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    marginBottom: 16,
    gap: 8,
  },
  protectionInfoIcon: {
    marginTop: 1,
  },
  protectionInfoNote: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: HELPER_GRAY,
  },
  submit: {
    width: '100%',
    marginTop: 20,
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  submitLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { BackHeader } from '@/components/AppHeaders';
import { ProtectionSummaryCard } from '@/components/ProtectionSummaryCard';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { uploadListingImage } from '@/lib/uploadListingImage';
import { calculatePreauthAmount } from '@/lib/rentalProtection';
import { useCameraSessionStore } from '@/store/cameraSessionStore';

declare const __DEV__: boolean;

const NAVY = '#0B1F3A';
const BORDER = '#E5E7EB';
const HELPER_GRAY = '#6B7280';
/** Root-stack screen: no tab navigator above; approximate space tab bar used when this lived inside tabs. */
const SCROLL_BOTTOM_TAB_CLEARANCE = 76;

type ScrollSectionKey =
  | 'photos'
  | 'name'
  | 'description'
  | 'daily'
  | 'weekly'
  | 'replacement'
  | 'lateFee'
  | 'lateCap';

export default function RentOutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const sectionScrollY = useRef<Partial<Record<ScrollSectionKey, number>>>({});
  const nameRef = useRef<TextInput>(null);
  const descRef = useRef<TextInput>(null);
  const dayRef = useRef<TextInput>(null);
  const weekRef = useRef<TextInput>(null);
  const replacementRef = useRef<TextInput>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [daily, setDaily] = useState('');
  const [weekly, setWeekly] = useState('');
  const [replacementValue, setReplacementValue] = useState('');
  const [dailyLateFee, setDailyLateFee] = useState('');
  const [maxLateFeeCap, setMaxLateFeeCap] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  /** URIs from the camera session; first is shown in the hero preview. */
  const [listingPhotoUris, setListingPhotoUris] = useState<string[]>([]);
  const previewUri = listingPhotoUris[0] ?? null;
  const prevPhotoCountRef = useRef(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const registerSectionLayout =
    (key: ScrollSectionKey) =>
    (e: LayoutChangeEvent) => {
      sectionScrollY.current[key] = e.nativeEvent.layout.y;
    };

  const scrollToSection = useCallback((key: ScrollSectionKey) => {
    const y = sectionScrollY.current[key];
    if (typeof y !== 'number' || Number.isNaN(y)) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    });
  }, []);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const h = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  useEffect(() => {
    const len = listingPhotoUris.length;
    const prevLen = prevPhotoCountRef.current;
    prevPhotoCountRef.current = len;
    if (prevLen !== 0 || len === 0) return;
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => nameRef.current?.focus(), 120);
    }, 300);
    return () => clearTimeout(id);
  }, [listingPhotoUris]);

  function resetFormState() {
    setTitle('');
    setDescription('');
    setDaily('');
    setWeekly('');
    setReplacementValue('');
    setDailyLateFee('');
    setMaxLateFeeCap('');
    setListingPhotoUris([]);
    setSubmitAttempted(false);
    prevPhotoCountRef.current = 0;
  }

  const handleSubmit = async () => {
    const photoOk = listingPhotoUris.length > 0;
    const titleOk = title.trim().length > 0;
    const dailyOk = daily.trim().length > 0;
    const replacementNum = Number(replacementValue) || 0;
    const dailyLateFeeNum = Number(dailyLateFee) || 0;
    const maxLateFeeCapNum = Number(maxLateFeeCap) || 0;
    if (!photoOk) {
      setSubmitAttempted(true);
      scrollToSection('photos');
      alert('Please add at least one photo');
      return;
    }
    if (!titleOk || !dailyOk) {
      setSubmitAttempted(true);
      if (!titleOk) {
        scrollToSection('name');
        nameRef.current?.focus();
      } else {
        scrollToSection('daily');
        dayRef.current?.focus();
      }
      alert('Please add an item name and daily price');
      return;
    }
    if (replacementNum < 0 || dailyLateFeeNum < 0 || maxLateFeeCapNum < 0) {
      alert('Protection values must be 0 or greater');
      return;
    }
    if (maxLateFeeCapNum < dailyLateFeeNum) {
      alert('Maximum late fee cap must be at least daily late fee');
      return;
    }
  
    try {
      const { supabase } = await import('@/lib/supabase');

      const uploadedImageUrls: string[] = [];
      for (const uri of listingPhotoUris) {
        try {
          const url = await uploadListingImage(uri);
          uploadedImageUrls.push(url);
        } catch (uploadErr) {
          console.error('[rent-out] image upload failed', uploadErr);
          alert('Image upload failed');
          return;
        }
      }

      if (__DEV__) {
        console.log('[rent-out] final images for insert', uploadedImageUrls);
      }

      const response = await supabase.from('listings').insert({
        title,
        description,
        daily_price: Number(daily),
        weekly_price: Number(weekly) || null,
        replacement_value: Number(replacementValue) || null,
        daily_late_fee: dailyLateFeeNum,
        max_late_fee_cap: maxLateFeeCapNum,
        images: uploadedImageUrls,
      });

      if (__DEV__) {
        console.log('FULL RESPONSE:', response);
      }

      if (response.error) {
        console.error('INSERT ERROR:', response.error);
        alert('Error: ' + response.error.message);
        return;
      }

      resetFormState();
      router.back();
    } catch (err) {
      console.error(err);
      alert('Unexpected error');
    }
  };

  const bottomPad = Math.max(16, SCROLL_BOTTOM_TAB_CLEARANCE + insets.bottom + 16);

  useFocusEffect(
    useCallback(() => {
      const { capturedPhotoUris, setCapturedPhotoUris } = useCameraSessionStore.getState();
      if (capturedPhotoUris.length === 0) return;
      setListingPhotoUris(capturedPhotoUris);
      setCapturedPhotoUris([]);
    }, [])
  );

  const goToCamera = useCallback(() => {
    if (Platform.OS === 'web') {
      document.getElementById('fileInput')?.click();
      return;
    }

    useCameraSessionStore.getState().setRentalEvidenceSession(null);
    router.push('/camera');
  }, [router]);

  const photoBorderErr = submitAttempted && listingPhotoUris.length === 0;
  const titleBorderErr = submitAttempted && !title.trim();
  const dailyBorderErr = submitAttempted && !daily.trim();

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={{ paddingBottom: bottomPad }}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <BackHeader title="List Your Equipment" onBack={() => router.back()} style={styles.rentOutHeader} />

              <View onLayout={registerSectionLayout('photos')}>
                <Text style={styles.fieldLabel}>Photos</Text>
                <Pressable
                  style={[styles.photoBox, photoBorderErr && { borderColor: ui.danger }]}
                  onPress={goToCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Add Photos"
                >
                  {previewUri != null ? (
                    <Image source={{ uri: previewUri }} style={styles.photoPreview} contentFit="cover" />
                  ) : (
                    <View style={styles.photoEmpty}>
                      <Ionicons name="camera-outline" size={32} color={ui.primary} />
                      <Text style={styles.photoLabel}>Add Photos</Text>
                    </View>
                  )}
                </Pressable>
                {Platform.OS === 'web' && (
                  <input
                    id="fileInput"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e: any) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      const uri = URL.createObjectURL(file);
                      setListingPhotoUris([uri]);
                    }}
                  />
                )}

                <Text style={styles.photoHelperText}>Clear photos help your item rent faster</Text>
              </View>

              <View onLayout={registerSectionLayout('name')}>
                <Text style={styles.fieldLabel}>Item name</Text>
                <TextInput
                  ref={nameRef}
                  style={[styles.input, titleBorderErr && { borderColor: ui.danger }]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder=""
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => descRef.current?.focus()}
                  onFocus={() => scrollToSection('name')}
                />
              </View>

              <View onLayout={registerSectionLayout('description')}>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  ref={descRef}
                  style={[styles.input, styles.inputMultiline]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder=""
                  multiline
                  textAlignVertical="top"
                  returnKeyType="default"
                  onEndEditing={() => dayRef.current?.focus()}
                  onFocus={() => scrollToSection('description')}
                />
              </View>

              <Text style={styles.sectionTitle}>Pricing</Text>

              <View onLayout={registerSectionLayout('daily')}>
                <Text style={styles.fieldLabel}>Daily price ($)</Text>
                <TextInput
                  ref={dayRef}
                  style={[styles.input, dailyBorderErr && { borderColor: ui.danger }]}
                  value={daily}
                  onChangeText={setDaily}
                  placeholder=""
                  keyboardType="numeric"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => {
                    Keyboard.dismiss();
                    requestAnimationFrame(() => weekRef.current?.focus());
                  }}
                  onFocus={() => scrollToSection('daily')}
                />
              </View>

              <View onLayout={registerSectionLayout('weekly')}>
                <Text style={styles.fieldLabel}>Weekly price ($)</Text>
                <TextInput
                  ref={weekRef}
                  style={styles.input}
                  value={weekly}
                  onChangeText={setWeekly}
                  placeholder=""
                  keyboardType="numeric"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  onFocus={() => scrollToSection('weekly')}
                />
              </View>

              <Text style={styles.sectionTitle}>Protection</Text>

              <View onLayout={registerSectionLayout('replacement')}>
                <Text style={styles.fieldLabel}>Replacement value ($)</Text>
                <TextInput
                  ref={replacementRef}
                  style={[styles.input, styles.inputTightBottom]}
                  value={replacementValue}
                  onChangeText={setReplacementValue}
                  placeholder=""
                  keyboardType="numeric"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  onFocus={() => scrollToSection('replacement')}
                />
              </View>
              <View onLayout={registerSectionLayout('lateFee')}>
                <Text style={styles.fieldLabel}>Daily late fee ($)</Text>
                <TextInput
                  style={styles.input}
                  value={dailyLateFee}
                  onChangeText={setDailyLateFee}
                  placeholder=""
                  keyboardType="numeric"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  onFocus={() => scrollToSection('lateFee')}
                />
              </View>
              <View onLayout={registerSectionLayout('lateCap')}>
                <Text style={styles.fieldLabel}>Maximum late fee cap ($)</Text>
                <TextInput
                  style={[styles.input, styles.inputTightBottom]}
                  value={maxLateFeeCap}
                  onChangeText={setMaxLateFeeCap}
                  placeholder=""
                  keyboardType="numeric"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  onFocus={() => scrollToSection('lateCap')}
                />
              </View>

            <Text style={styles.helperText}>
              {
                "Set a fair replacement value based on the item's current used condition. Excessively high values may not be fully honored."
              }
            </Text>

            <Text style={styles.helperTextFollowUp}>
              If unsure, enter an estimated used value. This helps protect both you and the renter.
            </Text>
            <View style={styles.protectionSummaryWrap}>
              <ProtectionSummaryCard
                replacementValue={Number(replacementValue) || 0}
                dailyLateFee={Number(dailyLateFee) || 0}
                maxLateFeeCap={Math.max(Number(maxLateFeeCap) || 0, Number(dailyLateFee) || 0)}
                preauthAmount={calculatePreauthAmount(Number(replacementValue) || 0)}
              />
            </View>

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
              onPress={handleSubmit}
              pressOpacityFeedback={false}
              accessibilityRole="button"
            >
              <Text style={styles.submitLabel}>List Item</Text>
            </Pressable>
            </View>
          </ScrollView>
          {keyboardVisible ? (
            <View
              style={[styles.keyboardDoneWrap, { bottom: 12 + insets.bottom }]}
              pointerEvents="box-none"
            >
              <Pressable
                onPress={() => Keyboard.dismiss()}
                accessibilityRole="button"
                accessibilityLabel="Dismiss keyboard"
                style={styles.keyboardDoneBtn}
              >
                <Text style={styles.keyboardDoneLabel}>Done</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </TouchableWithoutFeedback>
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
  headerTitleBlock: {
    marginBottom: 14,
  },
  rentOutHeader: {
    marginBottom: 14,
  },
  headerTitle: {
    marginTop: 8,
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
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  photoBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
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
  keyboardDoneWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 2,
  },
  keyboardDoneBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  keyboardDoneLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.primary,
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
  protectionSummaryWrap: {
    marginTop: 12,
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

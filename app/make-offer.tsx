import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { getAuthUserIdSync } from '@/lib/authUser';
import { formatUsd, getNumericTotalPrice, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { billingDayCountForRequest } from '@/lib/requestPriceContext';
import { isUuidString } from '@/lib/requestOwnership';
import { uploadOfferImage } from '@/lib/uploadOfferImage';
import { useCameraSessionStore } from '@/store/cameraSessionStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { addOffer, getOfferByRequestAndRenterId, posterCounterOffersRemainingForRenter, useOffersStore } from '@/store/offersStore';
import { getRequestBySupabaseId } from '@/store/requestsStore';

const THUMB = 60;
const THUMB_GAP = 8;
const PHOTO_BORDER = '#D1D5DB';
const HELPER_GRAY = '#6B7280';
const MAKE_OFFER_WEB_FILE_INPUT_ID = 'make-offer-file-input';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function MakeOfferScreen() {
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const routerNav = useRouter();
  const requestIdStr = firstParam(params.requestId);

  const request = useMemo(() => {
    if (!requestIdStr || !isUuidString(requestIdStr)) return undefined;
    return getRequestBySupabaseId(requestIdStr);
  }, [requestIdStr]);

  const offersFromStore = useOffersStore((s) => s.offers);
  const existingForThread = useMemo(() => {
    if (!request) return undefined;
    return getOfferByRequestAndRenterId(request.timestamp, getAuthUserIdSync());
  }, [offersFromStore, request]);

  const counterOfferSlots = useMemo(() => {
    if (!request) return 0;
    return posterCounterOffersRemainingForRenter(request.timestamp, getAuthUserIdSync());
  }, [offersFromStore, request]);

  const dayCount = useMemo(() => (request ? billingDayCountForRequest(request) : 1), [request]);
  const listedTotal = useMemo(() => (request ? getNumericTotalPrice(request) : null), [request]);

  const [priceDraft, setPriceDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [replacementValueDraft, setReplacementValueDraft] = useState('');
  const [deliveryFeeDraft, setDeliveryFeeDraft] = useState('');
  const [dailyLateFeeDraft, setDailyLateFeeDraft] = useState('');

  React.useEffect(() => {
    if (listedTotal != null && listedTotal > 0) setPriceDraft(sanitizeMoneyDigits(String(listedTotal)));
    else setPriceDraft('');
  }, [requestIdStr, listedTotal]);

  useFocusEffect(
    useCallback(() => {
      const { capturedPhotoUris, setCapturedPhotoUris } = useCameraSessionStore.getState();
      if (capturedPhotoUris.length === 0) return;
      void (async () => {
        setUploadingPhotos(true);
        try {
          for (const uri of capturedPhotoUris) {
            if (!uri) continue;
            const url = await uploadOfferImage(uri);
            setImages((prev) => [...prev, url]);
          }
        } catch (e) {
          console.error('[make-offer] camera session upload failed', e);
          showFeedbackToast('Could not upload one or more photos. Try again.');
        } finally {
          setUploadingPhotos(false);
          setCapturedPhotoUris([]);
        }
      })();
    }, [])
  );

  const isPoster = !!request && request.posterUserId === getAuthUserIdSync();

  const goToCamera = useCallback(() => {
    if (Platform.OS === 'web') {
      document.getElementById(MAKE_OFFER_WEB_FILE_INPUT_ID)?.click();
      return;
    }
    useCameraSessionStore.getState().setRentalEvidenceSession(null);
    routerNav.push('/camera');
  }, [routerNav]);

  const handlePickImages = async () => {
    if (Platform.OS === 'web') {
      document.getElementById(MAKE_OFFER_WEB_FILE_INPUT_ID)?.click();
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access', 'Allow photo library access in Settings to attach photos to your offer.');
      return;
    }
    setUploadingPhotos(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.85,
      });
      if (!result.canceled) {
        for (const asset of result.assets) {
          if (!asset.uri) continue;
          const url = await uploadOfferImage(asset.uri);
          setImages((prev) => [...prev, url]);
        }
      }
    } catch (e) {
      console.error('[make-offer] image upload failed', e);
      showFeedbackToast('Could not upload one or more photos. Try again.');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const onSubmit = () => {
    if (!request || !requestIdStr || isPoster) return;
    const n = parseMoneyToNumber(priceDraft);
    if (!n || n <= 0) {
      showFeedbackToast('Enter a valid offer amount');
      return;
    }

    const termsSummary = [
      replacementValueDraft.trim() ? `Replacement value: $${replacementValueDraft.trim()}` : null,
      deliveryFeeDraft.trim() ? `Delivery fee: $${deliveryFeeDraft.trim()}` : null,
      dailyLateFeeDraft.trim() ? `Daily late fee: $${dailyLateFeeDraft.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const finalMessage = [messageDraft.trim() || null, termsSummary ? `Terms (optional):\n${termsSummary}` : null]
      .filter(Boolean)
      .join('\n\n');

    void (async () => {
      const ok = await addOffer(request.timestamp, requestIdStr, {
        price: n,
        message: finalMessage || undefined,
        ...(images.length > 0 ? { offer_images: images } : {}),
      });
      if (!ok) {
        showFeedbackToast('Could not send offer. Check connection and that the request is open.');
        return;
      }
      Keyboard.dismiss();
      showFeedbackToast('Offer sent');
      routerNav.back();
    })();
  };

  if (!requestIdStr || !isUuidString(requestIdStr)) {
    return <ScreenWrapper style={styles.screenWrap}><View style={[styles.screen, styles.centered]}><Text style={styles.muted}>Invalid request.</Text></View></ScreenWrapper>;
  }
  if (!request) {
    return <ScreenWrapper style={styles.screenWrap}><View style={[styles.screen, styles.centered]}><Text style={styles.muted}>Request not found.</Text></View></ScreenWrapper>;
  }
  if (existingForThread?.status === 'pending_confirmation') {
    return <ScreenWrapper style={styles.screenWrap}><View style={[styles.screen, styles.centered]}><Text style={styles.muted}>You accepted a counter. Wait for the owner to confirm the rental. You can open this request from Activity to see the offer.</Text></View></ScreenWrapper>;
  }
  if (isPoster) {
    return <ScreenWrapper style={styles.screenWrap}><View style={[styles.screen, styles.centered]}><Text style={styles.muted}>You can’t make an offer on your own request.</Text></View></ScreenWrapper>;
  }

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenEntrance style={{ flex: 1 }}>
          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 0 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.headerTitle}>Make an Offer</Text>
            <Text style={styles.headerSub}>{String(request.toolName ?? 'Request')}</Text>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Request Summary</Text>
              <Text style={styles.summaryRow}>Requested budget: {listedTotal != null ? formatUsd(listedTotal) : '—'}</Text>
              <Text style={styles.summaryRow}>Estimated duration: {dayCount} {dayCount === 1 ? 'day' : 'days'}</Text>
              {counterOfferSlots > 0 ? <Text style={styles.summaryRow}>Counter offers left: {counterOfferSlots}</Text> : null}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.label}>Your Offer</Text>
              <Text style={styles.fieldHint}>Offer amount</Text>
              <TextInput value={priceDraft} onChangeText={(t) => setPriceDraft(sanitizeMoneyDigits(t))} keyboardType="decimal-pad" style={styles.input} {...numberPadAccessoryProps()} />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.label}>Optional Message</Text>
              <Text style={styles.fieldHint}>Short message to renter</Text>
              <TextInput value={messageDraft} onChangeText={setMessageDraft} style={[styles.input, { height: 100 }]} multiline />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>Photos</Text>
              <View style={styles.photoActionRow}>
                <Pressable style={[styles.compactBtn, uploadingPhotos && { opacity: 0.72 }]} onPress={goToCamera} disabled={uploadingPhotos}>
                  <Text style={styles.compactBtnText}>Add Photos</Text>
                </Pressable>
                <Pressable style={styles.compactBtn} onPress={handlePickImages} disabled={uploadingPhotos} pressOpacityFeedback={false}>
                  <Text style={styles.compactBtnText}>{uploadingPhotos ? 'Uploading…' : 'Library'}</Text>
                </Pressable>
              </View>
              {Platform.OS === 'web' ? (
                <input id={MAKE_OFFER_WEB_FILE_INPUT_ID} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const files = e.target.files;
                  if (!files?.length) return;
                  void (async () => {
                    setUploadingPhotos(true);
                    try {
                      for (const file of Array.from(files)) {
                        const uri = URL.createObjectURL(file);
                        const url = await uploadOfferImage(uri);
                        setImages((prev) => [...prev, url]);
                      }
                    } catch (err) {
                      console.error('[make-offer] web file upload failed', err);
                      showFeedbackToast('Could not upload one or more photos. Try again.');
                    } finally {
                      setUploadingPhotos(false);
                      e.target.value = '';
                    }
                  })();
                }} />
              ) : null}
              <Text style={styles.photoHelperText}>Photos are optional, but helpful for negotiation context.</Text>
              {images.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbStrip} contentContainerStyle={styles.thumbStripContent}>
                  {images.map((uri, i) => (
                    <View key={`${uri}-${i}`} style={styles.thumbWrap}>
                      <Pressable onPress={() => setPreviewImage(uri)} style={styles.thumbTap}>
                        <Image source={{ uri }} style={styles.thumb} contentFit="cover" transition={0} />
                      </Pressable>
                      <Pressable onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))} style={styles.thumbDelete}>
                        <Ionicons name="close" size={12} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            <View style={styles.sectionCard}>
              <Pressable style={styles.termsToggle} onPress={() => setTermsOpen((v) => !v)} pressOpacityFeedback={false}>
                <Text style={styles.sectionTitle}>Offer Details / Terms (Optional)</Text>
                <Ionicons name={termsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={ui.textSecondary} />
              </Pressable>
              {termsOpen ? (
                <View>
                  <Text style={styles.fieldHint}>Replacement value</Text>
                  <TextInput value={replacementValueDraft} onChangeText={(t) => setReplacementValueDraft(sanitizeMoneyDigits(t))} keyboardType="decimal-pad" style={styles.input} {...numberPadAccessoryProps()} />
                  {request.how === 'delivery_only' ? (
                    <>
                      <Text style={styles.fieldHint}>Delivery fee</Text>
                      <TextInput value={deliveryFeeDraft} onChangeText={(t) => setDeliveryFeeDraft(sanitizeMoneyDigits(t))} keyboardType="decimal-pad" style={styles.input} {...numberPadAccessoryProps()} />
                    </>
                  ) : null}
                  <Text style={styles.fieldHint}>Daily late fee</Text>
                  <TextInput value={dailyLateFeeDraft} onChangeText={(t) => setDailyLateFeeDraft(sanitizeMoneyDigits(t))} keyboardType="decimal-pad" style={styles.input} {...numberPadAccessoryProps()} />
                </View>
              ) : null}
            </View>

            <Pressable onPress={onSubmit} style={styles.submit}>
              <Text style={styles.submitText}>Send offer</Text>
            </Pressable>
          </ScrollView>
        </ScreenEntrance>
      </KeyboardAvoidingView>

      <Modal visible={previewImage != null} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewImage(null)}>
          {previewImage ? <Image source={{ uri: previewImage }} style={styles.previewImage} contentFit="contain" /> : null}
        </Pressable>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: { backgroundColor: ui.background },
  screen: { flex: 1, backgroundColor: ui.background },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: ui.textSecondary },
  headerTitle: { fontSize: 22, fontWeight: '700', color: ui.textPrimary },
  headerSub: { fontSize: 14, marginBottom: 12, color: ui.textSecondary },
  sectionCard: { borderWidth: StyleSheet.hairlineWidth, borderColor: ui.border, borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: ui.background },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: ui.textPrimary, marginBottom: 6 },
  summaryRow: { fontSize: 14, color: ui.textSecondary, marginBottom: 2 },
  label: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  fieldHint: { marginTop: 6, marginBottom: 8, color: ui.textSecondary, fontSize: 13 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 6 },
  photoActionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  compactBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: ui.border, backgroundColor: ui.surfaceInput },
  compactBtnText: { fontWeight: '600', color: ui.textPrimary, fontSize: 13 },
  termsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoHelperText: { fontSize: 13, lineHeight: 18, color: HELPER_GRAY, marginTop: 4, marginBottom: 8 },
  thumbStrip: { marginTop: 4, maxHeight: THUMB + 16 },
  thumbStripContent: { paddingVertical: 4, alignItems: 'center', paddingRight: 8 },
  thumbWrap: { marginRight: THUMB_GAP },
  thumbTap: { borderRadius: 8, overflow: 'hidden' },
  thumb: { width: THUMB, height: THUMB, borderRadius: 8, backgroundColor: '#1F2937' },
  thumbDelete: { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(17,24,39,0.92)', alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, padding: 10, borderRadius: 8, marginTop: 6, borderColor: PHOTO_BORDER, color: ui.textPrimary, backgroundColor: ui.surfaceInput },
  submit: { marginTop: 20, backgroundColor: ui.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  submitText: { color: 'white', fontWeight: '700' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  previewImage: { width: '100%', height: '85%' },
});

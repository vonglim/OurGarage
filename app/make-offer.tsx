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
import {
  canCreateNewOfferThreadAfterWithdraw,
  canRenterStartOrRefreshOffer,
  cooldownRemainingAfterWithdrawMs,
  formatNegotiationCooldownRemaining,
} from '@/lib/negotiationLifecycle';
import { calculateDailyLateFee } from '@/lib/dailyLateFee';
import {
  defaultNegotiationDeliveryMethodForRequest,
  formatNegotiationDeliveryFeeTermLine,
  formatNegotiationDeliveryMethodLine,
  type NegotiationDeliveryMethod,
} from '@/lib/negotiationDelivery';
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

  const [makeOfferLifecycleNow, setMakeOfferLifecycleNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setMakeOfferLifecycleNow(Date.now());
    }, [])
  );
  React.useEffect(() => {
    const id = setInterval(() => setMakeOfferLifecycleNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const makeOfferLifecycleBlock = useMemo(() => {
    const ex = existingForThread;
    if (!ex) return null;
    if (!canRenterStartOrRefreshOffer(ex)) return { kind: 'locked' as const };
    if (ex.status === 'closed') {
      const r = canCreateNewOfferThreadAfterWithdraw(ex, makeOfferLifecycleNow);
      if (!r.ok) {
        if (r.reason === 'cooldown') {
          return {
            kind: 'cooldown' as const,
            remainingMs: cooldownRemainingAfterWithdrawMs(ex, makeOfferLifecycleNow),
          };
        }
        return { kind: 'locked' as const };
      }
    }
    return null;
  }, [existingForThread, makeOfferLifecycleNow]);

  const counterOfferSlots = useMemo(() => {
    if (!request) return 0;
    return posterCounterOffersRemainingForRenter(request.timestamp, getAuthUserIdSync());
  }, [offersFromStore, request]);

  const dayCount = useMemo(() => (request ? billingDayCountForRequest(request) : 1), [request]);
  const listedTotal = useMemo(() => (request ? getNumericTotalPrice(request) : null), [request]);
  const effectiveDayCount = Math.max(1, Number.isFinite(dayCount) ? Math.round(dayCount) : 1);

  const [priceDraft, setPriceDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [brandModelDraft, setBrandModelDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [replacementValueDraft, setReplacementValueDraft] = useState('');
  const [deliveryFeeDraft, setDeliveryFeeDraft] = useState('');
  const [negotiationDeliveryMethod, setNegotiationDeliveryMethod] =
    useState<NegotiationDeliveryMethod>('pickup');

  const offerTotal = useMemo(() => {
    const n = parseMoneyToNumber(priceDraft);
    return n != null && Number.isFinite(n) && n > 0 ? n : null;
  }, [priceDraft]);
  const draftDeliveryFeeNum =
    negotiationDeliveryMethod === 'owner_delivery' ? parseMoneyToNumber(deliveryFeeDraft) ?? 0 : 0;
  const derivedDailyRate = useMemo(() => {
    if (offerTotal == null) return null;
    return offerTotal / effectiveDayCount;
  }, [offerTotal, effectiveDayCount]);
  const derivedDailyLateFee = useMemo(() => {
    if (offerTotal == null) return null;
    const basis = offerTotal + (negotiationDeliveryMethod === 'owner_delivery' ? draftDeliveryFeeNum : 0);
    return calculateDailyLateFee({
      totalAmount: basis,
      durationDays: effectiveDayCount,
    });
  }, [offerTotal, negotiationDeliveryMethod, draftDeliveryFeeNum, effectiveDayCount]);
  const totalOfferPrice = (offerTotal ?? 0) + draftDeliveryFeeNum;

  React.useEffect(() => {
    if (listedTotal != null && listedTotal > 0) setPriceDraft(sanitizeMoneyDigits(String(listedTotal)));
    else setPriceDraft('');
  }, [requestIdStr, listedTotal]);

  React.useEffect(() => {
    const replacement = Number((request as { replacementValue?: unknown } | undefined)?.replacementValue);
    setReplacementValueDraft(Number.isFinite(replacement) && replacement > 0 ? sanitizeMoneyDigits(String(replacement)) : '0');
    if (!request) return;
    setNegotiationDeliveryMethod(defaultNegotiationDeliveryMethodForRequest(request.how));
    const requestedDelivery = Number((request as { deliveryFee?: unknown }).deliveryFee);
    setDeliveryFeeDraft(
      Number.isFinite(requestedDelivery) && requestedDelivery >= 0
        ? sanitizeMoneyDigits(String(requestedDelivery))
        : '0'
    );
  }, [requestIdStr, request]);

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

    const replacementValueNum = parseMoneyToNumber(replacementValueDraft) ?? 0;
    const deliveryFeeNum =
      negotiationDeliveryMethod === 'owner_delivery' ? parseMoneyToNumber(deliveryFeeDraft) ?? 0 : 0;
    const termsSummary = [
      brandModelDraft.trim() ? `Brand and model: ${brandModelDraft.trim()}` : null,
      descriptionDraft.trim() ? `Description: ${descriptionDraft.trim()}` : null,
      `Replacement value: ${formatUsd(replacementValueNum)}`,
      formatNegotiationDeliveryMethodLine(negotiationDeliveryMethod),
      negotiationDeliveryMethod === 'owner_delivery'
        ? formatNegotiationDeliveryFeeTermLine(deliveryFeeNum)
        : null,
      `Daily late fee (auto): ${formatUsd(derivedDailyLateFee ?? 0)} (+20% of daily rate)`,
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
        negotiationDelivery: {
          method: negotiationDeliveryMethod,
          fee: negotiationDeliveryMethod === 'owner_delivery' ? deliveryFeeNum : null,
        },
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
  if (makeOfferLifecycleBlock?.kind === 'locked') {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.headerTitle}>Negotiation closed</Text>
          <Text style={[styles.muted, { marginTop: 12, textAlign: 'center', paddingHorizontal: 24 }]}>
            This request is no longer accepting offers from you.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }
  if (makeOfferLifecycleBlock?.kind === 'cooldown') {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.headerTitle}>Offer withdrawn</Text>
          <Text style={[styles.muted, { marginTop: 12, textAlign: 'center', paddingHorizontal: 24 }]}>
            You can make a new offer in{' '}
            {formatNegotiationCooldownRemaining(makeOfferLifecycleBlock.remainingMs)}.
          </Text>
        </View>
      </ScreenWrapper>
    );
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
              {request.how === 'delivery_only' ? (
                <Text style={styles.summaryRow}>
                  Requested delivery fee: {formatUsd(Number((request as { deliveryFee?: unknown }).deliveryFee ?? 0))}
                </Text>
              ) : (
                <Text style={styles.summaryRow}>Delivery: Pickup / meetup</Text>
              )}
              {counterOfferSlots > 0 ? <Text style={styles.summaryRow}>Counter offers left: {counterOfferSlots}</Text> : null}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.label}>Brand and Model</Text>
              <TextInput
                value={brandModelDraft}
                onChangeText={setBrandModelDraft}
                placeholder="e.g. DeWalt DWP611"
                placeholderTextColor={ui.textSecondary}
                style={styles.input}
              />
              <Text style={[styles.label, styles.stackedFieldLabel]}>Description</Text>
              <TextInput
                value={descriptionDraft}
                onChangeText={setDescriptionDraft}
                placeholder="Describe condition, accessories, specs, and important details."
                placeholderTextColor={ui.textSecondary}
                style={[styles.input, styles.descriptionInput]}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.label}>Offer Price</Text>
              <Text style={styles.fieldHint}>Price for entire duration</Text>
              <TextInput value={priceDraft} onChangeText={(t) => setPriceDraft(sanitizeMoneyDigits(t))} keyboardType="decimal-pad" style={styles.input} {...numberPadAccessoryProps()} />
              {offerTotal != null ? (
                <View style={styles.breakdownBox}>
                  <Text style={styles.breakdownTitle}>Offer Breakdown</Text>
                  <Text style={styles.breakdownRow}>
                    {formatUsd(offerTotal)} over {effectiveDayCount} {effectiveDayCount === 1 ? 'day' : 'days'}
                  </Text>
                  <Text style={styles.breakdownRow}>
                    Daily rate: {formatUsd(derivedDailyRate ?? 0)} / day
                  </Text>
                  <Text style={styles.breakdownRow}>
                    Late-fee daily rate (+20%): {formatUsd(derivedDailyLateFee ?? 0)} / day
                  </Text>
                </View>
              ) : (
                <Text style={styles.breakdownEmpty}>Enter an offer amount to preview daily rate and late-fee basis.</Text>
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.label}>Delivery method</Text>
              <Text style={styles.fieldHint}>Pickup vs owner-provided delivery for this offer (not inferred from the fee).</Text>
              <View style={styles.deliveryOptionsRow}>
                <Pressable
                  onPress={() => setNegotiationDeliveryMethod('pickup')}
                  style={({ pressed }) => [
                    styles.deliveryOption,
                    negotiationDeliveryMethod === 'pickup' && styles.deliveryOptionOn,
                    pressed && { opacity: 0.85 },
                  ]}
                  pressOpacityFeedback={false}
                >
                  <Text
                    style={[
                      styles.deliveryOptionText,
                      negotiationDeliveryMethod === 'pickup' && styles.deliveryOptionTextOn,
                    ]}
                  >
                    Pickup
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setNegotiationDeliveryMethod('owner_delivery')}
                  style={({ pressed }) => [
                    styles.deliveryOption,
                    negotiationDeliveryMethod === 'owner_delivery' && styles.deliveryOptionOn,
                    pressed && { opacity: 0.85 },
                  ]}
                  pressOpacityFeedback={false}
                >
                  <Text
                    style={[
                      styles.deliveryOptionText,
                      negotiationDeliveryMethod === 'owner_delivery' && styles.deliveryOptionTextOn,
                    ]}
                  >
                    Owner delivery
                  </Text>
                </Pressable>
              </View>
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
              <Text style={styles.sectionTitle}>Offer Details / Terms (Optional)</Text>
              <View>
                <Text style={styles.fieldHint}>Replacement value</Text>
                <TextInput value={replacementValueDraft} onChangeText={(t) => setReplacementValueDraft(sanitizeMoneyDigits(t))} keyboardType="decimal-pad" style={styles.input} {...numberPadAccessoryProps()} />
                {negotiationDeliveryMethod === 'owner_delivery' ? (
                  <>
                    <Text style={styles.fieldHint}>Delivery fee (0 = free delivery)</Text>
                    <TextInput value={deliveryFeeDraft} onChangeText={(t) => setDeliveryFeeDraft(sanitizeMoneyDigits(t))} keyboardType="decimal-pad" style={styles.input} {...numberPadAccessoryProps()} />
                  </>
                ) : null}
                <Text style={styles.fieldHint}>Daily late fee (automatic)</Text>
                <Text style={styles.termsInfoText}>
                  Set automatically to {formatUsd(derivedDailyLateFee ?? 0)} per day (+20% of daily rate).
                </Text>
              </View>
            </View>

            <View style={styles.totalPriceRow}>
              <Text style={styles.totalPriceLabel}>Total price</Text>
              <Text style={styles.totalPriceValue}>{formatUsd(totalOfferPrice)}</Text>
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
  stackedFieldLabel: { marginTop: 12 },
  descriptionInput: { height: 100 },
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
  breakdownBox: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 2,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 2,
  },
  breakdownRow: {
    fontSize: 12,
    lineHeight: 17,
    color: ui.textSecondary,
    fontWeight: '500',
  },
  breakdownEmpty: {
    marginTop: 9,
    fontSize: 12,
    lineHeight: 17,
    color: ui.textSecondary,
  },
  termsInfoText: {
    marginTop: 2,
    marginBottom: 2,
    fontSize: 12,
    lineHeight: 17,
    color: ui.textSecondary,
    fontWeight: '500',
  },
  totalPriceRow: {
    marginTop: 2,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPriceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  totalPriceValue: {
    fontSize: 19,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  submit: { marginTop: 20, backgroundColor: ui.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  submitText: { color: 'white', fontWeight: '700' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  previewImage: { width: '100%', height: '85%' },
  deliveryOptionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  deliveryOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PHOTO_BORDER,
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
  },
  deliveryOptionOn: {
    borderColor: ui.primary,
    backgroundColor: 'rgba(11, 31, 58, 0.06)',
  },
  deliveryOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  deliveryOptionTextOn: {
    color: ui.primary,
  },
});

import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { MakeOfferVerificationPhotosSection } from '@/components/makeOffer/MakeOfferVerificationPhotosSection';
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
import {
  defaultNegotiationDeliveryMethodForRequest,
  formatNegotiationDeliveryFeeTermLine,
  formatNegotiationDeliveryMethodLine,
  type NegotiationDeliveryMethod,
} from '@/lib/negotiationDelivery';
import { formatUsd, getNumericTotalPrice, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { calculatePreauthAmount } from '@/lib/rentalProtection';
import { billingDayCountForRequest } from '@/lib/requestPriceContext';
import { NEGOTIATION_LATE_FEE_TERMS_LINE } from '@/lib/counterOfferMessage';
import { isUuidString } from '@/lib/requestOwnership';
import {
  mockMakeOfferBrandModel,
  mockMakeOfferDeliveryFeeInput,
  mockMakeOfferDescription,
  mockMakeOfferMessage,
  mockMakeOfferNegotiationMethod,
  mockMakeOfferPriceInput,
  mockMakeOfferReplacementValueInput,
  useDevPageAutofill,
} from '@/lib/devTools';
import {
  bucketsToStoredEvidence,
  emptyOfferEvidenceBuckets,
  evidenceBucketsFromEntries,
  flattenOfferImageUrlsFromEvidence,
  getOfferEvidenceEntriesForOffer,
} from '@/lib/offerEvidencePhotos';
import type { PickupPhotoCategory } from '@/lib/pickupVerificationPhotoBuckets';
import { uploadOfferImage } from '@/lib/uploadOfferImage';
import { useCameraSessionStore } from '@/store/cameraSessionStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { addOffer, getOfferByRequestAndRenterId, posterCounterOffersRemainingForRenter, useOffersStore } from '@/store/offersStore';
import { getRequestBySupabaseId } from '@/store/requestsStore';

const PHOTO_BORDER = '#D1D5DB';
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
  const [evidenceBuckets, setEvidenceBuckets] = useState(() => emptyOfferEvidenceBuckets());
  const webEvidenceCategoryRef = useRef<PickupPhotoCategory | null>(null);
  const hydratedOfferIdRef = useRef<string | null>(null);
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
  const totalOfferPrice = (offerTotal ?? 0) + draftDeliveryFeeNum;
  const replacementValueNumForProtection = parseMoneyToNumber(replacementValueDraft) ?? 0;
  const estimatedAuthHold = useMemo(
    () => calculatePreauthAmount(replacementValueNumForProtection),
    [replacementValueNumForProtection]
  );

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

  React.useEffect(() => {
    hydratedOfferIdRef.current = null;
    setEvidenceBuckets(emptyOfferEvidenceBuckets());
  }, [requestIdStr]);

  React.useEffect(() => {
    const ex = existingForThread;
    if (!ex?.id) return;
    if (hydratedOfferIdRef.current === ex.id) return;
    const entries = getOfferEvidenceEntriesForOffer(ex);
    if (entries.length === 0) return;
    hydratedOfferIdRef.current = ex.id;
    setEvidenceBuckets(evidenceBucketsFromEntries(entries));
  }, [existingForThread?.id, existingForThread?.offer_evidence, existingForThread?.offer_images]);

  useFocusEffect(
    useCallback(() => {
      const st = useCameraSessionStore.getState();
      const { capturedPhotoUris, setCapturedPhotoUris } = st;
      if (capturedPhotoUris.length === 0) return;
      const category = st.makeOfferEvidenceCategory ?? 'item';
      void (async () => {
        setUploadingPhotos(true);
        try {
          const uploaded: string[] = [];
          for (const uri of capturedPhotoUris) {
            if (!uri) continue;
            uploaded.push(await uploadOfferImage(uri));
          }
          setEvidenceBuckets((prev) => {
            if (category === 'serial' || category === 'timestamp_proof') {
              const last = uploaded[uploaded.length - 1];
              return { ...prev, [category]: last ? [last] : [] };
            }
            return { ...prev, [category]: [...(prev[category] ?? []), ...uploaded] };
          });
        } catch (e) {
          console.error('[make-offer] camera session upload failed', e);
          showFeedbackToast('Could not upload one or more photos. Try again.');
        } finally {
          setUploadingPhotos(false);
          setCapturedPhotoUris([]);
          st.setMakeOfferEvidenceCategory(null);
        }
      })();
    }, [])
  );

  const isPoster = !!request && request.posterUserId === getAuthUserIdSync();

  const devAutofillMakeOffer = useCallback(() => {
    if (!request || !requestIdStr || isPoster) return;
    const price = mockMakeOfferPriceInput({
      listedTotal,
      requestHow: typeof request.how === 'string' ? request.how : null,
      dayCount: effectiveDayCount,
    });
    setPriceDraft(sanitizeMoneyDigits(price));
    setBrandModelDraft(mockMakeOfferBrandModel());
    setDescriptionDraft(mockMakeOfferDescription());
    setMessageDraft(mockMakeOfferMessage());
    const method = mockMakeOfferNegotiationMethod(typeof request.how === 'string' ? request.how : null);
    setNegotiationDeliveryMethod(method);
    const offerNum = parseMoneyToNumber(sanitizeMoneyDigits(price)) ?? 0;
    setReplacementValueDraft(sanitizeMoneyDigits(mockMakeOfferReplacementValueInput(offerNum)));
    if (method === 'owner_delivery') {
      setDeliveryFeeDraft(sanitizeMoneyDigits(mockMakeOfferDeliveryFeeInput()));
    } else {
      setDeliveryFeeDraft(sanitizeMoneyDigits('0'));
    }
    showFeedbackToast('Dev: offer form filled');
  }, [request, requestIdStr, isPoster, listedTotal, effectiveDayCount]);

  useDevPageAutofill(devAutofillMakeOffer, { screenLabel: 'Make offer' });

  const pickEvidenceFromLibrary = useCallback(async (category: PickupPhotoCategory) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access', 'Allow photo library access in Settings to attach photos to your offer.');
      return;
    }
    const multiple = category === 'item' || category === 'additional';
    setUploadingPhotos(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: multiple,
        quality: 0.85,
      });
      if (!result.canceled) {
        const uploaded: string[] = [];
        for (const asset of result.assets) {
          if (!asset.uri) continue;
          uploaded.push(await uploadOfferImage(asset.uri));
        }
        setEvidenceBuckets((prev) => {
          if (category === 'serial' || category === 'timestamp_proof') {
            const last = uploaded[uploaded.length - 1];
            return { ...prev, [category]: last ? [last] : [] };
          }
          return { ...prev, [category]: [...(prev[category] ?? []), ...uploaded] };
        });
      }
    } catch (e) {
      console.error('[make-offer] image upload failed', e);
      showFeedbackToast('Could not upload one or more photos. Try again.');
    } finally {
      setUploadingPhotos(false);
    }
  }, []);

  const openEvidenceAddMenu = useCallback(
    (category: PickupPhotoCategory) => {
      const runLibrary = () => {
        void pickEvidenceFromLibrary(category);
      };
      const runCamera = () => {
        const st = useCameraSessionStore.getState();
        st.setRentalEvidenceSession(null);
        st.setMakeOfferEvidenceCategory(category);
        routerNav.push('/camera');
      };
      if (Platform.OS === 'web') {
        webEvidenceCategoryRef.current = category;
        const el = document.getElementById(MAKE_OFFER_WEB_FILE_INPUT_ID) as HTMLInputElement | null;
        if (el) {
          el.multiple = category === 'item' || category === 'additional';
        }
        el?.click();
        return;
      }
      Alert.alert('Add verification photo', 'Choose a source.', [
        { text: 'Take photo', onPress: runCamera },
        { text: 'Photo library', onPress: runLibrary },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [routerNav, pickEvidenceFromLibrary]
  );

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
      NEGOTIATION_LATE_FEE_TERMS_LINE,
    ]
      .filter(Boolean)
      .join('\n');
    const finalMessage = [messageDraft.trim() || null, termsSummary ? `Terms (optional):\n${termsSummary}` : null]
      .filter(Boolean)
      .join('\n\n');

    void (async () => {
      const storedEvidence = bucketsToStoredEvidence(evidenceBuckets);
      const flatUrls = storedEvidence ? flattenOfferImageUrlsFromEvidence(storedEvidence.photos) : [];
      const ok = await addOffer(request.timestamp, requestIdStr, {
        price: n,
        message: finalMessage || undefined,
        negotiationDelivery: {
          method: negotiationDeliveryMethod,
          fee: negotiationDeliveryMethod === 'owner_delivery' ? deliveryFeeNum : null,
        },
        offer_images: flatUrls,
        offer_evidence: storedEvidence,
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
                </View>
              ) : (
                <Text style={styles.breakdownEmpty}>Enter an offer amount to preview your daily rate.</Text>
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.label}>Delivery method</Text>
              <Text style={styles.fieldHint}>
                How you’ll hand off the item. If you offer delivery, you can add a one-time logistics fee below — it’s
                optional compensation, not open-ended pricing.
              </Text>
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

            {Platform.OS === 'web' ? (
              <input
                id={MAKE_OFFER_WEB_FILE_INPUT_ID}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const files = e.target.files;
                  const category = webEvidenceCategoryRef.current ?? 'item';
                  if (!files?.length) return;
                  void (async () => {
                    setUploadingPhotos(true);
                    try {
                      const uploaded: string[] = [];
                      for (const file of Array.from(files)) {
                        const uri = URL.createObjectURL(file);
                        uploaded.push(await uploadOfferImage(uri));
                      }
                      setEvidenceBuckets((prev) => {
                        if (category === 'serial' || category === 'timestamp_proof') {
                          const last = uploaded[uploaded.length - 1];
                          return { ...prev, [category]: last ? [last] : [] };
                        }
                        return { ...prev, [category]: [...(prev[category] ?? []), ...uploaded] };
                      });
                    } catch (err) {
                      console.error('[make-offer] web file upload failed', err);
                      showFeedbackToast('Could not upload one or more photos. Try again.');
                    } finally {
                      setUploadingPhotos(false);
                      e.target.value = '';
                      webEvidenceCategoryRef.current = null;
                    }
                  })();
                }}
              />
            ) : null}
            <MakeOfferVerificationPhotosSection
              evidenceBuckets={evidenceBuckets}
              uploading={uploadingPhotos}
              onAddCategory={openEvidenceAddMenu}
              onRemove={(category, index) =>
                setEvidenceBuckets((prev) => ({
                  ...prev,
                  [category]: (prev[category] ?? []).filter((_, i) => i !== index),
                }))
              }
              onPreviewUrl={(uri) => setPreviewImage(uri)}
            />

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Protection & offer terms</Text>
              <View>
                <Text style={styles.fieldHint}>Replacement value</Text>
                <Text style={styles.termsInfoText}>
                  Fair market value if the item were lost or seriously damaged. This is the main input for estimating the
                  renter’s temporary hold — you don’t set the hold amount directly.
                </Text>
                <TextInput value={replacementValueDraft} onChangeText={(t) => setReplacementValueDraft(sanitizeMoneyDigits(t))} keyboardType="decimal-pad" style={styles.input} {...numberPadAccessoryProps()} />
                <Text style={[styles.fieldHint, styles.stackedFieldLabel]}>Estimated authorization hold</Text>
                <Text style={styles.calculatedHoldValue}>{formatUsd(estimatedAuthHold)}</Text>
                <Text style={styles.termsInfoText}>Calculated automatically from replacement value.</Text>
                <Text style={[styles.fieldHint, styles.stackedFieldLabel]}>Late fees</Text>
                <Text style={styles.termsInfoText}>Late fees are automatically calculated using platform policy.</Text>
                <Text style={styles.termsInfoSub}>Late returns may incur additional charges.</Text>
                {negotiationDeliveryMethod === 'owner_delivery' ? (
                  <>
                    <Text style={[styles.fieldHint, styles.stackedFieldLabel]}>Delivery compensation (one-time)</Text>
                    <Text style={styles.termsInfoText}>
                      Optional amount for pickup and return logistics. Enter 0 if you include delivery at no charge.
                    </Text>
                    <TextInput value={deliveryFeeDraft} onChangeText={(t) => setDeliveryFeeDraft(sanitizeMoneyDigits(t))} keyboardType="decimal-pad" style={styles.input} {...numberPadAccessoryProps()} />
                  </>
                ) : null}
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
  termsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  termsInfoSub: {
    marginTop: 2,
    marginBottom: 4,
    fontSize: 11,
    lineHeight: 16,
    color: ui.textMuted,
    fontWeight: '500',
  },
  calculatedHoldValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
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

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';

import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ui } from '@/constants/appUi';

import { getAuthUserIdSync } from '@/lib/authUser';
import {
  formatUsd,
  getNumericTotalPrice,
  parseMoneyToNumber,
  sanitizeMoneyDigits,
} from '@/lib/money';
import {
  billingDayCountForRequest,
  formatPerDayUsd,
  suggestedOfferTotalFromListed
} from '@/lib/requestPriceContext';

import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  addOffer,
  getOfferByRequestAndRenterId,
  posterCounterOffersRemainingForRenter,
  useOffersStore
} from '@/store/offersStore';

import { isUuidString } from '@/lib/requestOwnership';
import { uploadOfferImage } from '@/lib/uploadOfferImage';
import { getRequestBySupabaseId } from '@/store/requestsStore';
import { useCameraSessionStore } from '@/store/cameraSessionStore';

/** Same thumbnail geometry as `app/camera.tsx` strip. */
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
    return posterCounterOffersRemainingForRenter(
      request.timestamp,
      getAuthUserIdSync()
    );
  }, [offersFromStore, request]);

  const dayCount = useMemo(() => {
    if (!request) return 1;
    return billingDayCountForRequest(request);
  }, [request]);

  const listedTotal = useMemo(() => {
    if (!request) return null;
    return getNumericTotalPrice(request);
  }, [request]);

  const suggestedTotal = useMemo(() => {
    if (!listedTotal || listedTotal <= 0) return null;
    return suggestedOfferTotalFromListed(listedTotal);
  }, [listedTotal]);

  const [priceDraft, setPriceDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  React.useEffect(() => {
    if (suggestedTotal != null) {
      setPriceDraft(sanitizeMoneyDigits(String(suggestedTotal)));
    }
  }, [requestIdStr, suggestedTotal]);

  /** Same pattern as List Your Equipment: read multi-capture session after returning from `/camera`. */
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

  const yourOfferTotal = useMemo(
    () => parseMoneyToNumber(priceDraft),
    [priceDraft]
  );

  const yourOfferPerDayLine = useMemo(() => {
    if (!yourOfferTotal || yourOfferTotal <= 0) return 'Your offer: —';
    return `Your offer: ${formatPerDayUsd(yourOfferTotal, dayCount)}`;
  }, [yourOfferTotal, dayCount]);

  const listedLine = useMemo(() => {
    if (!listedTotal || listedTotal <= 0) return 'Listed price: —';
    return `Listed at ${formatPerDayUsd(
      listedTotal,
      dayCount
    )} (total ${formatUsd(listedTotal)})`;
  }, [listedTotal, dayCount]);

  const isPoster =
    !!request &&
    request.posterUserId === getAuthUserIdSync();

  /** Matches `app/rent-out.tsx` → `app/camera.tsx` (native); web uses multi-file input like listing but with `multiple`. */
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
      Alert.alert(
        'Photos access',
        'Allow photo library access in Settings to attach photos to your offer.'
      );
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
    if (!request || !requestIdStr) return;

    if (isPoster) return;

    const n = parseMoneyToNumber(priceDraft);
    if (!n || n <= 0) {
      showFeedbackToast('Enter a valid offer amount');
      return;
    }
    void (async () => {
      const ok = await addOffer(request.timestamp, requestIdStr, {
        price: n,
        message: messageDraft.trim() || undefined,
        ...(images.length > 0 ? { offer_images: images } : {}),
      });
      if (!ok) {
        showFeedbackToast('Could not send offer. Check connection and that the request is open.');
        return;
      }
      Keyboard.dismiss();
      showFeedbackToast('Offer sent');
      router.back();
    })();
  };

  const previewUri = images[0] ?? null;

  if (!requestIdStr || !isUuidString(requestIdStr)) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>Invalid request.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (!request) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>Request not found.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (existingForThread?.status === 'pending_confirmation') {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>
            You accepted a counter. Wait for the owner to confirm the rental. You can open this
            request from Activity to see the offer.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (isPoster) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>
            You can’t make an offer on your own request.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScreenEntrance style={{ flex: 1 }}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 0 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.headerTitle}>Make an offer</Text>
          <Text style={styles.headerSub}>
            {String(request.toolName ?? 'Request')}
          </Text>

          <Text style={styles.context}>{listedLine}</Text>
          <Text style={styles.context}>{yourOfferPerDayLine}</Text>

          <Text style={styles.label}>Your price</Text>
          <TextInput
            value={priceDraft}
            onChangeText={(t) => setPriceDraft(sanitizeMoneyDigits(t))}
            keyboardType="decimal-pad"
            style={styles.input}
            {...numberPadAccessoryProps()}
          />

          <Text style={styles.label}>Message (optional)</Text>
          <TextInput
            value={messageDraft}
            onChangeText={setMessageDraft}
            style={[styles.input, { height: 100 }]}
            multiline
          />

          <Text style={styles.fieldLabel}>Photos</Text>
          <Pressable
            style={[styles.photoBox, uploadingPhotos && { opacity: 0.72 }]}
            onPress={goToCamera}
            disabled={uploadingPhotos}
            accessibilityRole="button"
            accessibilityLabel="Add photos with camera"
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
              id={MAKE_OFFER_WEB_FILE_INPUT_ID}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
              }}
            />
          )}

          <Text style={styles.photoHelperText}>Clear photos help the owner evaluate your offer</Text>

          <Pressable
            onPress={handlePickImages}
            style={styles.chooseLibraryBtn}
            disabled={uploadingPhotos}
            pressOpacityFeedback={false}
          >
            <Text style={styles.chooseLibraryBtnText}>
              {uploadingPhotos ? 'Uploading…' : 'Choose from library'}
            </Text>
          </Pressable>

          {images.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.thumbStrip}
              contentContainerStyle={styles.thumbStripContent}
            >
              {images.map((uri, i) => (
                <Image
                  key={`${uri}-${i}`}
                  source={{ uri }}
                  style={styles.thumb}
                  contentFit="cover"
                  transition={0}
                />
              ))}
            </ScrollView>
          ) : null}

          <Pressable onPress={onSubmit} style={styles.submit}>
            <Text style={styles.submitText}>Send offer</Text>
          </Pressable>
        </ScrollView>
      </ScreenEntrance>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: { backgroundColor: ui.background },
  screen: { flex: 1, backgroundColor: ui.background },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: ui.textSecondary },

  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerSub: { fontSize: 14, marginBottom: 10 },

  context: { marginBottom: 6 },

  label: { marginTop: 16 },

  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
    marginTop: 16,
  },
  photoBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: PHOTO_BORDER,
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
    marginBottom: 10,
  },
  chooseLibraryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surfaceInput,
    marginBottom: 4,
  },
  chooseLibraryBtnText: { fontWeight: '600', color: ui.textPrimary },

  thumbStrip: {
    marginTop: 10,
    maxHeight: THUMB + 16,
  },
  thumbStripContent: {
    paddingVertical: 4,
    alignItems: 'center',
    paddingRight: 8,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    marginRight: THUMB_GAP,
    backgroundColor: '#1F2937',
  },

  input: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },

  submit: {
    marginTop: 20,
    backgroundColor: ui.primary,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitText: { color: 'white', fontWeight: '700' },
});

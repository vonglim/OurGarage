import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, TextInput } from 'react-native';
import type { ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { TOTAL_LISTING_WIZARD_STEPS } from '@/components/listingFlow/listingConstants';
import { ListingNumericKeyboardToolbarProvider } from '@/components/listingFlow/ListingNumericKeyboardToolbarContext';
import { ListingWizardChrome } from '@/components/listingFlow/ListingWizardChrome';
import {
  ListingBrandStepContent,
  ListingConditionStepContent,
  ListingHandoffStepContent,
  ListingIncludedStepContent,
  ListingLiveVerificationStepContent,
  ListingPhotosStepContent,
  ListingPricingStepContent,
  ListingProtectionStepContent,
  ListingReviewStepContent,
} from '@/components/listingFlow/listingStepsContent';
import {
  buildListingPublishPayload,
  effectiveListingTitle,
  listingLiveVerificationStepReady,
  listingPhotoSlotsPendingUpload,
  listingPhotosStepReady,
  listingWizardPublishReady,
  resolveListingRadiusMiles,
} from '@/components/listingFlow/listingCalculations';
import { applyPendingListingCaptureIfAny } from '@/components/listingFlow/listingPhotoCaptureApply';
import { emptyListingWizardDraft, type ListingWizardDraft } from '@/components/listingFlow/listingTypes';
import { ui } from '@/constants/appUi';
import { getAuthUserDisplayName, getAuthUserIdSync } from '@/lib/authUser';
import { insertPublishedListingFromBuiltRow } from '@/lib/insertPublishedListing';
import { parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { useListingsStore } from '@/store/listingsStore';

type ScreenStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export function ListingWizard() {
  const router = useRouter();
  const appendListing = useListingsStore((s) => s.appendListing);
  const searchRef = useRef<TextInput>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const publishInFlight = useRef(false);

  const [step, setStep] = useState<ScreenStep>(1);
  const [draft, setDraft] = useState<ListingWizardDraft>(() => emptyListingWizardDraft());
  const [isPublishing, setIsPublishing] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    const id = requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  const updateDraft = useCallback(
    (patch: Partial<ListingWizardDraft> | ((prev: ListingWizardDraft) => ListingWizardDraft)) => {
      setDraft((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }));
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      applyPendingListingCaptureIfAny(updateDraft, () => draftRef.current);
    }, [updateDraft])
  );

  useEffect(() => {
    if (step === 3) {
      const t = setTimeout(() => searchRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [step]);

  const titleLine = useMemo(() => effectiveListingTitle(draft), [draft]);

  const canContinue = useMemo(() => {
    switch (step) {
      case 1:
        return listingPhotosStepReady(draft);
      case 2:
        return listingLiveVerificationStepReady(draft);
      case 3:
        return titleLine.length > 0;
      case 4:
        return draft.condition != null;
      case 5:
        return true;
      case 6: {
        if (draft.serviceArea.trim().length < 2) return false;
        const deliveryish = draft.handoff === 'delivery' || draft.handoff === 'both';
        if (deliveryish) {
          const mi = resolveListingRadiusMiles(draft);
          if (!(Number.isFinite(mi) && mi >= 1)) return false;
          if (draft.deliveryFeePreset === 'custom') {
            const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.deliveryFeeCustom));
            return n != null && n >= 0;
          }
        }
        return true;
      }
      case 7: {
        const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.dailyRate));
        return n != null && n > 0;
      }
      case 8:
        return true;
      case 9: {
        if (!listingWizardPublishReady(draft)) return false;
        return (
          buildListingPublishPayload(draft, {
            ownerName: getAuthUserDisplayName(),
            ownerUserId: getAuthUserIdSync(),
          }) != null
        );
      }
      default:
        return false;
    }
  }, [step, draft, titleLine]);

  const goNext = useCallback(() => {
    if (step === 3 && titleLine && !draft.brandModelDisplay.trim()) {
      updateDraft({ brandModelDisplay: draft.brandModelQuery.trim() });
    }
    if (step < 9) {
      setStep((s) => (s + 1) as ScreenStep);
    }
  }, [step, titleLine, draft.brandModelDisplay, draft.brandModelQuery, updateDraft]);

  const goBack = useCallback(() => {
    if (isPublishing) return;
    if (step <= 1) {
      router.back();
      return;
    }
    setStep((s) => (s - 1) as ScreenStep);
  }, [step, router, isPublishing]);

  const publishListing = useCallback(async () => {
    if (publishInFlight.current) {
      return;
    }
    if (listingPhotoSlotsPendingUpload(draft).length > 0) {
      showFeedbackToast('Wait for all photos to finish uploading.');
      return;
    }
    if (!listingWizardPublishReady(draft)) {
      showFeedbackToast('Wait for uploads to finish, or fix images that are not on the server yet.');
      return;
    }
    const built = buildListingPublishPayload(draft, {
      ownerName: getAuthUserDisplayName(),
      ownerUserId: getAuthUserIdSync(),
    });
    if (built == null) {
      Alert.alert('Missing info', 'Please complete all required fields.');
      return;
    }
    publishInFlight.current = true;
    setIsPublishing(true);
    try {
      const ownerUserId = getAuthUserIdSync();
      const inserted = await insertPublishedListingFromBuiltRow(built, ownerUserId);
      if (!inserted.ok) {
        showFeedbackToast(inserted.message);
        return;
      }
      const { id, createdAtMs } = inserted;
      appendListing({
        id,
        name: built.name,
        price: built.price,
        priceUnit: built.priceUnit,
        description: built.description,
        images: built.images,
        distance: built.distance,
        meta: built.meta,
        ownerName: getAuthUserDisplayName(),
        ownerUserId: ownerUserId || undefined,
        rating: 4.8,
        createdAt: createdAtMs,
        replacementValue: built.meta.marketValue,
        listingStatus: 'active',
      });
      setDraft(emptyListingWizardDraft());
      setStep(1);
      showFeedbackToast('Listing published');
      router.replace({ pathname: '/listing-detail', params: { listingId: id } });
    } catch {
      showFeedbackToast('Could not publish. Check your connection and try again.');
    } finally {
      setIsPublishing(false);
      publishInFlight.current = false;
    }
  }, [appendListing, draft, router]);

  const onFooterPress = useCallback(() => {
    Keyboard.dismiss();
    if (!canContinue || isPublishing) return;
    if (step < 9) {
      goNext();
      return;
    }
    void publishListing();
  }, [canContinue, step, goNext, isPublishing, publishListing]);

  const onEditFromReview = useCallback((targetStep: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) => {
    setStep(targetStep);
  }, []);

  const stepProps = useMemo(
    () => ({
      draft,
      updateDraft,
      searchRef,
      onEditStep: onEditFromReview,
      ...(step >= 6 && step <= 7 ? { parentScrollRef: mainScrollRef } : {}),
    }),
    [draft, updateDraft, onEditFromReview, step]
  );

  const body = useMemo(() => {
    switch (step) {
      case 1:
        return <ListingPhotosStepContent {...stepProps} />;
      case 2:
        return <ListingLiveVerificationStepContent {...stepProps} />;
      case 3:
        return <ListingBrandStepContent {...stepProps} />;
      case 4:
        return <ListingConditionStepContent {...stepProps} />;
      case 5:
        return <ListingIncludedStepContent {...stepProps} />;
      case 6:
        return <ListingHandoffStepContent {...stepProps} />;
      case 7:
        return <ListingPricingStepContent {...stepProps} />;
      case 8:
        return <ListingProtectionStepContent {...stepProps} />;
      case 9:
        return <ListingReviewStepContent {...stepProps} />;
      default:
        return null;
    }
  }, [step, stepProps]);

  const footerLabel =
    step === 9
      ? isPublishing
        ? 'Publishing…'
        : 'Publish Listing'
      : step === 8
        ? 'Review listing'
        : 'Continue';

  const reviewMode = step === 9;
  const chromeTitle = reviewMode ? 'Review your listing' : 'Create a Listing';
  const chromeSubtitle = reviewMode
    ? 'Check everything before you publish.'
    : 'Turn your gear into storefront inventory.';

  return (
    <ScreenWrapper style={{ backgroundColor: ui.background }} innerStyle={{ flex: 1 }}>
      <ScreenEntrance style={{ flex: 1 }}>
        <ListingNumericKeyboardToolbarProvider>
          <ListingWizardChrome
            title={chromeTitle}
            subtitle={chromeSubtitle}
            stepIndex={step <= 8 ? step : TOTAL_LISTING_WIZARD_STEPS}
            totalSteps={TOTAL_LISTING_WIZARD_STEPS}
            reviewMode={reviewMode}
            publishCta={reviewMode}
            scrollViewRef={mainScrollRef}
            onBack={goBack}
            footerLabel={footerLabel}
            footerDisabled={!canContinue || isPublishing}
            onFooterPress={onFooterPress}
          >
            <Animated.View key={step} entering={FadeIn.duration(200)}>
              {body}
            </Animated.View>
          </ListingWizardChrome>
        </ListingNumericKeyboardToolbarProvider>
      </ScreenEntrance>
    </ScreenWrapper>
  );
}

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';
import { Text, TextInput } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { mapWizardDraftToAddOfferPayload } from '@/lib/makeOfferWizardSubmit';
import { parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { isUuidString } from '@/lib/requestOwnership';
import { billingDayCountForRequest } from '@/lib/requestPriceContext';
import { addOffer } from '@/store/offersStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { getRequestBySupabaseId } from '@/store/requestsStore';

import { TOTAL_WIZARD_STEPS } from './constants';
import { WizardChrome } from './WizardChrome';
import {
  AccessoriesStepContent,
  BrandModelStepContent,
  ConditionStepContent,
  DailyRateStepContent,
  DeliveryStepContent,
  MarketValueStepContent,
  OfferLiveVerificationStepContent,
  OfferSupportingPhotosStepContent,
  ReviewStepContent,
} from './stepsContent';
import { emptyWizardDraft, type WizardDraft } from './types';

type ScreenStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function MakeOfferWizard({ requestIdStr }: { requestIdStr: string | undefined }) {
  const router = useRouter();
  const searchRef = useRef<TextInput>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const submitInFlight = useRef(false);
  const [step, setStep] = useState<ScreenStep>(1);
  const [draft, setDraft] = useState<WizardDraft>(() => emptyWizardDraft());
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    const id = requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  const request = useMemo(() => {
    if (!requestIdStr || !isUuidString(requestIdStr)) return undefined;
    return getRequestBySupabaseId(requestIdStr);
  }, [requestIdStr]);

  const subtitle = useMemo(() => {
    const tool = request?.toolName;
    const raw = request?.how === 'delivery_only' ? 'delivery' : 'pickup';
    if (typeof tool === 'string' && tool.trim()) {
      return `${tool.trim()} — mock duration · ${raw}`;
    }
    return 'Equipment offer — mock duration';
  }, [request]);

  const durationDays = useMemo(() => {
    if (!request) return 3;
    return Math.max(1, Math.round(billingDayCountForRequest(request)));
  }, [request]);

  const dateRangeLabel = useMemo(() => {
    const pick = (request as { pickupDate?: string; returnDate?: string } | undefined)?.pickupDate;
    const ret = (request as { pickupDate?: string; returnDate?: string } | undefined)?.returnDate;
    if (typeof pick === 'string' && typeof ret === 'string' && pick && ret) {
      try {
        const a = new Date(pick).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const b = new Date(ret).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        return `${a} – ${b}`;
      } catch {
        /* fall through */
      }
    }
    return 'Fri, May 16 – Sun, May 18';
  }, [request]);

  useEffect(() => {
    if (step === 1) {
      const t = setTimeout(() => searchRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [step]);

  const updateDraft = useCallback((patch: Partial<WizardDraft> | ((prev: WizardDraft) => WizardDraft)) => {
    setDraft((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }));
  }, []);

  const effectiveBrandLine = useMemo(() => {
    const d = draft.brandModelDisplay.trim();
    const q = draft.brandModelQuery.trim();
    return d || q;
  }, [draft.brandModelDisplay, draft.brandModelQuery]);

  const canContinue = useMemo(() => {
    switch (step) {
      case 1:
        return effectiveBrandLine.length > 0;
      case 2:
        return draft.condition != null;
      case 3:
        return true;
      case 4:
        if (draft.deliveryMode === 'pickup') return true;
        if (draft.milesPreset === 'custom' && !draft.milesCustom.trim()) return false;
        if (draft.feePreset === 'custom') {
          const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.feeCustom));
          return n != null && n >= 0;
        }
        return true;
      case 5: {
        const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.dailyRate));
        return n != null && n > 0;
      }
      case 6: {
        const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.marketValue));
        return n != null && n > 0;
      }
      case 7:
        return true;
      case 8: {
        const v = draft.verificationPhoto;
        return !!(v?.remoteUrl && !v.uploading);
      }
      case 9:
        return true;
      default:
        return false;
    }
  }, [step, draft, effectiveBrandLine]);

  const goNext = useCallback(() => {
    if (step === 1 && effectiveBrandLine && !draft.brandModelDisplay.trim()) {
      updateDraft({ brandModelDisplay: draft.brandModelQuery.trim() });
    }
    if (step < 9) {
      setStep((s) => (s + 1) as ScreenStep);
    }
  }, [step, effectiveBrandLine, draft.brandModelDisplay, draft.brandModelQuery, updateDraft]);

  const goBack = useCallback(() => {
    if (submitting) return;
    if (step <= 1) {
      router.back();
      return;
    }
    setStep((s) => (s - 1) as ScreenStep);
  }, [step, router, submitting]);

  const submitOffer = useCallback(async () => {
    if (submitInFlight.current || !requestIdStr || !request) return;
    const ts = (request as { timestamp?: number }).timestamp;
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
      showFeedbackToast('Request data not loaded. Try again.');
      return;
    }
    const payload = mapWizardDraftToAddOfferPayload(draft, request as Record<string, unknown>);
    if (!payload) {
      showFeedbackToast('Could not build offer. Check required fields and uploads.');
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const ok = await addOffer(ts, requestIdStr, payload);
      if (ok) {
        showFeedbackToast('Offer sent');
        router.back();
      } else {
        showFeedbackToast('Could not send offer. It may already exist or the request is no longer open.');
      }
    } finally {
      setSubmitting(false);
      submitInFlight.current = false;
    }
  }, [draft, request, requestIdStr, router]);

  const onFooterPress = useCallback(() => {
    if (!canContinue || submitting) return;
    if (step < 9) {
      goNext();
      return;
    }
    void submitOffer();
  }, [canContinue, step, goNext, submitting, submitOffer]);

  const stepProps = useMemo(
    () => ({
      draft,
      updateDraft,
      durationDays,
      dateRangeLabel,
      ...(step === 3 ? { parentScrollRef: mainScrollRef } : {}),
    }),
    [draft, updateDraft, durationDays, dateRangeLabel, step]
  );

  const onEditFromReview = useCallback((targetStep: number) => {
    if (targetStep >= 1 && targetStep <= 8) {
      setStep(targetStep as ScreenStep);
    }
  }, []);

  const footerLabel =
    step === 9 ? (submitting ? 'Sending…' : 'Send offer') : step === 8 ? 'Review offer' : 'Continue';

  const body = useMemo(() => {
    switch (step) {
      case 1:
        return <BrandModelStepContent {...stepProps} searchRef={searchRef} />;
      case 2:
        return <ConditionStepContent {...stepProps} />;
      case 3:
        return <AccessoriesStepContent {...stepProps} />;
      case 4:
        return <DeliveryStepContent {...stepProps} />;
      case 5:
        return <DailyRateStepContent {...stepProps} />;
      case 6:
        return <MarketValueStepContent {...stepProps} />;
      case 7:
        return <OfferSupportingPhotosStepContent {...stepProps} />;
      case 8:
        return <OfferLiveVerificationStepContent {...stepProps} />;
      case 9:
        return <ReviewStepContent {...stepProps} onEditStep={onEditFromReview} />;
      default:
        return null;
    }
  }, [step, stepProps, onEditFromReview]);

  return (
    <ScreenWrapper style={{ backgroundColor: ui.background }} innerStyle={{ flex: 1 }}>
      <ScreenEntrance style={{ flex: 1 }}>
        <WizardChrome
          subtitle={subtitle}
          stepIndex={step <= 8 ? step : TOTAL_WIZARD_STEPS}
          totalSteps={TOTAL_WIZARD_STEPS}
          reviewMode={step === 9}
          scrollViewRef={mainScrollRef}
          onBack={goBack}
          footerLabel={footerLabel}
          footerDisabled={!canContinue || submitting}
          onFooterPress={onFooterPress}
        >
          <Animated.View key={step} entering={FadeIn.duration(200)}>
            {body}
          </Animated.View>
        </WizardChrome>
      </ScreenEntrance>
    </ScreenWrapper>
  );
}

export function MakeOfferWizardGate({ requestIdStr }: { requestIdStr: string | undefined }) {
  const rid = firstParam(requestIdStr);
  if (!rid || !isUuidString(rid)) {
    return (
      <ScreenWrapper style={{ backgroundColor: ui.background }}>
        <ScreenEntrance style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <MutedCenter text="Invalid request." />
        </ScreenEntrance>
      </ScreenWrapper>
    );
  }
  if (!getRequestBySupabaseId(rid)) {
    return (
      <ScreenWrapper style={{ backgroundColor: ui.background }}>
        <ScreenEntrance style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <MutedCenter text="Request not found in this session." />
        </ScreenEntrance>
      </ScreenWrapper>
    );
  }
  return <MakeOfferWizard requestIdStr={rid} />;
}

function MutedCenter({ text }: { text: string }) {
  return (
    <Text style={{ color: ui.textSecondary, textAlign: 'center', fontSize: 15 }}>{text}</Text>
  );
}

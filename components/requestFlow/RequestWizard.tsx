import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, TextInput } from 'react-native';
import type { ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { TOTAL_REQUEST_WIZARD_STEPS } from '@/components/requestFlow/requestConstants';
import { RequestNumericKeyboardToolbarProvider } from '@/components/requestFlow/RequestNumericKeyboardToolbarContext';
import { RequestWizardChrome } from '@/components/requestFlow/RequestWizardChrome';
import {
  RequestBudgetStepContent,
  RequestDeliveryStepContent,
  RequestDetailsStepContent,
  RequestItemSearchStepContent,
  RequestReviewStepContent,
  RequestScheduleStepContent,
} from '@/components/requestFlow/requestStepsContent';
import { emptyRequestWizardDraft, type RequestWizardDraft } from '@/components/requestFlow/requestTypes';
import {
  buildRequestAddRowFromDraft,
  durationDaysFromDraft,
  effectiveBrandLine,
  wizardDraftFromEditRequest,
} from '@/components/requestFlow/requestCalculations';
import { ui } from '@/constants/appUi';
import {
  mockRequestBudgetTotalInput,
  mockRequestEquipmentDetailSuffix,
  mockRequestEquipmentItemName,
  mockRequestPickupDateMask,
  mockRequestRadiusPresetMiles,
  mockRequestRentalArea,
  useDevPageAutofill,
} from '@/lib/devTools';
import { needsDeliveryFee } from '@/lib/deliveryFormat';
import { parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { logRequestScheduleDebug, parseUsMaskedDateToLocal } from '@/lib/requestSchedulePersistence';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { addRequest, getRequestByTimestamp, updateRequest } from '@/store/requestsStore';

type ScreenStep = 1 | 2 | 3 | 4 | 5 | 6;

function maskPickupToDate(mask: string): Date | null {
  return parseUsMaskedDateToLocal(mask.trim());
}

export function RequestWizard() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editTimestamp?: string | string[];
    prefillToolName?: string | string[];
    prefillPrice?: string | string[];
  }>();

  const searchRef = useRef<TextInput>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const submitInFlight = useRef(false);

  const [step, setStep] = useState<ScreenStep>(1);
  const [draft, setDraft] = useState<RequestWizardDraft>(() => emptyRequestWizardDraft());
  const [editingTimestamp, setEditingTimestamp] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    const id = requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  const updateDraft = useCallback((patch: Partial<RequestWizardDraft> | ((prev: RequestWizardDraft) => RequestWizardDraft)) => {
    setDraft((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }));
  }, []);

  const applyEditFormFromRequest = useCallback((req: NonNullable<ReturnType<typeof getRequestByTimestamp>>) => {
    if (req.timestamp == null) return;
    setDraft(wizardDraftFromEditRequest(req as Record<string, unknown>));
    setEditingTimestamp(req.timestamp);
  }, []);

  const devAutofillRequestEquipment = useCallback(() => {
    const name = `${mockRequestEquipmentItemName()} — ${mockRequestEquipmentDetailSuffix()}`;
    const mask = mockRequestPickupDateMask(10);
    const start = maskPickupToDate(mask);
    const radiusStr = mockRequestRadiusPresetMiles();
    let milesPreset: RequestWizardDraft['milesPreset'] = 10;
    let milesCustom = '';
    if (radiusStr === '5' || radiusStr === '10') {
      milesPreset = Number(radiusStr) as 5 | 10;
    } else {
      milesPreset = 'custom';
      milesCustom =
        radiusStr === '25' || radiusStr === '50'
          ? radiusStr
          : String(Math.min(200, Math.max(1, parseInt(radiusStr, 10) || 15)));
    }
    setDraft({
      ...emptyRequestWizardDraft(),
      brandModelQuery: name,
      brandModelDisplay: name,
      location: mockRequestRentalArea(),
      milesPreset,
      milesCustom: '',
      feePreset: 10,
      feeCustom: '',
      durationPreset: '3',
      durationCustomDays: '',
      startDate: start ?? new Date(),
      budget: mockRequestBudgetTotalInput(),
      details: '',
    });
    showFeedbackToast('Dev: request form filled');
  }, []);

  useDevPageAutofill(devAutofillRequestEquipment, { screenLabel: 'Request equipment' });

  useFocusEffect(
    useCallback(() => {
      const rawEdit = params.editTimestamp;
      const editTsStr = Array.isArray(rawEdit) ? rawEdit[0] : rawEdit;
      if (editTsStr != null && editTsStr !== '') {
        const ts = Number(editTsStr);
        if (Number.isFinite(ts)) {
          const req = getRequestByTimestamp(ts);
          if (req && !req.matched) {
            applyEditFormFromRequest(req);
          }
        }
        router.setParams({ editTimestamp: '' });
        return;
      }

      const rawName = params.prefillToolName;
      const rawPrice = params.prefillPrice;
      const nameStr = Array.isArray(rawName) ? rawName[0] : rawName;
      const priceStr = Array.isArray(rawPrice) ? rawPrice[0] : rawPrice;
      if (nameStr?.trim() || priceStr?.trim()) {
        setDraft((prev) => ({
          ...prev,
          ...(nameStr?.trim()
            ? { brandModelQuery: nameStr.trim(), brandModelDisplay: nameStr.trim() }
            : {}),
          ...(priceStr?.trim() ? { budget: sanitizeMoneyDigits(priceStr) } : {}),
        }));
        router.setParams({ prefillToolName: '', prefillPrice: '' });
      }
    }, [params.editTimestamp, params.prefillToolName, params.prefillPrice, router, applyEditFormFromRequest])
  );

  useEffect(() => {
    if (step === 1) {
      const t = setTimeout(() => searchRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [step]);

  const brandLine = useMemo(() => effectiveBrandLine(draft), [draft]);

  const canContinue = useMemo(() => {
    switch (step) {
      case 1:
        return brandLine.length > 0;
      case 2:
        if (!draft.startDate || draft.durationPreset == null) return false;
        if (draft.durationPreset === 'custom') {
          const n = parseInt(draft.durationCustomDays, 10);
          return Number.isFinite(n) && n >= 1 && n <= 30;
        }
        return durationDaysFromDraft(draft) >= 1;
      case 3: {
        if (!draft.location.trim()) return false;
        const mi =
          draft.milesPreset === 'custom'
            ? parseInt(draft.milesCustom.replace(/\D/g, ''), 10)
            : draft.milesPreset;
        if (!Number.isFinite(mi) || (mi as number) < 1) return false;
        if (draft.deliveryMode === 'delivery' && draft.feePreset === 'custom') {
          const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.feeCustom));
          return n != null && n >= 0;
        }
        return true;
      }
      case 4: {
        const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.budget));
        return n != null && n >= 0;
      }
      case 5:
        return true;
      case 6:
        return buildRequestAddRowFromDraft(draft) != null;
      default:
        return false;
    }
  }, [step, draft, brandLine]);

  const goNext = useCallback(() => {
    if (step === 1 && brandLine && !draft.brandModelDisplay.trim()) {
      updateDraft({ brandModelDisplay: draft.brandModelQuery.trim() });
    }
    if (step < 6) {
      setStep((s) => (s + 1) as ScreenStep);
    }
  }, [step, brandLine, draft.brandModelDisplay, draft.brandModelQuery, updateDraft]);

  const goBack = useCallback(() => {
    if (submitting) return;
    if (step <= 1) {
      router.back();
      return;
    }
    setStep((s) => (s - 1) as ScreenStep);
  }, [step, router, submitting]);

  const submitRequest = useCallback(async () => {
    const row = buildRequestAddRowFromDraft(draft);
    if (row == null) {
      Alert.alert('Missing info', 'Please complete all required fields.');
      return;
    }
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const payload = {
        toolName: row.toolName,
        how: row.how,
        pickupRadiusMiles: row.pickupRadiusMiles,
        durationType: row.durationType,
        durationValue: row.durationValue,
        totalPrice: row.totalPrice,
        deliveryFee: row.deliveryFee,
        location: row.location,
        requestLat: row.requestLat,
        requestLng: row.requestLng,
        pickupDate: row.pickupDate,
        returnDate: row.returnDate,
        beginAtIso: row.beginAtIso,
        returnAtIso: row.returnAtIso,
        requestNotes: row.requestNotes ?? null,
      };
      logRequestScheduleDebug('request wizard submit', payload as Record<string, unknown>);

      if (editingTimestamp != null) {
        await updateRequest(editingTimestamp, payload);
        setEditingTimestamp(null);
        setDraft(emptyRequestWizardDraft());
        setStep(1);
        showFeedbackToast('Request updated');
        router.back();
        return;
      }
      await addRequest(payload);
      showFeedbackToast('Request sent');
      router.push('/request-confirmation');
    } catch {
      Alert.alert('Could not save', 'Check your connection and try again.');
    } finally {
      setSubmitting(false);
      submitInFlight.current = false;
    }
  }, [draft, editingTimestamp, router]);

  const onFooterPress = useCallback(() => {
    Keyboard.dismiss();
    if (!canContinue || submitting) return;
    if (step < 6) {
      goNext();
      return;
    }
    void submitRequest();
  }, [canContinue, step, goNext, submitting, submitRequest]);

  const onEditFromReview = useCallback((targetStep: 1 | 2 | 3 | 4 | 5) => {
    setStep(targetStep);
  }, []);

  const stepProps = useMemo(
    () => ({
      draft,
      updateDraft,
      searchRef,
      onEditStep: onEditFromReview,
      ...(step >= 3 && step <= 5 ? { parentScrollRef: mainScrollRef } : {}),
    }),
    [draft, updateDraft, onEditFromReview, step]
  );

  const body = useMemo(() => {
    switch (step) {
      case 1:
        return <RequestItemSearchStepContent {...stepProps} />;
      case 2:
        return <RequestScheduleStepContent {...stepProps} />;
      case 3:
        return <RequestDeliveryStepContent {...stepProps} />;
      case 4:
        return <RequestBudgetStepContent {...stepProps} />;
      case 5:
        return <RequestDetailsStepContent {...stepProps} />;
      case 6:
        return <RequestReviewStepContent {...stepProps} />;
      default:
        return null;
    }
  }, [step, stepProps]);

  const footerLabel =
    step === 6 ? (submitting ? 'Posting…' : editingTimestamp != null ? 'Save changes' : 'Post request') : step === 5
      ? 'Review request'
      : 'Continue';

  const reviewMode = step === 6;
  const chromeTitle = reviewMode ? 'Review your request' : 'Request an Item';
  const chromeSubtitle = reviewMode ? 'Check your details before posting.' : 'Tell owners what you need and when.';

  return (
    <ScreenWrapper style={{ backgroundColor: ui.background }} innerStyle={{ flex: 1 }}>
      <ScreenEntrance style={{ flex: 1 }}>
        <RequestNumericKeyboardToolbarProvider>
          <RequestWizardChrome
            title={chromeTitle}
            subtitle={chromeSubtitle}
            stepIndex={step <= 5 ? step : TOTAL_REQUEST_WIZARD_STEPS}
            totalSteps={TOTAL_REQUEST_WIZARD_STEPS}
            reviewMode={reviewMode}
            scrollViewRef={mainScrollRef}
            onBack={goBack}
            footerLabel={footerLabel}
            footerDisabled={!canContinue || submitting}
            onFooterPress={onFooterPress}
          >
            <Animated.View key={step} entering={FadeIn.duration(200)}>
              {body}
            </Animated.View>
          </RequestWizardChrome>
        </RequestNumericKeyboardToolbarProvider>
      </ScreenEntrance>
    </ScreenWrapper>
  );
}

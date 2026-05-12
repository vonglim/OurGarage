import type { HowKey } from '@/lib/deliveryFormat';
import type { DurationType } from '@/lib/durationFormat';
import { needsDeliveryFee } from '@/lib/deliveryFormat';
import { getRequestEditFormValues } from '@/lib/getRequestEditFormValues';
import { parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import {
  persistedScheduleFromCalendarDates,
  validateCalendarReturnAfterPickup,
} from '@/lib/requestSchedulePersistence';
import { coordinatesFromLocationField } from '@/lib/zipCoordinates';

import { MAX_DURATION_DAYS } from './requestConstants';
import type { RequestAddRow, RequestWizardDraft } from './requestTypes';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatDateUs(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

export function durationDaysFromDraft(draft: RequestWizardDraft): number {
  switch (draft.durationPreset) {
    case '1':
      return 1;
    case 'weekend':
      return 2;
    case '3':
      return 3;
    case 'week':
      return 7;
    case 'custom': {
      const n = parseInt(draft.durationCustomDays, 10);
      if (!Number.isFinite(n) || n < 1) return 0;
      return Math.min(MAX_DURATION_DAYS, n);
    }
    default:
      return 0;
  }
}

export function resolveRequestDeliveryFee(draft: RequestWizardDraft): number {
  if (draft.deliveryMode !== 'delivery') return 0;
  if (draft.feePreset === 'free') return 0;
  if (draft.feePreset === 10) return 10;
  if (draft.feePreset === 25) return 25;
  const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.feeCustom));
  return n != null && n >= 0 ? n : 0;
}

export function resolvePickupRadiusMiles(draft: RequestWizardDraft): number {
  if (draft.milesPreset === 'custom') {
    const n = parseInt(draft.milesCustom.replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(200, n) : 0;
  }
  return draft.milesPreset;
}

export function effectiveBrandLine(draft: RequestWizardDraft): string {
  return draft.brandModelDisplay.trim() || draft.brandModelQuery.trim();
}

/**
 * Validates draft and returns a row for `addRequest` / `updateRequest`, or `null` if invalid.
 */
export function buildRequestAddRowFromDraft(draft: RequestWizardDraft): RequestAddRow | null {
  const brand = effectiveBrandLine(draft);
  if (!brand) return null;
  if (!draft.startDate) return null;
  const days = durationDaysFromDraft(draft);
  if (days < 1) return null;
  const loc = draft.location.trim();
  if (!loc) return null;

  const pickupLocal = new Date(draft.startDate);
  pickupLocal.setHours(0, 0, 0, 0);
  const returnLocal = new Date(pickupLocal.getTime() + days * MS_PER_DAY);

  const schedule = persistedScheduleFromCalendarDates(pickupLocal, returnLocal);
  const orderErr = validateCalendarReturnAfterPickup(schedule.pickupDate, schedule.returnDate);
  if (orderErr != null) return null;

  const total = parseMoneyToNumber(sanitizeMoneyDigits(draft.budget));
  if (total == null || total < 0) return null;

  const how: HowKey = draft.deliveryMode === 'delivery' ? 'delivery_only' : 'pickup_nearby';
  const mi = resolvePickupRadiusMiles(draft);
  if (!Number.isFinite(mi) || mi < 1) return null;

  const deliveryFee = needsDeliveryFee(how) ? resolveRequestDeliveryFee(draft) : null;

  const geo = coordinatesFromLocationField(loc);
  const durationType: DurationType = days > 1 ? 'multiDay' : 'fullDay';

  const notes = draft.details.trim();
  return {
    toolName: brand,
    how,
    pickupRadiusMiles: mi,
    durationType,
    durationValue: days,
    totalPrice: total,
    deliveryFee,
    location: loc,
    requestLat: geo?.lat ?? null,
    requestLng: geo?.lng ?? null,
    pickupDate: schedule.pickupDate,
    returnDate: schedule.returnDate,
    beginAtIso: schedule.beginAtIso,
    returnAtIso: schedule.returnAtIso,
    requestNotes: notes.length > 0 ? notes : null,
  };
}

function parseUsDateMask(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yyyy)) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function feePresetFromDeliveryInput(deliveryFeeInput: string): import('./requestTypes').FeePreset {
  const n = parseMoneyToNumber(sanitizeMoneyDigits(deliveryFeeInput));
  if (n === 0) return 'free';
  if (n === 10) return 10;
  if (n === 25) return 25;
  return 'custom';
}

function milesPresetAndCustomFromRadiusString(milesStr: string): {
  milesPreset: import('./requestTypes').MilesPreset;
  milesCustom: string;
} {
  const n = parseInt(milesStr, 10);
  if (n === 5) return { milesPreset: 5, milesCustom: '' };
  if (n === 10) return { milesPreset: 10, milesCustom: '' };
  if (Number.isFinite(n) && n > 0) return { milesPreset: 'custom', milesCustom: String(Math.min(200, n)) };
  return { milesPreset: 'custom', milesCustom: milesStr.trim() };
}

/** Hydrate wizard draft when editing an existing request row. */
export function wizardDraftFromEditRequest(req: Record<string, unknown>): RequestWizardDraft {
  const v = getRequestEditFormValues(req);
  const days = parseInt(v.durationDays, 10);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 1;
  let durationPreset: import('./requestTypes').RequestDurationPreset = 'custom';
  let durationCustomDays = '';
  if (safeDays === 1) durationPreset = '1';
  else if (safeDays === 2) durationPreset = 'weekend';
  else if (safeDays === 3) durationPreset = '3';
  else if (safeDays === 7) durationPreset = 'week';
  else {
    durationPreset = 'custom';
    durationCustomDays = String(safeDays);
  }

  const { milesPreset: mi, milesCustom: milesCustomFromRadius } = milesPresetAndCustomFromRadiusString(
    v.pickupRadiusMiles
  );

  const feePreset = v.how === 'delivery_only' ? feePresetFromDeliveryInput(v.deliveryFeeInput) : 10;
  const feeCustom =
    feePreset === 'custom' && v.how === 'delivery_only' ? v.deliveryFeeInput : '';

  const startDate = parseUsDateMask(v.pickupDateInput);

  const notes =
    typeof req.requestNotes === 'string' && req.requestNotes.trim() !== '' ? req.requestNotes.trim() : '';

  return {
    brandModelQuery: v.toolName,
    brandModelDisplay: v.toolName,
    startDate,
    durationPreset,
    durationCustomDays,
    deliveryMode: v.how === 'delivery_only' ? 'delivery' : 'pickup',
    milesPreset: mi,
    milesCustom: milesCustomFromRadius,
    feePreset,
    feeCustom,
    location: v.locationInput,
    budget: v.totalPriceInput,
    details: notes,
  };
}

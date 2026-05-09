import { isHowKey, type HowKey } from './deliveryFormat';
import { isDurationType, type DurationType } from './durationFormat';
import { getNumericTotalPrice, parseMoneyToNumber, sanitizeMoneyDigits } from './money';
import { formatStoredDateForRequestForm, tryParseFlexibleDateString } from './requestSchedulePersistence';

export type RequestEditFormValues = {
  toolName: string;
  when: string | null;
  how: HowKey | null;
  pickupRadiusMiles: string;
  durationType: DurationType | null;
  durationDays: string;
  totalPriceInput: string;
  deliveryFeeInput: string;
  locationInput: string;
  pickupDateInput: string;
  returnDateInput: string;
};

export function getRequestEditFormValues(req: Record<string, unknown>): RequestEditFormValues {
  return {
    toolName: String(req.toolName ?? ''),
    when:
      typeof req.when === 'string'
        ? req.when
        : typeof req.pickupDate === 'string'
          ? req.pickupDate
          : null,
    how: req.how === 'delivery_and_pickup' ? 'delivery_only' : isHowKey(req.how) ? req.how : null,
    pickupRadiusMiles:
      req.pickupRadiusMiles != null && Number.isFinite(Number(req.pickupRadiusMiles))
        ? String(Math.max(1, Math.round(Number(req.pickupRadiusMiles))))
        : '10',
    durationType:
      req.durationType === 'halfDay'
        ? 'fullDay'
        : req.durationType === 'weekly'
          ? 'multiDay'
          : isDurationType(req.durationType)
            ? req.durationType
            : null,
    durationDays: (() => {
      const pRaw =
        typeof req.pickupDate === 'string'
          ? req.pickupDate
          : typeof req.beginAtIso === 'string'
            ? req.beginAtIso
            : '';
      const rRaw =
        typeof req.returnDate === 'string'
          ? req.returnDate
          : typeof req.returnAtIso === 'string'
            ? req.returnAtIso
            : '';
      const p = tryParseFlexibleDateString(pRaw);
      const r = tryParseFlexibleDateString(rRaw);
      if (p && r) {
        const [py, pm, pd] = p.split('-').map(Number);
        const [ry, rm, rd] = r.split('-').map(Number);
        const d0 = new Date(py, pm - 1, pd);
        const d1 = new Date(ry, rm - 1, rd);
        if (d1.getTime() > d0.getTime()) {
          return String(
            Math.max(1, Math.round((d1.getTime() - d0.getTime()) / (24 * 60 * 60 * 1000)))
          );
        }
      }
      if (
        req.durationType === 'multiDay' &&
        req.durationValue != null &&
        Number.isFinite(Number(req.durationValue))
      ) {
        return String(Math.round(Number(req.durationValue)));
      }
      return '';
    })(),
    totalPriceInput: (() => {
      const tp = getNumericTotalPrice(req as Parameters<typeof getNumericTotalPrice>[0]);
      return tp != null && tp >= 0 ? sanitizeMoneyDigits(String(tp)) : '';
    })(),
    deliveryFeeInput: (() => {
      const df =
        typeof req.deliveryFee === 'number' && Number.isFinite(req.deliveryFee)
          ? req.deliveryFee
          : parseMoneyToNumber(String(req.deliveryFee ?? ''));
      return df != null && df >= 0 ? sanitizeMoneyDigits(String(df)) : '';
    })(),
    locationInput: req.location != null ? String(req.location) : '',
    pickupDateInput: formatStoredDateForRequestForm(
      typeof req.pickupDate === 'string'
        ? req.pickupDate
        : typeof req.beginAtIso === 'string'
          ? req.beginAtIso.slice(0, 10)
          : ''
    ),
    returnDateInput: formatStoredDateForRequestForm(
      typeof req.returnDate === 'string'
        ? req.returnDate
        : typeof req.returnAtIso === 'string'
          ? req.returnAtIso.slice(0, 10)
          : ''
    ),
  };
}

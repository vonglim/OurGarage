import { isHowKey, type HowKey } from './deliveryFormat';
import { isDurationType, type DurationType } from './durationFormat';
import { getNumericTotalPrice, parseMoneyToNumber, sanitizeMoneyDigits } from './money';

export type RequestEditFormValues = {
  toolName: string;
  when: string | null;
  how: HowKey | null;
  pickupRadiusMiles: string;
  durationType: DurationType | null;
  durationDays: string;
  durationWeeks: string;
  totalPriceInput: string;
  deliveryFeeInput: string;
  locationInput: string;
};

export function getRequestEditFormValues(req: Record<string, unknown>): RequestEditFormValues {
  return {
    toolName: String(req.toolName ?? ''),
    when: typeof req.when === 'string' ? req.when : null,
    how: isHowKey(req.how) ? req.how : null,
    pickupRadiusMiles:
      req.pickupRadiusMiles != null && Number.isFinite(Number(req.pickupRadiusMiles))
        ? String(Math.max(1, Math.round(Number(req.pickupRadiusMiles))))
        : '10',
    durationType: isDurationType(req.durationType) ? req.durationType : null,
    durationDays:
      req.durationType === 'multiDay' &&
      req.durationValue != null &&
      Number.isFinite(Number(req.durationValue))
        ? String(Math.round(Number(req.durationValue)))
        : '',
    durationWeeks:
      req.durationType === 'weekly' &&
      req.durationValue != null &&
      Number.isFinite(Number(req.durationValue))
        ? String(Math.round(Number(req.durationValue)))
        : '',
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
  };
}

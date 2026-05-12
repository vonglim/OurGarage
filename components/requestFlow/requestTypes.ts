import type { HowKey } from '@/lib/deliveryFormat';
import type { DurationType } from '@/lib/durationFormat';

export type RequestDurationPreset = '1' | 'weekend' | '3' | 'week' | 'custom' | null;

export type RequestDeliveryMode = 'pickup' | 'delivery';

/** UI presets are 5 / 10 / custom; legacy rows with 25 mi hydrate as custom + "25". */
export type MilesPreset = 5 | 10 | 'custom';
export type FeePreset = 'free' | 10 | 25 | 'custom';

export type RequestWizardDraft = {
  brandModelQuery: string;
  brandModelDisplay: string;
  startDate: Date | null;
  durationPreset: RequestDurationPreset;
  durationCustomDays: string;
  deliveryMode: RequestDeliveryMode;
  milesPreset: MilesPreset;
  milesCustom: string;
  feePreset: FeePreset;
  feeCustom: string;
  location: string;
  budget: string;
  details: string;
};

export function emptyRequestWizardDraft(): RequestWizardDraft {
  return {
    brandModelQuery: '',
    brandModelDisplay: '',
    startDate: null,
    durationPreset: null,
    durationCustomDays: '',
    deliveryMode: 'pickup',
    milesPreset: 10,
    milesCustom: '',
    feePreset: 10,
    feeCustom: '',
    location: '',
    budget: '',
    details: '',
  };
}

/** Row shape merged into store / passed to `addRequest` (matches legacy request screen). */
export type RequestAddRow = {
  toolName: string;
  how: HowKey;
  pickupRadiusMiles: number;
  durationType: DurationType;
  durationValue: number;
  totalPrice: number;
  deliveryFee: number | null;
  location: string;
  requestLat: number | null;
  requestLng: number | null;
  pickupDate: string;
  returnDate: string;
  beginAtIso: string;
  returnAtIso: string;
  requestNotes?: string | null;
};

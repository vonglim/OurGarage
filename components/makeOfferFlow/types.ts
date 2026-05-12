export type ConditionOption = 'excellent' | 'good' | 'fair';

export type DeliveryMode = 'pickup' | 'delivery';

export type MilesPreset = 5 | 10 | 25 | 'custom';
export type FeePreset = 'free' | 10 | 25 | 'custom';

/** Step 7 — local preview + `listing-images` upload via `uploadOfferImage`. */
export type WizardPhotoSlot = {
  localUri: string;
  remoteUrl: string | null;
  uploading: boolean;
};

export type WizardDraft = {
  brandModelQuery: string;
  /** User-confirmed line (tap suggestion or Continue with typed text) */
  brandModelDisplay: string;
  condition: ConditionOption | null;
  accessories: string[];
  deliveryMode: DeliveryMode;
  milesPreset: MilesPreset;
  milesCustom: string;
  feePreset: FeePreset;
  feeCustom: string;
  dailyRate: string;
  marketValue: string;
  /** Required — single verification image (uploaded). */
  verificationPhoto: WizardPhotoSlot | null;
  /** Recommended — up to 5 item photos. */
  itemPhotos: WizardPhotoSlot[];
  /** Optional — up to 2 serial/model photos. */
  serialPhotos: WizardPhotoSlot[];
};

export function emptyWizardDraft(): WizardDraft {
  return {
    brandModelQuery: '',
    brandModelDisplay: '',
    condition: null,
    accessories: [],
    deliveryMode: 'pickup',
    milesPreset: 10,
    milesCustom: '',
    feePreset: 10,
    feeCustom: '',
    dailyRate: '',
    marketValue: '',
    verificationPhoto: null,
    itemPhotos: [],
    serialPhotos: [],
  };
}

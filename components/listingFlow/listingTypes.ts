/** Local slot — same shape as offer wizard photos (`uploadOfferImage` → `listing-images`). */
export type ListingPhotoSlot = {
  localUri: string;
  remoteUrl: string | null;
  uploading: boolean;
};

export type ListingCondition = 'excellent' | 'good' | 'fair' | 'heavy_use';

/** How renters obtain the item */
export type ListingHandoff = 'pickup_only' | 'delivery' | 'both';

export type MilesPreset = 5 | 10 | 'custom';
export type FeePreset = 'free' | 10 | 25 | 'custom';

export type ListingWizardDraft = {
  coverPhoto: ListingPhotoSlot | null;
  galleryPhotos: ListingPhotoSlot[];
  brandModelQuery: string;
  brandModelDisplay: string;
  category: string;
  condition: ListingCondition | null;
  conditionNotes: string;
  included: string[];
  handoff: ListingHandoff;
  milesPreset: MilesPreset;
  milesCustom: string;
  deliveryFeePreset: FeePreset;
  deliveryFeeCustom: string;
  serviceArea: string;
  dailyRate: string;
  marketValue: string;
  verificationSerial: ListingPhotoSlot | null;
  verificationCondition: ListingPhotoSlot | null;
  verificationReceipt: ListingPhotoSlot | null;
};

export function emptyListingWizardDraft(): ListingWizardDraft {
  return {
    coverPhoto: null,
    galleryPhotos: [],
    brandModelQuery: '',
    brandModelDisplay: '',
    category: '',
    condition: null,
    conditionNotes: '',
    included: [],
    handoff: 'pickup_only',
    milesPreset: 10,
    milesCustom: '',
    deliveryFeePreset: 10,
    deliveryFeeCustom: '',
    serviceArea: '',
    dailyRate: '',
    marketValue: '',
    verificationSerial: null,
    verificationCondition: null,
    verificationReceipt: null,
  };
}

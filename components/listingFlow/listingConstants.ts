/** Progress accent — aligned with Offer / Request wizards */
export {
  MAO_PROGRESS_GREEN as LISTING_PROGRESS_GREEN,
  MAO_PROGRESS_TRACK as LISTING_TRACK,
} from '@/components/makeOfferFlow/constants';

export const TOTAL_LISTING_WIZARD_STEPS = 7;
/** Total photos (cover + additional) allowed in listing wizard step 1. */
export const MAX_LISTING_TOTAL_PHOTOS = 10;
/** Max gallery slots when cover uses one slot (cover + gallery ≤ MAX_LISTING_TOTAL_PHOTOS). */
export const MAX_LISTING_GALLERY_SLOTS = MAX_LISTING_TOTAL_PHOTOS - 1;
export const MAX_CONDITION_NOTES = 500;

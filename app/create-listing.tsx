/**
 * LEGACY route — superseded by ListingWizard (`app/listing.tsx`, `@/components/listingFlow`).
 * Implementation preserved in `components/legacy/CreateListingScreenLegacy.tsx`.
 * Deep links to `/create-listing` redirect to the new listing flow.
 */
import { Redirect } from 'expo-router';

export default function CreateListingLegacyRedirect() {
  return <Redirect href="/listing" />;
}

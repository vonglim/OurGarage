/**
 * LEGACY route — superseded by ListingWizard (`app/listing.tsx`, `@/components/listingFlow`).
 * Implementation preserved in `components/legacy/RentOutScreenLegacy.tsx`.
 * Deep links to `/rent-out` redirect to the new listing flow.
 */
import { Redirect } from 'expo-router';

export default function RentOutLegacyRedirect() {
  return <Redirect href="/listing" />;
}

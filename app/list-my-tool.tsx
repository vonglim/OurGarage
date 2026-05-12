/**
 * LEGACY route — superseded by ListingWizard (`app/listing.tsx`, `@/components/listingFlow`).
 * Implementation preserved in `components/legacy/ListMyToolScreenLegacy.tsx`.
 * Deep links to `/list-my-tool` redirect to the new listing flow.
 */
import { Redirect } from 'expo-router';

export default function ListMyToolLegacyRedirect() {
  return <Redirect href="/listing" />;
}

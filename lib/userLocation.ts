import { getCoordinatesForZip } from './zipCoordinates';

/** Hardcoded “you” until accounts / device location exist */
export const CURRENT_USER_ZIP = '20850';

/**
 * Approximate area string for request/browse flows (zip maps via `ZIP_COORDINATES`).
 * Not a street address — safe to show in “use current location” UX until device GPS exists.
 */
export function getApproximateLocationZipForRequest(): string {
  return CURRENT_USER_ZIP;
}

export function getCurrentUserCoordinates(): { lat: number; lng: number } {
  return getCoordinatesForZip(CURRENT_USER_ZIP) ?? { lat: 39.1, lng: -77.2 };
}

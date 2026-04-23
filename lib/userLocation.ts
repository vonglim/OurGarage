import { getCoordinatesForZip } from './zipCoordinates';

/** Hardcoded “you” until accounts / device location exist */
export const CURRENT_USER_ZIP = '20850';

export function getCurrentUserCoordinates(): { lat: number; lng: number } {
  return getCoordinatesForZip(CURRENT_USER_ZIP) ?? { lat: 39.1, lng: -77.2 };
}

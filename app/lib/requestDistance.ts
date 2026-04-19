import { haversineMiles } from './haversine';
import { getCurrentUserCoordinates } from './userLocation';

/** Above this, show "Far away" instead of an exact mile count. */
export const DISTANCE_DISPLAY_FAR_THRESHOLD_MI = 100;

/**
 * Short distance for lists (e.g. "2.4 mi", "Far away", or `nullLabel` when unknown).
 */
export function formatMilesShort(
  miles: number | null | undefined,
  nullLabel = 'Nearby'
): string {
  if (miles == null || !Number.isFinite(miles)) return nullLabel;
  if (miles > DISTANCE_DISPLAY_FAR_THRESHOLD_MI) return 'Far away';
  const rounded = Math.round(miles * 10) / 10;
  return `${rounded.toFixed(1)} mi`;
}

/** Listing copy: "2.4 mi away" or "Far away". */
export function formatListingDistanceAway(miles: number): string {
  if (!Number.isFinite(miles)) return '—';
  if (miles > DISTANCE_DISPLAY_FAR_THRESHOLD_MI) return 'Far away';
  const rounded = Math.round(miles * 10) / 10;
  return `${rounded.toFixed(1)} mi away`;
}

export function milesFromViewerToRequest(req: {
  requestLat?: unknown;
  requestLng?: unknown;
}): number | null {
  const lat = Number(req.requestLat);
  const lng = Number(req.requestLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const user = getCurrentUserCoordinates();
  return haversineMiles(user, { lat, lng });
}

/** Human-readable distance from hardcoded user to request (no “~” when real). */
export function formatDistanceFromYou(req: {
  requestLat?: unknown;
  requestLng?: unknown;
}): string {
  const mi = milesFromViewerToRequest(req);
  if (mi == null) return '~ nearby';
  if (mi > DISTANCE_DISPLAY_FAR_THRESHOLD_MI) return 'Far away';
  const rounded = Math.round(mi * 10) / 10;
  return `${rounded.toFixed(1)} miles away`;
}

import { haversineMiles } from './haversine';
import { getCurrentUserCoordinates } from './userLocation';

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
  const rounded = Math.round(mi * 10) / 10;
  return `${rounded.toFixed(1)} miles away`;
}

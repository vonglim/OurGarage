/** Small built-in map — extend as needed. No network calls. */
export const ZIP_COORDINATES: Record<string, { lat: number; lng: number }> = {
  '20850': { lat: 39.1, lng: -77.2 },
  '10001': { lat: 40.7506, lng: -73.9971 },
  '60614': { lat: 41.9239, lng: -87.6389 },
  '90210': { lat: 34.0901, lng: -118.4065 },
  '94102': { lat: 37.7749, lng: -122.4194 },
  '30309': { lat: 33.7634, lng: -84.3851 },
};

export function extractZipFromLocation(location: string): string | null {
  const m = String(location).trim().match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

export function getCoordinatesForZip(zip: string): { lat: number; lng: number } | null {
  const z = zip.trim();
  return ZIP_COORDINATES[z] ?? null;
}

export function coordinatesFromLocationField(
  location: string
): { lat: number; lng: number } | null {
  const zip = extractZipFromLocation(location);
  if (!zip) return null;
  return getCoordinatesForZip(zip);
}

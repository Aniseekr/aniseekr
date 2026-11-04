export const LEGACY_SPOT_MATCH_RADIUS_METERS = 50;

/** Pure safety net shared by legacy migration and stale Atlas spot references. */
export function rehomeNearestSpot<
  T extends {
    id: string;
    location?: { lat: number; lon: number } | null;
    lat?: number | null;
    lon?: number | null;
  },
>(geo: readonly [number, number] | null | undefined, spots: readonly T[]): T | null {
  if (!geo || !Number.isFinite(geo[0]) || !Number.isFinite(geo[1])) return null;

  let nearest: T | null = null;
  let nearestDistance = LEGACY_SPOT_MATCH_RADIUS_METERS;
  for (const spot of spots) {
    const lat = spot.location?.lat ?? spot.lat;
    const lon = spot.location?.lon ?? spot.lon;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    const distance = haversineMeters(geo[0], geo[1], lat, lon);
    if (distance <= nearestDistance) {
      nearest = spot;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLon = (lon2 - lon1) * radians;
  const a = Math.min(
    1,
    Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLon / 2) ** 2
  );
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

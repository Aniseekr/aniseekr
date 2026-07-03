// Nearest-neighbor ordering for a pilgrimage trip. Pure + deterministic so the
// plan / trip screens can compute a "walk order" off the render path (Rule 9)
// and unit-test it. Greedy NN is intentionally the whole strategy — spec 4.5's
// 不做清單 rules out AI scheduling / manual drag-sort until asked.

export interface OrderableSpot {
  id: string;
  geo: readonly [number, number];
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km between two [lat, lng] pairs. */
export function haversineKm(
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Order spots by walking-nearest chain starting from `start`. `start === null`
 * (no location permission / unknown) → keep the original order as a fresh copy.
 */
export function orderSpotsByNearestNeighbor<T extends OrderableSpot>(
  spots: readonly T[],
  start: { latitude: number; longitude: number } | null
): T[] {
  if (start === null) return [...spots];
  const remaining = [...spots];
  const ordered: T[] = [];
  let cursor: readonly [number, number] = [start.latitude, start.longitude];
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cursor, remaining[i].geo);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    cursor = next.geo;
  }
  return ordered;
}

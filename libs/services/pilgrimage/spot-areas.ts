// Grid-cluster AnitabiSpots into geographic areas for the detail list's
// "○○一帶" sections. Honest by construction (CLAUDE.md Rule 8): an area carries
// no place name — the caller labels it "Area N (count)". A ~cellKm grid bucket
// is enough to make a 600-point anime feel like a handful of neighbourhoods.
import type { AnitabiSpot } from './types';

export interface SpotAreaBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}
export interface SpotArea {
  /** `area:${gridKey}` — stable, not a place name. */
  id: string;
  center: { lat: number; lng: number };
  /** Fed to MapSurfaceHandle.fitBounds (structurally BBox). */
  bounds: SpotAreaBounds;
  /** Input order preserved within an area. */
  spots: AnitabiSpot[];
}

const KM_PER_DEG_LAT = 111;

function hasGeo(geo: readonly [number, number]): boolean {
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

export function groupSpotsIntoAreas(
  spots: readonly AnitabiSpot[],
  opts: { cellKm?: number } = {}
): SpotArea[] {
  const cellKm = opts.cellKm ?? 2;
  const stepDeg = cellKm / KM_PER_DEG_LAT;
  const order: string[] = [];
  const buckets = new Map<string, AnitabiSpot[]>();

  for (const s of spots) {
    if (!hasGeo(s.geo)) continue;
    const [lat, lng] = s.geo;
    const latIdx = Math.floor(lat / stepDeg);
    // cos-correct lng so a 2km cell is ~2km E–W too (not stretched at 35°N).
    // Derived from the *lat bucket's* center rather than each point's own lat
    // — otherwise two points sharing a lat bucket can still get slightly
    // different lngStep values, and floor() amplifies that mismatch at
    // longitude ~139° into a spurious bucket split.
    const latBucketCenter = (latIdx + 0.5) * stepDeg;
    const lngStep = stepDeg / Math.max(0.2, Math.cos((latBucketCenter * Math.PI) / 180));
    const key = `${latIdx}:${Math.floor(lng / lngStep)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(s);
    else {
      buckets.set(key, [s]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const members = buckets.get(key)!;
    let south = Infinity;
    let west = Infinity;
    let north = -Infinity;
    let east = -Infinity;
    let sumLat = 0;
    let sumLng = 0;
    for (const m of members) {
      const [lat, lng] = m.geo;
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      sumLat += lat;
      sumLng += lng;
    }
    return {
      id: `area:${key}`,
      center: { lat: sumLat / members.length, lng: sumLng / members.length },
      bounds: { south, west, north, east },
      spots: members,
    };
  });
}

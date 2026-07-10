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

/** Detail list row: an area section header (1-indexed, precomputed so the
 * renderer never rescans prior rows) or a spot. */
export type SpotAreaRow =
  | { kind: 'header'; area: SpotArea; areaNumber: number }
  | { kind: 'spot'; spot: AnitabiSpot };

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

/**
 * Compose the detail list's rows-mode row sequence from the full spot list
 * and its area grouping. PURE + unit-testable (CLAUDE.md Rule 8/9).
 *
 * With <2 areas the split isn't worth a header — return every spot flat, in
 * input order (`spots`, not the areas, so geo-less spots are included too).
 *
 * With ≥2 areas, section by area — but `groupSpotsIntoAreas` silently drops
 * spots with no usable geo (they can't be bucketed). Those spots are a real,
 * expected state (SpotRow already renders them, just with maps disabled),
 * not an error — so they're appended after every area section as plain
 * trailing rows (no header: we have no honest name for "no area").
 *
 * Invariant: the returned row list contains exactly one `spot` row per input
 * spot — nothing is ever dropped.
 */
export function composeAreaRows(
  spots: readonly AnitabiSpot[],
  areas: readonly SpotArea[]
): SpotAreaRow[] {
  if (areas.length < 2) {
    return spots.map((spot) => ({ kind: 'spot', spot }) as SpotAreaRow);
  }
  const rows: SpotAreaRow[] = [];
  const placed = new Set<string>();
  areas.forEach((area, i) => {
    rows.push({ kind: 'header', area, areaNumber: i + 1 });
    for (const spot of area.spots) {
      rows.push({ kind: 'spot', spot });
      placed.add(spot.id);
    }
  });
  for (const spot of spots) {
    if (!placed.has(spot.id)) rows.push({ kind: 'spot', spot });
  }
  return rows;
}

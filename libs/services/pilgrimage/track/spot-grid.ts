// Which spots is a GPS point standing at? A coarse lat/lon grid over the Atlas
// spot index, so each recorded point checks a handful of spots, not 12,000.
import type { AtlasSpotLiteRow } from '../atlas/types';
import { distanceMeters } from '../stamp-grade';

export interface GridSpot {
  id: string;
  workKey: string;
  name: string;
  lat: number;
  lon: number;
}

export interface SpotGrid {
  cells: Map<string, GridSpot[]>;
  size: number;
}

/** How close a recorded point must pass to count as being at the spot. */
export const TRACK_STAMP_RADIUS_METERS = 50;

/** ~220 m of latitude; a 50 m search never reaches past the neighbouring cells. */
const CELL_DEG = 0.002;

const cellOf = (value: number) => Math.floor(value / CELL_DEG);

export function buildSpotGrid(rows: readonly AtlasSpotLiteRow[]): SpotGrid {
  const cells = new Map<string, GridSpot[]>();
  let size = 0;
  for (const [id, workKey, name, lat, lon] of rows) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const key = `${cellOf(lat)}:${cellOf(lon)}`;
    const cell = cells.get(key);
    const spot = { id, workKey, name, lat, lon };
    if (cell) cell.push(spot);
    else cells.set(key, [spot]);
    size += 1;
  }
  return { cells, size };
}

/** Spots within `radiusMeters` of the point, nearest first. */
export function spotsWithin(
  grid: SpotGrid,
  lat: number,
  lon: number,
  radiusMeters: number = TRACK_STAMP_RADIUS_METERS
): GridSpot[] {
  const here = { latitude: lat, longitude: lon };
  const hits: { spot: GridSpot; d: number }[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (const spot of grid.cells.get(`${cellOf(lat) + dy}:${cellOf(lon) + dx}`) ?? []) {
        const d = distanceMeters(here, { latitude: spot.lat, longitude: spot.lon });
        if (d <= radiusMeters) hits.push({ spot, d });
      }
    }
  }
  return hits.sort((a, b) => a.d - b.d).map((hit) => hit.spot);
}

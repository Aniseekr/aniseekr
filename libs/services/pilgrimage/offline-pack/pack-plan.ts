// Which map tiles an offline trip pack downloads for one work's spots.
//
// The tiles come from OpenFreeMap, whose Terms of Service (openfreemap.org/tos,
// updated 2026-10-14) allow in-app offline downloads only when each download
// is at most 3,000 tiles or 50 MB, uses at most 4 parallel requests and sends
// a User-Agent that identifies the app. The plan enforces the tile count here;
// the byte cap and parallelism are enforced by `tile-download.ts`.

export const PACK_LIMITS = {
  maxTiles: 3000,
  maxBytes: 50_000_000,
  maxParallel: 4,
} as const;

/** OpenMapTiles vector tiles stop at z14; MapLibre overzooms past it. */
export const PACK_MAX_ZOOM = 14;

/**
 * Mean gzip transfer size of 12 OpenFreeMap tiles sampled 2026-11-05 at
 * z8/z10/z12/z14 over Takayama, Shinjuku and Lake Motosu (6 KB rural z14 to
 * 400 KB central-Tokyo z14). Only used for the "about N MB" estimate shown
 * before a download; the real size is measured while downloading.
 */
export const ESTIMATED_TILE_BYTES = 117_000;

export interface TileId {
  z: number;
  x: number;
  y: number;
}

export interface PackTilePlan {
  tiles: TileId[];
  locatedSpots: number;
}

interface SpotLike {
  lat: number | null;
  lon: number | null;
}

const OVERVIEW_ZOOMS = [5, 6, 7, 8];
const OVERVIEW_MAX_TILES_PER_ZOOM = 64;
/** Walking radius kept around each spot, per zoom. */
const SPOT_RINGS: readonly { z: number; radiusM: number }[] = [
  { z: 9, radiusM: 6000 },
  { z: 10, radiusM: 4000 },
  { z: 11, radiusM: 2500 },
  { z: 12, radiusM: 1500 },
  { z: 13, radiusM: 900 },
  { z: 14, radiusM: 500 },
];
/** Radius scales tried, widest first, until the plan fits the tile limit. */
const RADIUS_SCALES = [1, 0.6, 0.35, 0.15, 0];
const MAX_LAT = 85.0511;
const METERS_PER_DEG_LAT = 111_320;

export function tileAt(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1) };
}

export function planPackTiles(spots: readonly SpotLike[]): PackTilePlan {
  const located = spots.filter(hasUsableGeo);
  if (located.length === 0) return { tiles: [], locatedSpots: 0 };

  // Street-level tile under every spot is never dropped.
  const required = new Map<string, TileId>();
  for (const spot of located) addTile(required, PACK_MAX_ZOOM, tileAt(spot.lat, spot.lon, PACK_MAX_ZOOM));
  const overview = overviewTiles(located);

  let best: Map<string, TileId> | null = null;
  for (const scale of RADIUS_SCALES) {
    const set = new Map(required);
    for (const [key, tile] of overview) set.set(key, tile);
    for (const spot of located) {
      for (const ring of SPOT_RINGS) addRadius(set, spot, ring.z, ring.radiusM * scale);
    }
    best = set;
    if (set.size <= PACK_LIMITS.maxTiles) break;
  }

  let tiles = [...(best ?? required).values()];
  if (tiles.length > PACK_LIMITS.maxTiles) {
    // Even the bare per-spot tiles overflow: keep z14 first, then the
    // highest zooms that still fit (cheapest coverage loss for walking).
    const rest = tiles
      .filter((t) => !required.has(keyOf(t)))
      .sort((a, b) => b.z - a.z);
    const room = Math.max(0, PACK_LIMITS.maxTiles - required.size);
    tiles = [...required.values()].slice(0, PACK_LIMITS.maxTiles).concat(rest.slice(0, room));
  }
  tiles.sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
  return { tiles, locatedSpots: located.length };
}

export function estimatePackBytes(tileCount: number, dataBytes: number): number {
  return Math.min(PACK_LIMITS.maxBytes, tileCount * ESTIMATED_TILE_BYTES) + dataBytes;
}

function overviewTiles(located: readonly { lat: number; lon: number }[]): Map<string, TileId> {
  const out = new Map<string, TileId>();
  const lats = located.map((s) => s.lat);
  const lons = located.map((s) => s.lon);
  const north = Math.max(...lats);
  const south = Math.min(...lats);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  for (const z of OVERVIEW_ZOOMS) {
    const a = tileAt(north, west, z);
    const b = tileAt(south, east, z);
    const count = (b.x - a.x + 1) * (b.y - a.y + 1);
    if (count > OVERVIEW_MAX_TILES_PER_ZOOM) break;
    for (let x = a.x; x <= b.x; x += 1) for (let y = a.y; y <= b.y; y += 1) addTile(out, z, { x, y });
  }
  return out;
}

function addRadius(
  set: Map<string, TileId>,
  spot: { lat: number; lon: number },
  z: number,
  radiusM: number
) {
  const dLat = radiusM / METERS_PER_DEG_LAT;
  const dLon = radiusM / (METERS_PER_DEG_LAT * Math.max(0.01, Math.cos((spot.lat * Math.PI) / 180)));
  const a = tileAt(spot.lat + dLat, spot.lon - dLon, z);
  const b = tileAt(spot.lat - dLat, spot.lon + dLon, z);
  for (let x = a.x; x <= b.x; x += 1) for (let y = a.y; y <= b.y; y += 1) addTile(set, z, { x, y });
}

function addTile(set: Map<string, TileId>, z: number, t: { x: number; y: number }) {
  const tile = { z, x: t.x, y: t.y };
  set.set(keyOf(tile), tile);
}

export function keyOf(t: TileId): string {
  return `${t.z}/${t.x}/${t.y}`;
}

function hasUsableGeo(spot: SpotLike): spot is { lat: number; lon: number } {
  const { lat, lon } = spot;
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > MAX_LAT || Math.abs(lon) > 180) return false;
  return !(lat === 0 && lon === 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

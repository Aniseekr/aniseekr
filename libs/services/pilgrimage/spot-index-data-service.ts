// Runtime hydration for the point-level anitabi spots index (Aniseekr-source
// `anitabi-spots-index` release). Mirrors anitabi-data-service.ts: read the
// cached file if fresh (7d), else download the alias asset, then swap the
// SQLite anitabi_spots table. 404-tolerant — when the release isn't published
// yet the download returns null and the app keeps working off the anime-centre
// index (no spot-level nearby, honest empty states) instead of crashing.

import * as FileSystem from 'expo-file-system/legacy';
import { LocalDB } from '../../db';
import type { SpotIndexRow } from './spot-index';
import { CacheService } from '../cache-service';
import { normalizeRawPoints } from './anitabi-points';
import {
  DETAIL_CACHE_KEY_PREFIX,
  DETAIL_STALE_GRACE_MS,
  PILGRIMAGE_TTL_MS,
} from './anitabi-service';
import type { RawAnitabiPoint } from './types';

export interface SpotEntry {
  id: string;
  b: number;
  lat: number;
  lng: number;
  n: string;
  c: string;
  img: string;
}
interface SpotsIndexFile {
  generatedAt: number;
  source: string;
  count?: number;
  spots: SpotEntry[];
}

const SPOTS_INDEX_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-spots-index/anitabi-spots-index.json';
const SPOTS_INDEX_FILENAME = 'anitabi-spots-index.runtime.json';
const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type FsLike = {
  cacheDirectory?: string;
  downloadAsync(url: string, dest: string): Promise<{ status: number }>;
  readAsStringAsync(path: string): Promise<string>;
  getInfoAsync(path: string): Promise<{ exists: boolean; modificationTime?: number }>;
};
const fs = FileSystem as unknown as FsLike;

function cachePath(filename: string): string | null {
  const dir = fs.cacheDirectory;
  return dir ? dir + filename : null;
}

async function isFresh(path: string): Promise<boolean> {
  try {
    const info = await fs.getInfoAsync(path);
    if (!info.exists) return false;
    const mtimeSec = info.modificationTime ?? 0;
    if (mtimeSec <= 0) return false;
    return Date.now() - mtimeSec * 1000 < FRESHNESS_WINDOW_MS;
  } catch {
    return false;
  }
}

async function loadFile(): Promise<SpotsIndexFile | null> {
  const path = cachePath(SPOTS_INDEX_FILENAME);
  if (!path) return null;
  if (await isFresh(path)) {
    try {
      return JSON.parse(await fs.readAsStringAsync(path)) as SpotsIndexFile;
    } catch {
      // fall through to a fresh download
    }
  }
  try {
    const res = await fs.downloadAsync(SPOTS_INDEX_URL, path);
    if (res.status !== 200) {
      // 404 = release not published yet; anything else = transient. Either way
      // keep the current SQLite table and skip this cycle.
      console.warn(`[spot-index] download → ${res.status} (keeping existing spots)`);
      return null;
    }
    return JSON.parse(await fs.readAsStringAsync(path)) as SpotsIndexFile;
  } catch (err) {
    console.warn('[spot-index] fetch failed:', err);
    return null;
  }
}

function isValidSpotEntry(s: SpotEntry): boolean {
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    typeof s.b === 'number' &&
    Number.isFinite(s.b) &&
    s.b >= 1 &&
    typeof s.lat === 'number' &&
    Number.isFinite(s.lat) &&
    s.lat >= -90 &&
    s.lat <= 90 &&
    typeof s.lng === 'number' &&
    Number.isFinite(s.lng) &&
    s.lng >= -180 &&
    s.lng <= 180 &&
    // (0,0) is the pipeline's missing-GPS sentinel (anitabi-points-build.ts
    // filters it before emitting) — mirror that rule as defense in depth.
    !(s.lat === 0 && s.lng === 0) &&
    typeof s.n === 'string' &&
    typeof s.c === 'string' &&
    typeof s.img === 'string' &&
    s.img.length > 0
  );
}

/**
 * Map compact release-artifact entries onto the SQLite row shape, dropping
 * anything malformed (missing/NaN coords, out-of-range lat/lng, empty id or
 * image). Rule 8: only real, well-formed data reaches the table — a
 * corrupted or partially-truncated download must not poison `nearby`.
 */
export function mapSpotEntries(entries: readonly SpotEntry[]): SpotIndexRow[] {
  const rows: SpotIndexRow[] = [];
  let dropped = 0;
  for (const s of entries) {
    if (!isValidSpotEntry(s)) {
      dropped++;
      continue;
    }
    rows.push({
      pointId: s.id,
      bangumiId: s.b,
      lat: s.lat,
      lng: s.lng,
      name: s.n,
      cn: s.c,
      image: s.img,
    });
  }
  if (dropped > 0) {
    console.warn(`[spot-index] dropped ${dropped} malformed entries`);
  }
  return rows;
}

/**
 * Download + hydrate the spots index into SQLite. Safe to call on every cold
 * launch; the freshness window only gates the network download — a fresh
 * on-disk copy is still re-hydrated into the table each launch (atomic
 * replace, ~50k rows, one transaction). Failures are swallowed — the
 * anime-centre index remains the fallback for nearby.
 */
export async function hydrateSpotIndex(): Promise<void> {
  const file = await loadFile();
  if (!file || !Array.isArray(file.spots) || file.spots.length === 0) return;
  const rows = mapSpotEntries(file.spots);
  if (rows.length === 0) return;
  try {
    const written = await LocalDB.hydrateAnitabiSpots(rows);
    console.log(`[spot-index] hydrated ${written} spots into SQLite`);
  } catch (err) {
    console.warn('[spot-index] SQLite hydrate failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Top-100 anime points snapshot hydration (Aniseekr-source
// `anitabi-points-top` release). Seeds the per-anime detail cache
// (AnitabiService.getDetailedPoints's own cache key/TTL convention) for the
// most-visited anime so opening one works offline on first launch, without
// waiting on a per-anime network round trip. 404-tolerant like the spot index
// above — when the release isn't published yet, hydration is a silent no-op.

interface PointsTopFile {
  generatedAt: number;
  source: string;
  topN?: number;
  byBangumiId: Record<string, RawAnitabiPoint[]>;
}

const POINTS_TOP_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-points-top/anitabi-points-top.json';
const POINTS_TOP_FILENAME = 'anitabi-points-top.runtime.json';

/** Pure: which top-snapshot ids still need seeding (not cached, non-empty payload). */
export function spotsToSeed(
  byBangumiId: Record<string, readonly unknown[]>,
  isCached: (bangumiId: number) => boolean
): number[] {
  const out: number[] = [];
  for (const [key, arr] of Object.entries(byBangumiId)) {
    const id = Number(key);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!Array.isArray(arr) || arr.length === 0) continue;
    if (isCached(id)) continue;
    out.push(id);
  }
  return out;
}

async function loadPointsTopFile(): Promise<PointsTopFile | null> {
  const path = cachePath(POINTS_TOP_FILENAME);
  if (!path) return null;
  if (await isFresh(path)) {
    try {
      return JSON.parse(await fs.readAsStringAsync(path)) as PointsTopFile;
    } catch {
      // fall through
    }
  }
  try {
    const res = await fs.downloadAsync(POINTS_TOP_URL, path);
    if (res.status !== 200) {
      console.warn(`[points-top] download → ${res.status} (skipping seed)`);
      return null;
    }
    return JSON.parse(await fs.readAsStringAsync(path)) as PointsTopFile;
  } catch (err) {
    console.warn('[points-top] fetch failed:', err);
    return null;
  }
}

/**
 * Seed the per-anime detail cache for the top-100 anime from the offline
 * snapshot, so opening a popular anime works offline on first launch. Runs in
 * the background after hydration and never overwrites a cache entry the device
 * already has (that one is at least as fresh). Normalizes with the SAME
 * normalizeRawPoints the live /points path uses, and writes under the SAME
 * DETAIL_CACHE_KEY_PREFIX with the SAME widened ttl (PILGRIMAGE_TTL_MS +
 * DETAIL_STALE_GRACE_MS) that AnitabiService.getDetailedPoints itself writes
 * — a base-ttl-only write would make getWithMeta(key, 0) delete the seeded
 * row the instant it crosses the base 7-day ttl, so seeded entries would
 * silently lose the stale-if-error grace real network-fetched rows get.
 */
export async function hydratePointsTop(): Promise<void> {
  const file = await loadPointsTopFile();
  if (!file || !file.byBangumiId) return;

  // Decide which ids to seed by probing the cache (miss ⇒ seed). getWithMeta
  // with graceMs=0 is used (not get()) so a stale-but-present row still
  // counts as "cached" here and is left alone — hydration only fills true
  // misses, never overwrites data the device already has, fresher or not.
  const cachedIds = new Set<number>();
  await Promise.all(
    Object.keys(file.byBangumiId).map(async (key) => {
      const id = Number(key);
      if (!Number.isFinite(id) || id <= 0) return;
      const hit = await CacheService.getWithMeta(DETAIL_CACHE_KEY_PREFIX + id, 0);
      if (hit) cachedIds.add(id);
    })
  );

  const ids = spotsToSeed(file.byBangumiId, (id) => cachedIds.has(id));
  let seeded = 0;
  for (const id of ids) {
    const points = normalizeRawPoints(file.byBangumiId[String(id)], id);
    if (points.length === 0) continue;
    try {
      await CacheService.set(
        DETAIL_CACHE_KEY_PREFIX + id,
        points,
        PILGRIMAGE_TTL_MS + DETAIL_STALE_GRACE_MS
      );
      seeded++;
    } catch (err) {
      console.warn('[points-top] seed write failed for', id, err);
    }
  }
  if (seeded > 0) console.log(`[points-top] seeded ${seeded} anime detail caches offline`);
}

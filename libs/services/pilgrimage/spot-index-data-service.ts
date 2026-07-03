// Runtime hydration for the point-level anitabi spots index (Aniseekr-source
// `anitabi-spots-index` release). Mirrors anitabi-data-service.ts: read the
// cached file if fresh (7d), else download the alias asset, then swap the
// SQLite anitabi_spots table. 404-tolerant — when the release isn't published
// yet the download returns null and the app keeps working off the anime-centre
// index (no spot-level nearby, honest empty states) instead of crashing.

import * as FileSystem from 'expo-file-system/legacy';
import { LocalDB } from '../../db';
import type { SpotIndexRow } from './spot-index';

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

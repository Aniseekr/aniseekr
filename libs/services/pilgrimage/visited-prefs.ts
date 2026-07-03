// Local-only persistence for "visited" pilgrimage spots.
// Schema (v2): a single MMKV key holding a JSON-serialised
// `Record<spotId, number>` map of epoch-ms check-in timestamps. `0` marks a
// spot migrated from the v1 boolean blob, where "visited" was known but the
// time was not recorded — never a fabricated time (Rule 8).
//
// v1 (`Record<spotId, true>`) is migrated lazily and read-only: if no v2 blob
// exists yet, the v1 blob is parsed into timestamp `0` entries in memory. The
// v1 key itself is left untouched; the next `saveVisitedSpots` call is what
// actually persists a v2 blob.
//
// The synchronous read lets the map / spot list seed the "visited" marker
// state on the first frame instead of popping it in after an async resolve.

import { kvGet, kvSet } from '../storage/app-storage';
import { VISITED_SPOTS_STORAGE_KEY, VISITED_SPOTS_STORAGE_KEY_V2 } from '../storage/keys';
import { Logger } from '../../utils/logger';

/** Boolean view — unchanged public type consumed across the pilgrimage UI. */
export type VisitedMap = Record<string, true>;
/** spotId -> epoch ms of check-in. `0` marks a spot migrated from v1 (time unknown). */
export type VisitedAtMap = Record<string, number>;

function sanitizeAt(parsed: unknown): VisitedAtMap {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: VisitedAtMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

/** Migrate the v1 `Record<spotId, true>` blob -> timestamp map with 0 sentinels. */
function migrateV1(raw: string | null): VisitedAtMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: VisitedAtMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === true) out[k] = 0; // honest: visited, timestamp unknown
    }
    return out;
  } catch {
    return {};
  }
}

/** Read the v2 timestamp map, lazily deriving from v1 when v2 is absent. Pure (no write). */
export function loadVisitedAtSync(): VisitedAtMap {
  try {
    const rawV2 = kvGet(VISITED_SPOTS_STORAGE_KEY_V2);
    if (rawV2) return sanitizeAt(JSON.parse(rawV2));
    return migrateV1(kvGet(VISITED_SPOTS_STORAGE_KEY));
  } catch (err) {
    Logger.warn('[VisitedPrefs] load failed, returning empty', err);
    return {};
  }
}

/** Timestamp for one spot, or `null` if it has never been visited. */
export function visitedAtSync(spotId: string): number | null {
  const map = loadVisitedAtSync();
  return spotId in map ? map[spotId] : null;
}

/** Boolean view for first-paint seeding — derived from the timestamp map. */
export function loadVisitedSpotsSync(): VisitedMap {
  const at = loadVisitedAtSync();
  const out: VisitedMap = {};
  for (const k of Object.keys(at)) out[k] = true;
  return out;
}

/** Async read kept for callers that want a `Promise` signature. */
export async function loadVisitedSpots(): Promise<VisitedMap> {
  return loadVisitedSpotsSync();
}

/**
 * Merge a boolean map into the v2 timestamp store: keep existing timestamps for
 * spots that stay visited, stamp newly-true spots with now, drop absent spots.
 * This is what keeps the boolean `VisitedMap` signature compatible for all
 * existing consumers while the underlying store gains timestamps.
 */
export async function saveVisitedSpots(map: VisitedMap): Promise<void> {
  try {
    const prev = loadVisitedAtSync();
    const now = Date.now();
    const next: VisitedAtMap = {};
    for (const [k, v] of Object.entries(map)) {
      if (v !== true) continue;
      next[k] = k in prev ? prev[k] : now; // preserve or stamp
    }
    kvSet(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify(next));
  } catch (err) {
    Logger.warn('[VisitedPrefs] save failed', err);
  }
}

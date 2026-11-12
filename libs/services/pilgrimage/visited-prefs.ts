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
import {
  STAMP_DETAILS_STORAGE_KEY,
  VISITED_SPOTS_LEGACY_KEY,
  VISITED_SPOTS_STORAGE_KEY,
  VISITED_SPOTS_STORAGE_KEY_V2,
} from '../storage/keys';
import { Logger } from '../../utils/logger';
import type { RoleId } from './locality/types';
import {
  applyCheckIn,
  buildStamps,
  mergeStampRecords,
  sanitizeStampDetails,
  type Stamp,
  type StampDetailMap,
  type StampMeta,
  type StampVia,
} from './stamp-details';

/** Boolean view — unchanged public type consumed across the pilgrimage UI. */
export type VisitedMap = Record<string, true>;
/** spotId -> epoch ms of check-in. `0` marks a spot migrated from v1 (time unknown). */
export type VisitedAtMap = Record<string, number>;
export type LegacyVisitedSpotIds = string[];
export type StampStopVisitedMap = Record<string, true>;

const STAMP_STOP_VISITED_PREFIX = 'locality:stamp-stop-role:';

/** Old visited ids kept outside the timestamp map so legacy metadata is not misread as a spot. */
export function loadLegacyVisitedSpotIdsSync(): LegacyVisitedSpotIds {
  try {
    const parsed = JSON.parse(kvGet(VISITED_SPOTS_LEGACY_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

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
    pruneStampDetails(next);
  } catch (err) {
    Logger.warn('[VisitedPrefs] save failed', err);
  }
}

// ---- Stamp details (on-site proof + spot snapshot), keyed like the visited map ----

let detailsRaw: string | null | undefined;
let detailsParsed: StampDetailMap = {};

/** Details for visited spots. Parsed once per stored value; treat as read-only. */
export function loadStampDetailsSync(): StampDetailMap {
  try {
    const raw = kvGet(STAMP_DETAILS_STORAGE_KEY) ?? null;
    if (raw !== detailsRaw) {
      detailsParsed = raw ? sanitizeStampDetails(JSON.parse(raw)) : {};
      detailsRaw = raw;
    }
    return detailsParsed;
  } catch (err) {
    Logger.warn('[VisitedPrefs] stamp details load failed', err);
    return {};
  }
}

function saveStampDetails(next: StampDetailMap) {
  kvSet(STAMP_DETAILS_STORAGE_KEY, JSON.stringify(next));
}

/** Drops details whose spot is no longer visited. */
function pruneStampDetails(visitedAt: VisitedAtMap) {
  const details = loadStampDetailsSync();
  const kept: StampDetailMap = {};
  let dropped = false;
  for (const [id, detail] of Object.entries(details)) {
    if (id in visitedAt) kept[id] = detail;
    else dropped = true;
  }
  if (dropped) saveStampDetails(kept);
}

/** Every spot stamp (visited map joined with its details); rally stops excluded. */
export function loadStampsSync(): Stamp[] {
  return buildStamps(loadVisitedAtSync(), loadStampDetailsSync());
}

export interface CheckInDetail {
  /** Set when the user is proven to be at the spot; makes it an on-site stamp. */
  onsiteVia?: StampVia;
  meta?: StampMeta;
}

/**
 * Check in a single spot: read-modify-write just that spot's entry in the v2
 * timestamp map. This is the atomic counterpart to `saveVisitedSpots` — a
 * caller that only knows about ONE spot (the SpotSheet check-in button) must
 * never round-trip a full boolean snapshot, because a snapshot taken before
 * another surface (e.g. the grouped map toggle) wrote its own change would
 * stomp that other spot's timestamp when saved back.
 *
 * If the spot is already checked in, the ORIGINAL time is preserved, never
 * overwritten with `at` (Rule 8: we don't track revisits). An on-site proof in
 * `detail` still upgrades an existing manual note, dated `at`.
 */
export async function checkInSpot(
  spotId: string,
  at: number = Date.now(),
  detail?: CheckInDetail
): Promise<void> {
  try {
    const prev = loadVisitedAtSync();
    if (!(spotId in prev)) {
      kvSet(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ ...prev, [spotId]: at }));
    }
    if (!detail) return;
    const details = loadStampDetailsSync();
    const next = applyCheckIn(details[spotId], {
      onsiteAt: detail.onsiteVia ? at : undefined,
      via: detail.onsiteVia,
      meta: detail.meta,
    });
    if (next) saveStampDetails({ ...details, [spotId]: next });
  } catch (err) {
    Logger.warn('[VisitedPrefs] checkIn failed', err);
  }
}

/**
 * Check out a single spot: read-modify-write to drop just that spot's entry
 * from the v2 timestamp map (and its stamp detail), leaving every other spot
 * untouched.
 */
export async function checkOutSpot(spotId: string): Promise<void> {
  try {
    const prev = loadVisitedAtSync();
    if (!(spotId in prev)) return; // already checked out
    const next: VisitedAtMap = { ...prev };
    delete next[spotId];
    kvSet(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify(next));
    const details = loadStampDetailsSync();
    if (spotId in details) {
      const kept = { ...details };
      delete kept[spotId];
      saveStampDetails(kept);
    }
  } catch (err) {
    Logger.warn('[VisitedPrefs] checkOut failed', err);
  }
}

/** Stores spot snapshots for visited spots that lack one (or lack its municipality). */
export function fillStampMeta(metas: Readonly<Record<string, StampMeta>>): number {
  try {
    const visitedAt = loadVisitedAtSync();
    const details = loadStampDetailsSync();
    const next: StampDetailMap = { ...details };
    let written = 0;
    for (const [id, meta] of Object.entries(metas)) {
      if (!(id in visitedAt)) continue;
      const updated = applyCheckIn(details[id], { meta });
      if (!updated || updated.meta === details[id]?.meta) continue;
      next[id] = updated;
      written += 1;
    }
    if (written > 0) saveStampDetails(next);
    return written;
  } catch (err) {
    Logger.warn('[VisitedPrefs] fill meta failed', err);
    return 0;
  }
}

/** Raw stored values for a backup; null when nothing is stored. */
export function exportStampRecords(): { visited: string | null; details: string | null } {
  const visitedAt = loadVisitedAtSync();
  return {
    visited: Object.keys(visitedAt).length ? JSON.stringify(visitedAt) : null,
    details: kvGet(STAMP_DETAILS_STORAGE_KEY) ?? null,
  };
}

/** Merges a backup into what is on the device; no stamp on either side is lost. */
export function restoreStampRecords(backup: { visited: string | null; details: string | null }) {
  try {
    if (!backup.visited) return;
    const merged = mergeStampRecords(
      { visitedAt: loadVisitedAtSync(), details: loadStampDetailsSync() },
      {
        visitedAt: sanitizeAt(JSON.parse(backup.visited)),
        details: backup.details ? sanitizeStampDetails(JSON.parse(backup.details)) : {},
      }
    );
    kvSet(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify(merged.visitedAt));
    saveStampDetails(merged.details);
  } catch (err) {
    Logger.warn('[VisitedPrefs] restore failed', err);
  }
}

function stampStopStorageKey(roleId: RoleId): string {
  return `${STAMP_STOP_VISITED_PREFIX}${roleId}`;
}

/** Synchronous role-id view used to seed campaign progress on frame one. */
export function loadVisitedStampStopsSync(): StampStopVisitedMap {
  const at = loadVisitedAtSync();
  const out: StampStopVisitedMap = {};
  for (const key of Object.keys(at)) {
    if (!key.startsWith(STAMP_STOP_VISITED_PREFIX)) continue;
    const roleId = key.slice(STAMP_STOP_VISITED_PREFIX.length);
    if (roleId) out[roleId] = true;
  }
  return out;
}

/**
 * Every stamped role id → its stamp time, from ONE read of the visited blob.
 * Surfaces that need many stamp times on first paint must use this rather than
 * calling `stampStopVisitedAtSync` per stop (each call re-parses the blob).
 */
export function loadStampStopVisitedAtSync(): Record<string, number> {
  const at = loadVisitedAtSync();
  const out: Record<string, number> = {};
  for (const key of Object.keys(at)) {
    if (!key.startsWith(STAMP_STOP_VISITED_PREFIX)) continue;
    const roleId = key.slice(STAMP_STOP_VISITED_PREFIX.length);
    if (roleId) out[roleId] = at[key];
  }
  return out;
}

export function stampStopVisitedAtSync(roleId: RoleId): number | null {
  return visitedAtSync(stampStopStorageKey(roleId));
}

export async function checkInStampStop(roleId: RoleId, at: number = Date.now()): Promise<void> {
  await checkInSpot(stampStopStorageKey(roleId), at);
}

export async function checkOutStampStop(roleId: RoleId): Promise<void> {
  await checkOutSpot(stampStopStorageKey(roleId));
}

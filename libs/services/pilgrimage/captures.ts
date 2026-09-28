// Local index of pilgrimage spots the user has photographed.
// Persists in MMKV so SpotSheet / map markers can show a "shot taken"
// indicator without us re-scanning the camera roll.
//
// v2: each spot holds an ARRAY of captures (newest-first) instead of a single
// "latest" capture — v1 silently dropped every capture but the last at a
// given spot. A separate `free` bucket holds captures taken without a spot
// (Phase 3 free camera). v1 blobs are lazily migrated on first read: a single
// capture becomes a length-1 array, free starts empty. Once anything is
// written, the v2 blob is persisted and takes precedence over v1 forever.
//
// The parsed index is memoised against BOTH raw MMKV strings (v2 and v1) so
// repeated reads reuse the parsed object, and the cache self-invalidates
// whenever either backing string changes.

import { kvGet, kvSet } from '../storage/app-storage';
import { CAPTURES_STORAGE_KEY, CAPTURES_STORAGE_KEY_V2 } from '../storage/keys';

export { CAPTURES_STORAGE_KEY, CAPTURES_STORAGE_KEY_V2 };

export interface SensorSnapshot {
  /** meters to target spot at shutter time; null if location unavailable */
  distanceMeters: number | null;
  /** signed degrees: targetBearing − heading, wrapped to [-180, 180]; null if either sensor unavailable */
  headingDeltaDeg: number | null;
  /** signed degrees from level (pitch beta); null if motion unavailable */
  tilt: number | null;
  /**
   * 0..1 frame-match score (image vs anime reference). Optional — older
   * captures stored before this field was added will be missing it; the UI
   * must treat undefined and null identically.
   */
  frameMatch?: number | null;
  /** false → frame-match validity gate tripped (lens covered, flat, etc.). */
  frameValid?: boolean | null;
  /** Why the validity gate tripped; null/undefined when valid. */
  frameReason?: 'dark' | 'lowDetail' | 'lowContrast' | 'analysisFailed' | null;
  /**
   * Which frame-match metric produced `frameMatch` (see FRAME_MATCH_VERSION).
   * Scores from an older metric (missing version) are not shown.
   */
  frameMatchVersion?: number;
}

export interface CaptureGeoLocation {
  latitude: number;
  longitude: number;
}

export interface PilgrimageCapture {
  spotId: string;
  /** local file URI saved by the camera engine or via FileSystem cache. */
  uri: string;
  /** comparison composite URI (left+right or top+bottom). Optional. */
  compositeUri?: string;
  /** epoch ms */
  capturedAt: number;
  /** legacy raw heading at shutter; kept for backwards-compat */
  heading?: number;
  /** new: alignment sensor snapshot taken at shutter time */
  sensorSnapshot?: SensorSnapshot;
  /** User GPS at capture/import time. Distinct from the anime spot's own geo. */
  userLocation?: CaptureGeoLocation;
  /** User-entered album description. */
  note?: string;
  /** Whether the image came from the live camera or the user's photo library. */
  source?: 'camera' | 'auto' | 'library';
  /** Bangumi subject id for album hydration when the anime is not preloaded. */
  animeId?: number;
  animeTitle?: string;
  animeTitleCn?: string;
  animeCover?: string;
  animeColor?: string;
  animeCity?: string;
  spotName?: string;
  spotNameCn?: string;
  spotImage?: string;
  spotEp?: number;
  spotSecond?: number;
  spotGeo?: [number, number];
  /**
   * Free captures only: local file of a reference image the user imported to
   * compare against (not an anime scene we know of). The album shows it as the
   * comparison's reference half; there is no spot or anime behind it.
   */
  referenceUri?: string;
}

export interface CapturesIndexV2 {
  /** spotId -> every capture at that spot, newest-first. */
  spots: Record<string, PilgrimageCapture[]>;
  /** Standalone captures taken without a spot (Phase 3 free camera), newest-first. */
  free: PilgrimageCapture[];
}

// Memoise the parsed v2 index against BOTH raw strings so a lazy v1→v2 read
// self-invalidates when either backing string changes.
let cache: { rawV2: string | null; rawV1: string | null; index: CapturesIndexV2 } | null = null;

function sanitizeArray(value: unknown): PilgrimageCapture[] {
  if (!Array.isArray(value)) return [];
  // Lists are newest-first, so the first record of a uri is its latest save.
  // Older builds prepended on every save; keep only that latest one.
  const seen = new Set<string>();
  return value.filter((c): c is PilgrimageCapture => {
    if (!c || typeof c !== 'object' || typeof (c as PilgrimageCapture).uri !== 'string') {
      return false;
    }
    const { uri } = c as PilgrimageCapture;
    if (seen.has(uri)) return false;
    seen.add(uri);
    return true;
  });
}

/** Parse a stored v2 blob. Returns null if the string isn't a v2 index. */
function parseV2(raw: string | null): CapturesIndexV2 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CapturesIndexV2>;
    if (!parsed || typeof parsed !== 'object' || !parsed.spots) return null;
    const spots: Record<string, PilgrimageCapture[]> = {};
    for (const [k, v] of Object.entries(parsed.spots)) {
      const arr = sanitizeArray(v);
      if (arr.length > 0) spots[k] = arr;
    }
    return { spots, free: sanitizeArray(parsed.free) };
  } catch {
    return null;
  }
}

/** Migrate the real v1 shape `{ spots: Record<spotId, PilgrimageCapture> }` → v2. */
function migrateV1(raw: string | null): CapturesIndexV2 {
  if (!raw) return { spots: {}, free: [] };
  try {
    const parsed = JSON.parse(raw) as { spots?: Record<string, PilgrimageCapture> };
    const spots: Record<string, PilgrimageCapture[]> = {};
    if (parsed?.spots && typeof parsed.spots === 'object') {
      for (const [k, v] of Object.entries(parsed.spots)) {
        if (v && typeof v === 'object' && typeof (v as PilgrimageCapture).uri === 'string') {
          spots[k] = [v as PilgrimageCapture];
        }
      }
    }
    return { spots, free: [] };
  } catch {
    return { spots: {}, free: [] };
  }
}

function loadV2(): CapturesIndexV2 {
  const rawV2 = kvGet(CAPTURES_STORAGE_KEY_V2);
  const rawV1 = kvGet(CAPTURES_STORAGE_KEY);
  if (cache && cache.rawV2 === rawV2 && cache.rawV1 === rawV1) return cache.index;
  const index = parseV2(rawV2) ?? migrateV1(rawV1);
  cache = { rawV2, rawV1, index };
  return index;
}

function persist(idx: CapturesIndexV2): void {
  try {
    const rawV2 = JSON.stringify(idx);
    kvSet(CAPTURES_STORAGE_KEY_V2, rawV2);
    cache = { rawV2, rawV1: kvGet(CAPTURES_STORAGE_KEY), index: idx };
  } catch {
    // best-effort; ignore
  }
}

/** Raw v2 index (spots arrays + free bucket). */
export function loadCapturesV2Sync(): CapturesIndexV2 {
  return loadV2();
}

/** Latest capture per spot — backwards-compatible view for markers/counts. */
export function loadCapturesSync(): Record<string, PilgrimageCapture> {
  const { spots } = loadV2();
  const out: Record<string, PilgrimageCapture> = {};
  for (const [spotId, arr] of Object.entries(spots)) {
    if (arr.length > 0) out[spotId] = arr[0]; // arrays are newest-first
  }
  return out;
}

/** Every capture (all spots + free), newest-first. For the album. */
export function loadAllCapturesSync(): PilgrimageCapture[] {
  const { spots, free } = loadV2();
  const all: PilgrimageCapture[] = [];
  for (const arr of Object.values(spots)) all.push(...arr);
  all.push(...free);
  return all.sort((a, b) => b.capturedAt - a.capturedAt);
}

/**
 * Drop every record of `uri` from the index. A photo is one record: re-saving
 * it (the preview saves on mount and again as its frame score / note settle)
 * or re-filing it under another spot must never leave a second copy behind.
 */
function withoutUri(idx: CapturesIndexV2, uri: string): CapturesIndexV2 {
  const spots: Record<string, PilgrimageCapture[]> = {};
  for (const [spotId, arr] of Object.entries(idx.spots)) {
    const kept = arr.filter((c) => c.uri !== uri);
    if (kept.length > 0) spots[spotId] = kept;
  }
  return { spots, free: idx.free.filter((c) => c.uri !== uri) };
}

/** The stored record of a photo, wherever it is filed; null when it has none. */
export function findCaptureByUri(uri: string): PilgrimageCapture | null {
  return findByUri(loadV2(), uri);
}

function findByUri(idx: CapturesIndexV2, uri: string): PilgrimageCapture | null {
  for (const arr of Object.values(idx.spots)) {
    const hit = arr.find((c) => c.uri === uri);
    if (hit) return hit;
  }
  return idx.free.find((c) => c.uri === uri) ?? null;
}

/**
 * The fields that describe the photo itself. They stay true when the photo is
 * paired with another reference; everything else (distance and heading to the
 * old target, frame match, composite, scene/anime metadata, imported
 * reference) described the old pairing and is dropped.
 */
function photoFields(prev: PilgrimageCapture): Partial<PilgrimageCapture> {
  const tilt = prev.sensorSnapshot?.tilt ?? null;
  return {
    capturedAt: prev.capturedAt,
    ...(prev.heading !== undefined ? { heading: prev.heading } : {}),
    ...(prev.userLocation ? { userLocation: prev.userLocation } : {}),
    ...(prev.note ? { note: prev.note } : {}),
    ...(prev.source ? { source: prev.source } : {}),
    ...(tilt !== null
      ? { sensorSnapshot: { distanceMeters: null, headingDeltaDeg: null, tilt } }
      : {}),
  };
}

/**
 * Writers only send what they know (a preview opened from the Journal has the
 * uri and note, not the shutter-time sensors), so a field left undefined keeps
 * the stored value. An empty note is the one explicit clear.
 */
function withDefined<T extends object>(base: Partial<T> | undefined, next: T): T {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as T;
}

function mergeCapture(base: Partial<PilgrimageCapture>, capture: PilgrimageCapture) {
  const merged = withDefined(base, capture);
  // Field by field, so a save without a fresh frame result keeps the stored one.
  if (capture.sensorSnapshot) {
    merged.sensorSnapshot = withDefined(base.sensorSnapshot, capture.sensorSnapshot);
  }
  if (!merged.note) delete merged.note;
  return merged;
}

/** Upsert by uri: same spot → merge in place; elsewhere → move here (newest-first). */
export async function recordCapture(capture: PilgrimageCapture): Promise<void> {
  const idx = loadV2();
  const existing = idx.spots[capture.spotId] ?? [];
  const at = existing.findIndex((c) => c.uri === capture.uri);
  if (at >= 0) {
    const updated = [...existing];
    updated[at] = mergeCapture(existing[at], capture);
    persist({ spots: { ...idx.spots, [capture.spotId]: updated }, free: idx.free });
    return;
  }
  const prev = findByUri(idx, capture.uri);
  const moved = mergeCapture(prev ? photoFields(prev) : {}, capture);
  const rest = withoutUri(idx, capture.uri);
  persist({
    spots: { ...rest.spots, [capture.spotId]: [moved, ...(rest.spots[capture.spotId] ?? [])] },
    free: rest.free,
  });
}

/**
 * Upsert by uri into the free bucket. Re-saving against the same imported
 * reference (or without naming one) merges; a different reference is a new
 * pairing and keeps only the photo's own fields.
 */
export async function recordFreeCapture(capture: PilgrimageCapture): Promise<void> {
  const idx = loadV2();
  const at = idx.free.findIndex((c) => c.uri === capture.uri);
  if (at >= 0) {
    const current = idx.free[at];
    const samePairing =
      capture.referenceUri === undefined || capture.referenceUri === current.referenceUri;
    const updated = [...idx.free];
    updated[at] = mergeCapture(samePairing ? current : photoFields(current), capture);
    persist({ spots: idx.spots, free: updated });
    return;
  }
  const prev = findByUri(idx, capture.uri);
  const moved = mergeCapture(prev ? photoFields(prev) : {}, capture);
  const rest = withoutUri(idx, capture.uri);
  persist({ spots: rest.spots, free: [moved, ...rest.free] });
}

export async function listCaptures(): Promise<Record<string, PilgrimageCapture>> {
  return loadCapturesSync();
}

export async function getCapture(spotId: string): Promise<PilgrimageCapture | null> {
  const arr = loadV2().spots[spotId];
  return arr && arr.length > 0 ? arr[0] : null;
}

export async function clearCapture(spotId: string, uri?: string): Promise<void> {
  const idx = loadV2();
  const arr = idx.spots[spotId];
  if (!arr) return;
  const nextSpots = { ...idx.spots };
  if (uri) {
    const filtered = arr.filter((c) => c.uri !== uri);
    if (filtered.length > 0) nextSpots[spotId] = filtered;
    else delete nextSpots[spotId];
  } else {
    delete nextSpots[spotId];
  }
  persist({ spots: nextSpots, free: idx.free });
}

export async function clearFreeCapture(uri: string): Promise<void> {
  const idx = loadV2();
  const nextFree = idx.free.filter((c) => c.uri !== uri);
  if (nextFree.length === idx.free.length) return;
  persist({ spots: idx.spots, free: nextFree });
}

/** Test-only — drop the memoised index. */
export function __resetCapturesCacheForTests(): void {
  cache = null;
}

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
  return value.filter(
    (c): c is PilgrimageCapture =>
      Boolean(c) && typeof c === 'object' && typeof (c as PilgrimageCapture).uri === 'string'
  );
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

export async function recordCapture(capture: PilgrimageCapture): Promise<void> {
  const idx = loadV2();
  const existing = idx.spots[capture.spotId] ?? [];
  const next: CapturesIndexV2 = {
    spots: { ...idx.spots, [capture.spotId]: [capture, ...existing] },
    free: idx.free,
  };
  persist(next);
}

export async function recordFreeCapture(capture: PilgrimageCapture): Promise<void> {
  const idx = loadV2();
  persist({ spots: idx.spots, free: [capture, ...idx.free] });
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

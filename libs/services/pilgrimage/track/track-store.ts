// Recorded pilgrimage walks, on this device only.
//
// The walk being recorded lives in MMKV: one small meta record plus point
// chunks, so each location batch rewrites a few KB and nothing is lost if the
// OS kills the app. A finished walk is one JSON file under Documents/tracks
// with a summary row in MMKV for first-frame lists.
import { Directory, File, Paths } from 'expo-file-system';

import { Logger } from '../../../utils/logger';
import { kvGet, kvRemove, kvSet } from '../../storage/app-storage';
import {
  TRACK_ACTIVE_CHUNK_KEY_PREFIX,
  TRACK_ACTIVE_STORAGE_KEY,
  TRACK_INDEX_STORAGE_KEY,
} from '../../storage/keys';
import {
  packPoint,
  stepBetween,
  trackBounds,
  unpackPoint,
  type PackedPoint,
  type TrackBounds,
  type TrackPoint,
} from './track-math';

const CHUNK_SIZE = 200;

/** A spot the walk reached: stamped on the way, or only passed. */
export interface TrackSpotEvent {
  spotId: string;
  workKey: string;
  name: string;
  lat: number;
  lon: number;
  at: number;
}

export interface ActiveTrack {
  id: string;
  startedAt: number;
  status: 'recording' | 'paused';
  /** When the user paused; the clock on screen stops here. */
  pausedAt?: number;
  /** Kept points so far. */
  count: number;
  meters: number;
  movingMs: number;
  last: TrackPoint | null;
  /** The next kept point starts a new line (first point, or first after a resume). */
  startNext: boolean;
  /** Accuracy of the newest fix the OS delivered, kept or not; null before the first. */
  lastRawAcc: number | null;
  lastRawAt: number | null;
  /** Works whose spots are stamped automatically on this walk. */
  mine: string[];
  /** False when no spot index could be loaded: this walk cannot stamp by itself. */
  canStamp: boolean;
  stamped: TrackSpotEvent[];
  passed: TrackSpotEvent[];
}

export interface TrackSummary {
  id: string;
  startedAt: number;
  endedAt: number;
  meters: number;
  movingMs: number;
  count: number;
  stamped: number;
  bounds: TrackBounds | null;
}

export interface SavedTrack extends TrackSummary {
  points: PackedPoint[];
  stampedSpots: TrackSpotEvent[];
  passed: TrackSpotEvent[];
}

type Listener = () => void;
const listeners = new Set<Listener>();
let activeCache: ActiveTrack | null | undefined;
let indexCache: TrackSummary[] | undefined;

function emit() {
  for (const listener of listeners) listener();
}

/** Fires when the recording or the list of saved walks changes. */
export function subscribeTracks(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** The walk being recorded, or null. Sync; the same object until it changes. */
export function loadActiveTrackSync(): ActiveTrack | null {
  if (activeCache === undefined) {
    const stored = parse<ActiveTrack>(kvGet(TRACK_ACTIVE_STORAGE_KEY));
    activeCache = stored && typeof stored.id === 'string' ? stored : null;
  }
  return activeCache;
}

export function saveActiveTrack(next: ActiveTrack): void {
  activeCache = next;
  kvSet(TRACK_ACTIVE_STORAGE_KEY, JSON.stringify(next));
  emit();
}

const chunkKey = (index: number) => `${TRACK_ACTIVE_CHUNK_KEY_PREFIX}${index}`;

/** Appends kept points and returns the recording with its totals moved forward. */
export function appendActivePoints(
  active: ActiveTrack,
  points: readonly TrackPoint[]
): ActiveTrack {
  if (points.length === 0) return active;
  let { count, meters, movingMs, last } = active;
  let index = Math.floor(count / CHUNK_SIZE);
  let chunk = parse<PackedPoint[]>(kvGet(chunkKey(index))) ?? [];
  for (const point of points) {
    const step = stepBetween(last, point);
    meters += step.meters;
    movingMs += step.movingMs;
    chunk.push(packPoint(point));
    count += 1;
    last = point;
    if (chunk.length >= CHUNK_SIZE) {
      kvSet(chunkKey(index), JSON.stringify(chunk));
      index += 1;
      chunk = [];
    }
  }
  if (chunk.length > 0) kvSet(chunkKey(index), JSON.stringify(chunk));
  return { ...active, count, meters, movingMs, last, startNext: false };
}

export function readActivePoints(active: ActiveTrack): TrackPoint[] {
  const points: TrackPoint[] = [];
  const chunks = Math.ceil(active.count / CHUNK_SIZE);
  for (let i = 0; i < chunks; i += 1) {
    for (const packed of parse<PackedPoint[]>(kvGet(chunkKey(i))) ?? []) {
      points.push(unpackPoint(packed));
    }
  }
  return points;
}

export function clearActiveTrack(): void {
  const active = loadActiveTrackSync();
  if (active) {
    const chunks = Math.ceil(active.count / CHUNK_SIZE) + 1;
    for (let i = 0; i < chunks; i += 1) kvRemove(chunkKey(i));
  }
  kvRemove(TRACK_ACTIVE_STORAGE_KEY);
  activeCache = null;
  emit();
}

function tracksDir(): Directory {
  const dir = new Directory(Paths.document, 'tracks');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Saved walks, newest first. Sync. */
export function loadTrackIndexSync(): TrackSummary[] {
  if (!indexCache) {
    const stored = parse<TrackSummary[]>(kvGet(TRACK_INDEX_STORAGE_KEY));
    indexCache = Array.isArray(stored) ? stored : [];
  }
  return indexCache;
}

function saveIndex(next: TrackSummary[]) {
  indexCache = [...next].sort((a, b) => b.startedAt - a.startedAt);
  kvSet(TRACK_INDEX_STORAGE_KEY, JSON.stringify(indexCache));
}

/**
 * Turns the recording into a saved walk and clears it. A recording that never
 * got two points has no line to keep: it is dropped and null comes back.
 */
export async function saveActiveAsTrack(endedAt: number): Promise<SavedTrack | null> {
  const active = loadActiveTrackSync();
  if (!active) return null;
  const points = readActivePoints(active);
  if (points.length < 2) {
    clearActiveTrack();
    return null;
  }
  const track: SavedTrack = {
    id: active.id,
    startedAt: active.startedAt,
    endedAt,
    meters: active.meters,
    movingMs: active.movingMs,
    count: points.length,
    stamped: active.stamped.length,
    bounds: trackBounds(points),
    points: points.map(packPoint),
    stampedSpots: active.stamped,
    passed: active.passed,
  };
  await writeTrackFile(track);
  clearActiveTrack();
  return track;
}

async function writeTrackFile(track: SavedTrack): Promise<void> {
  const file = new File(tracksDir(), `${track.id}.json`);
  if (!file.exists) file.create({ intermediates: true });
  await file.write(JSON.stringify(track));
  const { points: _points, stampedSpots: _stamped, passed: _passed, ...summary } = track;
  saveIndex([summary, ...loadTrackIndexSync().filter((row) => row.id !== track.id)]);
  emit();
}

export async function readTrack(id: string): Promise<SavedTrack | null> {
  try {
    const file = new File(tracksDir(), `${id}.json`);
    if (!file.exists) return null;
    const track = JSON.parse(await file.text()) as SavedTrack;
    return Array.isArray(track.points) ? track : null;
  } catch (error) {
    Logger.warn('[Track] read failed', error);
    return null;
  }
}

/** Rewrites a saved walk, e.g. after a passed spot was stamped from its summary. */
export async function updateTrack(track: SavedTrack): Promise<void> {
  await writeTrackFile({ ...track, stamped: track.stampedSpots.length });
}

export async function deleteTrack(id: string): Promise<void> {
  try {
    const file = new File(tracksDir(), `${id}.json`);
    if (file.exists) file.delete();
  } catch (error) {
    Logger.warn('[Track] delete failed', error);
  }
  saveIndex(loadTrackIndexSync().filter((row) => row.id !== id));
  emit();
}

/** Every saved walk as one JSON string for a backup; null when there are none. */
export async function exportTracksJson(): Promise<string | null> {
  const tracks: SavedTrack[] = [];
  for (const row of loadTrackIndexSync()) {
    const track = await readTrack(row.id);
    if (track) tracks.push(track);
  }
  return tracks.length > 0 ? JSON.stringify(tracks) : null;
}

/** Adds the backup's walks that are not on this device; existing ones are left alone. */
export async function restoreTracksJson(json: string): Promise<number> {
  const incoming = parse<SavedTrack[]>(json);
  if (!Array.isArray(incoming)) return 0;
  const have = new Set(loadTrackIndexSync().map((row) => row.id));
  let added = 0;
  for (const track of incoming) {
    if (
      !track ||
      typeof track.id !== 'string' ||
      !/^[a-z0-9]+$/i.test(track.id) ||
      !Array.isArray(track.points) ||
      typeof track.startedAt !== 'number' ||
      have.has(track.id)
    ) {
      continue;
    }
    await writeTrackFile({
      ...track,
      stampedSpots: Array.isArray(track.stampedSpots) ? track.stampedSpots : [],
      passed: Array.isArray(track.passed) ? track.passed : [],
    });
    have.add(track.id);
    added += 1;
  }
  return added;
}

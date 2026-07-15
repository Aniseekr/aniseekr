// Runtime hydration for the bundled L3 cross-index.
//
// The bundled cross-index ships with a complete snapshot so the app works on a
// fresh install with no network. Once the device is online, this service:
//
//   1. Reads the cached file from disk if present and younger than
//      FRESHNESS_WINDOW_MS — parses + hands to the matching module's
//      `hydrateFromRuntime`.
//   2. Otherwise downloads the latest Aniseekr-source release asset, writes it
//      to the FileSystem cache, then hydrates.
//
// The data set ships a JSON Schema alongside the asset (linked from the
// payload's `$schema` field). We don't validate at runtime — the build
// pipeline does that — but consumers can fetch the schema URL to validate
// independently.

// Legacy import — this file uses cacheDirectory / downloadAsync / readAsStringAsync /
// getInfoAsync which moved to expo-file-system/legacy in SDK 54. The settings cache
// screen uses the new Directory/File API for size reporting; this hot path keeps
// the legacy module to minimise change surface.
import * as FileSystem from 'expo-file-system/legacy';

import {
  hydrateFromRuntime as hydrateAnitabiCrossIndex,
  getCrossIndexSize,
  type AnitabiCrossIndexEntry,
} from './anitabi-cross-index';
import { hasSufficientRuntimeCoverage } from './anitabi-runtime-coverage';

interface AnitabiCrossIndexFile {
  generatedAt: number;
  source: string;
  seedSize?: number;
  entries: AnitabiCrossIndexEntry[];
}

const ANITABI_CROSS_INDEX_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-cross-index/anitabi-cross-index.json';

const ANITABI_CROSS_INDEX_FILENAME = 'anitabi-cross-index.runtime.json';

/**
 * How long an on-disk runtime payload is considered fresh. The data set is
 * rebuilt daily by Aniseekr-source CI, but the device copy doesn't need
 * to track that closely — coverage doesn't move much day-to-day. 7 days
 * means each device pulls the asset roughly weekly.
 */
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
  if (!dir) return null;
  return dir + filename;
}

async function isFresh(path: string): Promise<boolean> {
  try {
    const info = await fs.getInfoAsync(path);
    if (!info.exists) return false;
    const mtimeSec = info.modificationTime ?? 0;
    if (mtimeSec <= 0) return false;
    const mtimeMs = mtimeSec * 1000;
    return Date.now() - mtimeMs < FRESHNESS_WINDOW_MS;
  } catch {
    return false;
  }
}

async function fetchAndCache<T>(url: string, destPath: string): Promise<T | null> {
  try {
    const res = await fs.downloadAsync(url, destPath);
    if (res.status !== 200) {
      console.warn(`[anitabi-data-service] download ${url} → ${res.status}`);
      return null;
    }
    const body = await fs.readAsStringAsync(destPath);
    return JSON.parse(body) as T;
  } catch (err) {
    console.warn(`[anitabi-data-service] fetch failed for ${url}:`, err);
    return null;
  }
}

async function readCached<T>(path: string): Promise<T | null> {
  try {
    const body = await fs.readAsStringAsync(path);
    return JSON.parse(body) as T;
  } catch (err) {
    console.warn(`[anitabi-data-service] cache read failed for ${path}:`, err);
    return null;
  }
}

async function loadFile<T>(url: string, filename: string): Promise<T | null> {
  const path = cachePath(filename);
  if (!path) return null;
  if (await isFresh(path)) {
    const cached = await readCached<T>(path);
    if (cached) return cached;
  }
  return fetchAndCache<T>(url, path);
}

/**
 * Refresh the pilgrimage cross-index from its network source.
 * Safe to call on every cold launch — short-circuits when the device's cached
 * copies are still fresh. Failures are swallowed (logged), since the bundled
 * fallback keeps the feature working.
 *
 * The main Anitabi catalog is intentionally not fetched here: API calls must
 * receive HTTP 403 before the app touches www.anitabi.cn JSON endpoints.
 */
export async function hydrateAllPilgrimageData(): Promise<void> {
  const file = await loadFile<AnitabiCrossIndexFile>(
    ANITABI_CROSS_INDEX_URL,
    ANITABI_CROSS_INDEX_FILENAME
  );
  if (
    file &&
    Array.isArray(file.entries) &&
    hasSufficientRuntimeCoverage(getCrossIndexSize(), file.entries.length)
  ) {
    hydrateAnitabiCrossIndex(file);
  }
}

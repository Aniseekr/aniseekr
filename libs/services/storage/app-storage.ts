// App-wide preference storage, backed by MMKV.
//
// Why MMKV: AsyncStorage reads are asynchronous, which forces every screen to
// render a default value on frame 1 and re-render once the read resolves.
// MMKV is memory-mapped and synchronous, so a `useState` initializer can seed
// the correct value on the first frame — no flash, no extra render.
//
// Scope: only preference-shaped data lives here (theme, map/camera prefs, user
// prefs). Network-fetched payloads stay on expo-sqlite via CacheService —
// MMKV holds its whole dataset in RAM and is not a fit for large caches.

import {
  CAPTURES_STORAGE_KEY,
  MIGRATED_KEYS,
  SPOT_INTENTS_STORAGE_KEY,
  VISITED_SPOTS_STORAGE_KEY,
} from './keys';

/**
 * The subset of the `react-native-mmkv` instance API this module and the
 * preference services depend on. Declared locally so unit tests (Node, no
 * native binding) can substitute an in-memory implementation.
 */
export interface MMKVLike {
  set(key: string, value: string | number | boolean): void;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  contains(key: string): boolean;
  remove(key: string): boolean;
  clearAll(): void;
  getAllKeys(): string[];
}

function createInMemoryStore(): MMKVLike {
  const map = new Map<string, string | number | boolean>();
  return {
    set: (key, value) => {
      map.set(key, value);
    },
    getString: (key) => {
      const v = map.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber: (key) => {
      const v = map.get(key);
      return typeof v === 'number' ? v : undefined;
    },
    getBoolean: (key) => {
      const v = map.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    contains: (key) => map.has(key),
    remove: (key) => map.delete(key),
    clearAll: () => map.clear(),
    getAllKeys: () => [...map.keys()],
  };
}

/**
 * Single MMKV instance for all migrated preferences. One instance keeps the
 * mmap'd-region count low; splitting into more instances only pays off for
 * separate encryption keys or App Group sharing, neither of which applies.
 *
 * `require` is used (not a static import) so environments without the native
 * binding — Node unit tests, web SSR — fall back to an in-memory store, the
 * same pattern the AsyncStorage-era pref modules used.
 */
function canUseInMemoryFallback(): boolean {
  const processLike = globalThis.process;
  return (
    processLike?.env?.NODE_ENV === 'test' ||
    processLike?.env?.JEST_WORKER_ID != null ||
    processLike?.env?.VITEST_WORKER_ID != null ||
    typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
  );
}

export const appStorage: MMKVLike = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    return createMMKV({ id: 'aniseekr' }) as MMKVLike;
  } catch (err) {
    if (!canUseInMemoryFallback()) throw err;
    return createInMemoryStore();
  }
})();

/** Subset of the AsyncStorage API the one-time migration reads from. */
export interface MigrationSource {
  getItem(key: string): Promise<string | null>;
}

function defaultMigrationSource(): MigrationSource | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
}

// Flag is itself stored in MMKV so the migration runs exactly once per install,
// surviving across cold starts. Not part of MIGRATED_KEYS — it never migrates.
const MIGRATION_FLAG = '__mmkv_migrated_async_v1';

let migrationPromise: Promise<void> | null = null;

/** True once the AsyncStorage → MMKV migration has completed on this device. */
export function isMigrated(): boolean {
  return appStorage.getBoolean(MIGRATION_FLAG) === true;
}

function parsePlainObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mergeVisitedMaps(incomingRaw: string, existingRaw: string): string {
  const incoming = parsePlainObject(incomingRaw) ?? {};
  const existing = parsePlainObject(existingRaw) ?? {};
  const merged: Record<string, true> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === true) merged[key] = true;
  }
  for (const [key, value] of Object.entries(existing)) {
    if (value === true) merged[key] = true;
  }
  return JSON.stringify(merged);
}

function normalizeIntent(value: unknown): { saved?: true; planned?: true } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const intent: { saved?: true; planned?: true } = {};
  if (source.saved === true) intent.saved = true;
  if (source.planned === true) intent.planned = true;
  return intent.saved || intent.planned ? intent : null;
}

function mergeSpotIntentMaps(incomingRaw: string, existingRaw: string): string {
  const incoming = parsePlainObject(incomingRaw) ?? {};
  const existing = parsePlainObject(existingRaw) ?? {};
  const merged: Record<string, { saved?: true; planned?: true }> = {};
  for (const [spotId, rawIntent] of Object.entries(incoming)) {
    const intent = normalizeIntent(rawIntent);
    if (intent) merged[spotId] = intent;
  }
  for (const [spotId, rawIntent] of Object.entries(existing)) {
    const intent = normalizeIntent(rawIntent);
    if (!intent) continue;
    merged[spotId] = { ...(merged[spotId] ?? {}), ...intent };
  }
  return JSON.stringify(merged);
}

function readCaptureSpots(raw: string | null): Record<string, unknown> {
  const index = parsePlainObject(raw);
  const spots = index?.spots;
  if (!spots || typeof spots !== 'object' || Array.isArray(spots)) return {};
  return spots as Record<string, unknown>;
}

function mergeCaptureIndexes(incomingRaw: string, existingRaw: string): string {
  return JSON.stringify({
    spots: {
      ...readCaptureSpots(incomingRaw),
      ...readCaptureSpots(existingRaw),
    },
  });
}

function valueForMigrationWrite(key: string, incomingRaw: string): string {
  const existingRaw = kvGet(key);
  if (existingRaw == null) return incomingRaw;

  switch (key) {
    case VISITED_SPOTS_STORAGE_KEY:
      return mergeVisitedMaps(incomingRaw, existingRaw);
    case SPOT_INTENTS_STORAGE_KEY:
      return mergeSpotIntentMaps(incomingRaw, existingRaw);
    case CAPTURES_STORAGE_KEY:
      return mergeCaptureIndexes(incomingRaw, existingRaw);
    default:
      return existingRaw;
  }
}

/**
 * One-time copy of the migrated preference keys from AsyncStorage into MMKV.
 * Idempotent and concurrency-safe: the in-flight promise is shared, and the
 * MMKV-backed flag short-circuits every launch after the first.
 *
 * Existing AsyncStorage rows are left in place — the payloads are tiny and
 * keeping them means a downgrade to a pre-MMKV build still finds its data.
 * Keys already present in MMKV are never overwritten, so a value the user
 * changed post-migration is authoritative.
 *
 * `source` is injectable for tests; production passes nothing and the real
 * AsyncStorage module is resolved lazily.
 */
export function migrateToMMKV(source?: MigrationSource): Promise<void> {
  if (isMigrated()) return Promise.resolve();
  if (migrationPromise) return migrationPromise;

  const asyncStorage = source ?? defaultMigrationSource();

  migrationPromise = (async () => {
    let hadReadFailure = false;

    if (asyncStorage) {
      for (const key of MIGRATED_KEYS) {
        try {
          const value = await asyncStorage.getItem(key);
          if (value != null) appStorage.set(key, valueForMigrationWrite(key, value));
        } catch {
          hadReadFailure = true;
        }
      }
    }

    if (hadReadFailure) {
      migrationPromise = null;
      return;
    }

    appStorage.set(MIGRATION_FLAG, true);
  })();

  return migrationPromise;
}

/** Synchronous string read. Returns `null` on miss — mirrors AsyncStorage. */
export function kvGet(key: string): string | null {
  return appStorage.getString(key) ?? null;
}

/** Synchronous string write. */
export function kvSet(key: string, value: string): void {
  appStorage.set(key, value);
}

/** Synchronous delete. */
export function kvRemove(key: string): void {
  appStorage.remove(key);
}

/** Test-only — drop the cached in-flight migration promise. */
export function __resetAppStorageForTests(): void {
  migrationPromise = null;
}

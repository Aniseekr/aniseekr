import * as SQLite from 'expo-sqlite';

const DB_NAME = 'aniseekr_cache.db';

// Cache the in-flight open as a promise so concurrent callers share one handle.
// See libs/db.ts for the same fix and the Android NullPointerException it avoids.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Synchronous in-memory mirror so cache hits don't block the first paint.
// Set() writes both layers; get()/getSync() check memory first. Bounded LRU.
// See CLAUDE.md Rule 10.
//
// Reads never delete. A row past its ttl is still the stale copy that a
// stale-while-revalidate caller (getWithMeta / getSyncWithMeta with graceMs)
// renders while it refreshes, so a plain get()/getSync() must not destroy it
// for them. Expired rows are removed only by prune().
type MemEntry = { value: unknown; timestamp: number; ttl: number };
type MemPool = { map: Map<string, MemEntry>; max: number };

const mainPool: MemPool = { map: new Map(), max: 256 };
// Localized titles are one tiny row per anime. Sharing the main pool let one
// long list scroll flush every large hot entry (details, seasonal, Atlas) out.
const prefixPools: readonly { prefix: string; pool: MemPool }[] = [
  { prefix: 'title_loc_', pool: { map: new Map(), max: 2048 } },
];

/**
 * Stale rows prune() keeps by default: the longest graceMs any SWR caller uses
 * (Atlas, 30 days). Boot-time pruning with a strict ttl cut would wipe every
 * grace window on each restart, so the offline copy never survived a relaunch.
 */
export const STALE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function poolFor(key: string): MemPool {
  for (const { prefix, pool } of prefixPools) if (key.startsWith(prefix)) return pool;
  return mainPool;
}

function* memEntries(): Generator<[string, MemEntry]> {
  yield* mainPool.map;
  for (const { pool } of prefixPools) yield* pool.map;
}

function memDelete(key: string) {
  poolFor(key).map.delete(key);
}

function memClear() {
  mainPool.map.clear();
  for (const { pool } of prefixPools) pool.map.clear();
}

function memTouch(key: string, entry: MemEntry) {
  const pool = poolFor(key);
  pool.map.delete(key);
  pool.map.set(key, entry);
  if (pool.map.size > pool.max) {
    const oldest = pool.map.keys().next().value as string | undefined;
    if (oldest !== undefined) pool.map.delete(oldest);
  }
}

/** Memory lookup with no freshness rule. Refreshes LRU recency on hit. */
function memRead(key: string): { entry: MemEntry; age: number } | null {
  const pool = poolFor(key);
  const entry = pool.map.get(key);
  if (!entry) return null;
  pool.map.delete(key);
  pool.map.set(key, entry);
  return { entry, age: Date.now() - entry.timestamp };
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT,
    timestamp INTEGER,
    ttl INTEGER
  );
`;

function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const opened = await SQLite.openDatabaseAsync(DB_NAME);
        await opened.execAsync(CREATE_TABLE_SQL);
        return opened;
      } catch (err) {
        dbPromise = null;
        throw err;
      }
    })();
  }
  return dbPromise;
}

export interface CachedMeta<T> {
  value: T;
  /** Milliseconds since the entry was written. */
  age: number;
  /** True when age has passed ttl but is still within the caller's graceMs. */
  isStale: boolean;
}

export interface CacheGroupStats {
  entries: number;
  bytes: number;
  expiredEntries: number;
  expiredBytes: number;
}

export interface CacheStats {
  totalEntries: number;
  totalBytes: number;
  expiredEntries: number;
  expiredBytes: number;
  /** Bytes/entries grouped by the longest matching registered prefix, or 'misc'. */
  byPrefix: Map<string, CacheGroupStats>;
  /** Oldest / newest write timestamps (ms since epoch). 0 when the table is empty. */
  oldestTimestamp: number;
  newestTimestamp: number;
}

export class CacheService {
  static async init() {
    await openDb();
  }

  /**
   * Cold-launch seed of the memory mirror for a few first-paint keys, read
   * synchronously so `useState(() => …Sync())` hits on frame 1 of a cold
   * launch instead of only after the first async read. The opened handle
   * becomes the shared connection. Keep the key list small: every row is
   * parsed on the JS thread before the first render. Returns rows mirrored;
   * no-op (0) when the DB is already open or the sync API is unavailable.
   */
  static warmSync(keys: readonly string[]): number {
    if (dbPromise || keys.length === 0 || typeof SQLite.openDatabaseSync !== 'function') return 0;
    try {
      const db = SQLite.openDatabaseSync(DB_NAME);
      db.execSync(CREATE_TABLE_SQL);
      dbPromise = Promise.resolve(db);
      const rows = db.getAllSync<{ key: string; value: string; timestamp: number; ttl: number }>(
        `SELECT key, value, timestamp, ttl FROM cache WHERE key IN (${keys.map(() => '?').join(',')})`,
        [...keys]
      );
      let warmed = 0;
      for (const row of rows) {
        try {
          memTouch(row.key, {
            value: JSON.parse(row.value),
            timestamp: row.timestamp,
            ttl: row.ttl,
          });
          warmed += 1;
        } catch {
          // A corrupt row stays a cold miss; the async path re-fetches it.
        }
      }
      return warmed;
    } catch (error) {
      console.warn('CacheService.warmSync error:', error);
      return 0;
    }
  }

  /**
   * Synchronous read against the in-memory mirror only. Returns `null` on miss
   * (memory cold, expired, or never written this session). Designed for the
   * first-paint path of detail screens — see CLAUDE.md Rule 10. Use inside a
   * lazy `useState` initializer to seed initial state without an `await`.
   */
  static getSync<T>(key: string): T | null {
    const hit = memRead(key);
    return hit && hit.age <= hit.entry.ttl ? (hit.entry.value as T) : null;
  }

  /** Sync variant of getWithMeta — memory mirror only. Returns null on miss. */
  static getSyncWithMeta<T>(key: string, graceMs = 0): CachedMeta<T> | null {
    const hit = memRead(key);
    if (!hit || hit.age > hit.entry.ttl + graceMs) return null;
    return { value: hit.entry.value as T, age: hit.age, isStale: hit.age > hit.entry.ttl };
  }

  static async get<T>(key: string): Promise<T | null> {
    // Memory is never older than SQLite (set() writes both), so a memory hit
    // answers fresh-or-stale without a SQLite round-trip or a re-parse.
    const memHit = memRead(key);
    if (memHit) return memHit.age <= memHit.entry.ttl ? (memHit.entry.value as T) : null;

    try {
      const db = await openDb();
      const result = await db.getFirstAsync<{
        value: string;
        timestamp: number;
        ttl: number;
      }>('SELECT value, timestamp, ttl FROM cache WHERE key = ?', key);

      if (!result) return null;

      const parsed = JSON.parse(result.value) as T;
      // Mirror stale rows too: an SWR caller may still render them.
      memTouch(key, { value: parsed, timestamp: result.timestamp, ttl: result.ttl });
      return Date.now() - result.timestamp > result.ttl ? null : parsed;
    } catch (error) {
      console.warn('CacheService.get error:', error);
      return null;
    }
  }

  /**
   * Stale-while-revalidate variant of `get`. Within `ttl` the entry is fresh
   * (isStale=false). Within `ttl + graceMs` it is returned with isStale=true
   * so the caller can render it instantly while triggering a background
   * refresh. Past `ttl + graceMs` the row is deleted and `null` is returned.
   */
  static async getWithMeta<T>(key: string, graceMs: number = 0): Promise<CachedMeta<T> | null> {
    const memHit = memRead(key);
    if (memHit) {
      const { entry, age } = memHit;
      if (age > entry.ttl + graceMs) return null;
      return { value: entry.value as T, age, isStale: age > entry.ttl };
    }

    try {
      const db = await openDb();
      const result = await db.getFirstAsync<{
        value: string;
        timestamp: number;
        ttl: number;
      }>('SELECT value, timestamp, ttl FROM cache WHERE key = ?', key);

      if (!result) return null;

      const age = Date.now() - result.timestamp;
      // Past this caller's grace, but another caller may allow a longer one.
      if (age > result.ttl + graceMs) return null;

      const parsed = JSON.parse(result.value) as T;
      memTouch(key, { value: parsed, timestamp: result.timestamp, ttl: result.ttl });
      return { value: parsed, age, isStale: age > result.ttl };
    } catch (error) {
      console.warn('CacheService.getWithMeta error:', error);
      return null;
    }
  }

  /** List persisted and in-memory entries for a literal key prefix. */
  static async getEntriesByPrefix<T>(prefix: string): Promise<{ key: string; value: T }[]> {
    const db = await openDb();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM cache WHERE substr(key, 1, ?) = ?',
      prefix.length,
      prefix
    );
    const entries = new Map<string, T>();
    for (const row of rows) {
      try {
        entries.set(row.key, JSON.parse(row.value) as T);
      } catch {
        // A corrupt cache value should not hide other recoverable rows.
      }
    }
    for (const [key, entry] of memEntries()) {
      if (key.startsWith(prefix)) entries.set(key, entry.value as T);
    }
    return [...entries].map(([key, value]) => ({ key, value }));
  }

  static async set(key: string, value: any, ttlMs: number = 3600000) {
    const timestamp = Date.now();
    memTouch(key, { value, timestamp, ttl: ttlMs });
    try {
      const db = await openDb();
      const stringValue = JSON.stringify(value);
      await db.runAsync(
        'INSERT OR REPLACE INTO cache (key, value, timestamp, ttl) VALUES (?, ?, ?, ?)',
        key,
        stringValue,
        timestamp,
        ttlMs
      );
    } catch (error) {
      console.warn('CacheService.set error:', error);
    }
  }

  static async delete(key: string) {
    memDelete(key);
    try {
      const db = await openDb();
      await db.runAsync('DELETE FROM cache WHERE key = ?', key);
    } catch (error) {
      console.warn('CacheService.delete error:', error);
    }
  }

  /** Delete every cache entry whose key begins with `prefix`. */
  static async deleteByPrefix(prefix: string): Promise<void> {
    for (const [key] of Array.from(memEntries())) {
      if (key.startsWith(prefix)) memDelete(key);
    }
    const db = await openDb();
    await db.runAsync('DELETE FROM cache WHERE substr(key, 1, ?) = ?', prefix.length, prefix);
  }

  static async clear() {
    memClear();
    try {
      const db = await openDb();
      await db.runAsync('DELETE FROM cache');
    } catch (error) {
      console.warn('CacheService.clear error:', error);
    }
  }

  /**
   * Aggregate statistics across the whole cache table. Reads `(key, length(value),
   * timestamp, ttl)` for every row — payloads themselves are not loaded, so this
   * is cheap even with thousands of rows.
   *
   * When `prefixes` is provided, each row is grouped under the **longest** prefix
   * that `key.startsWith(prefix)` matches; non-matching rows fall into `'misc'`.
   * When omitted, rows are grouped under the substring up to (and including) the
   * first `_` so callers get a coarse but useful breakdown without registration.
   */
  static async stats(prefixes?: readonly string[]): Promise<CacheStats> {
    const empty: CacheStats = {
      totalEntries: 0,
      totalBytes: 0,
      expiredEntries: 0,
      expiredBytes: 0,
      byPrefix: new Map(),
      oldestTimestamp: 0,
      newestTimestamp: 0,
    };

    try {
      const db = await openDb();
      const rows = await db.getAllAsync<{
        key: string;
        bytes: number;
        timestamp: number;
        ttl: number;
      }>('SELECT key, length(value) AS bytes, timestamp, ttl FROM cache');

      if (!rows || rows.length === 0) return empty;

      // Sort descending by length so the longest matching prefix wins.
      const sortedPrefixes = prefixes ? [...prefixes].sort((a, b) => b.length - a.length) : null;

      const byPrefix = new Map<string, CacheGroupStats>();
      const now = Date.now();
      let totalEntries = 0;
      let totalBytes = 0;
      let expiredEntries = 0;
      let expiredBytes = 0;
      let oldestTimestamp = Infinity;
      let newestTimestamp = 0;

      for (const row of rows) {
        const bytes = Number(row.bytes) || 0;
        const ts = Number(row.timestamp) || 0;
        const ttl = Number(row.ttl) || 0;
        const isExpired = ts + ttl < now;

        totalEntries += 1;
        totalBytes += bytes;
        if (isExpired) {
          expiredEntries += 1;
          expiredBytes += bytes;
        }
        if (ts > 0) {
          if (ts < oldestTimestamp) oldestTimestamp = ts;
          if (ts > newestTimestamp) newestTimestamp = ts;
        }

        let group = 'misc';
        if (sortedPrefixes) {
          const match = sortedPrefixes.find((p) => row.key.startsWith(p));
          if (match) group = match;
        } else {
          const idx = row.key.indexOf('_');
          group = idx > 0 ? row.key.slice(0, idx + 1) : 'misc';
        }

        const existing = byPrefix.get(group);
        if (existing) {
          existing.entries += 1;
          existing.bytes += bytes;
          if (isExpired) {
            existing.expiredEntries += 1;
            existing.expiredBytes += bytes;
          }
        } else {
          byPrefix.set(group, {
            entries: 1,
            bytes,
            expiredEntries: isExpired ? 1 : 0,
            expiredBytes: isExpired ? bytes : 0,
          });
        }
      }

      return {
        totalEntries,
        totalBytes,
        expiredEntries,
        expiredBytes,
        byPrefix,
        oldestTimestamp: oldestTimestamp === Infinity ? 0 : oldestTimestamp,
        newestTimestamp,
      };
    } catch (error) {
      console.warn('CacheService.stats error:', error);
      return empty;
    }
  }

  /** Delete every row whose key begins with `prefix`. Returns the row count removed. */
  static async clearByPrefix(prefix: string): Promise<number> {
    if (!prefix) return 0;
    for (const [k] of Array.from(memEntries())) if (k.startsWith(prefix)) memDelete(k);
    try {
      const db = await openDb();
      // SQLite LIKE wildcard: escape `_` / `%` so prefixes that contain them
      // (e.g. `anime_detail_`) behave as literal-prefix matches.
      const escaped = prefix.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      const result = await db.runAsync(
        "DELETE FROM cache WHERE key LIKE ? ESCAPE '\\'",
        `${escaped}%`
      );
      return result?.changes ?? 0;
    } catch (error) {
      console.warn('CacheService.clearByPrefix error:', error);
      return 0;
    }
  }

  /**
   * Delete rows whose key begins with `prefix` AND whose serialized value
   * equals `valueJson` exactly. Used by TitleLocalizationService to flush
   * negative entries (`{"v":null}`) after a mapping-data refresh without
   * touching positive hits. Returns the SQLite row count removed (mem-mirror
   * evictions are not counted).
   */
  static async clearByPrefixWhereValue(prefix: string, valueJson: string): Promise<number> {
    if (!prefix) return 0;
    for (const [k, e] of Array.from(memEntries())) {
      if (k.startsWith(prefix) && JSON.stringify(e.value) === valueJson) memDelete(k);
    }
    try {
      const db = await openDb();
      const escaped = prefix.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      const result = await db.runAsync(
        "DELETE FROM cache WHERE key LIKE ? ESCAPE '\\' AND value = ?",
        `${escaped}%`,
        valueJson
      );
      return result?.changes ?? 0;
    } catch (error) {
      console.warn('CacheService.clearByPrefixWhereValue error:', error);
      return 0;
    }
  }

  /**
   * Remove every row whose `timestamp + ttl + retainStaleMs < now`. Returns the
   * row count removed. Pass `STALE_RETENTION_MS` for routine (boot) pruning so
   * SWR grace windows survive a relaunch; `0` drops everything past its ttl.
   */
  static async prune(retainStaleMs = 0): Promise<number> {
    const cutoff = Date.now() - retainStaleMs;
    for (const [k, e] of Array.from(memEntries())) {
      if (e.timestamp + e.ttl < cutoff) memDelete(k);
    }
    try {
      const db = await openDb();
      const result = await db.runAsync('DELETE FROM cache WHERE timestamp + ttl < ?', cutoff);
      return result?.changes ?? 0;
    } catch (error) {
      console.warn('CacheService.prune error:', error);
      return 0;
    }
  }

  /** Reclaim disk space after a large delete. SQLite VACUUM rewrites the DB file. */
  static async vacuum(): Promise<void> {
    try {
      const db = await openDb();
      await db.execAsync('VACUUM');
    } catch (error) {
      console.warn('CacheService.vacuum error:', error);
    }
  }

  /**
   * Approximate disk footprint of the SQLite file itself. Reflects the on-disk
   * cost of the cache DB after VACUUM, not the in-table content size — for the
   * latter use `stats().totalBytes`.
   */
  static async getDatabaseFileSize(): Promise<number> {
    try {
      const db = await openDb();
      const row = await db.getFirstAsync<{ size: number }>(
        'SELECT (page_count * page_size) AS size FROM pragma_page_count(), pragma_page_size()'
      );
      return Number(row?.size) || 0;
    } catch {
      return 0;
    }
  }

  /** List all keys in the cache. Cheap because values are not loaded. */
  static async allKeys(): Promise<string[]> {
    try {
      const db = await openDb();
      const rows = await db.getAllAsync<{ key: string }>('SELECT key FROM cache');
      return (rows ?? []).map((r) => r.key);
    } catch (error) {
      console.warn('CacheService.allKeys error:', error);
      return [];
    }
  }
}

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'aniseekr_cache.db';

// Cache the in-flight open as a promise so concurrent callers share one handle.
// See libs/db.ts for the same fix and the Android NullPointerException it avoids.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const opened = await SQLite.openDatabaseAsync(DB_NAME);
        await opened.execAsync(`
          CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            value TEXT,
            timestamp INTEGER,
            ttl INTEGER
          );
        `);
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

  static async get<T>(key: string): Promise<T | null> {
    try {
      const db = await openDb();
      const result = await db.getFirstAsync<{
        value: string;
        timestamp: number;
        ttl: number;
      }>('SELECT value, timestamp, ttl FROM cache WHERE key = ?', key);

      if (!result) return null;

      const now = Date.now();
      if (now - result.timestamp > result.ttl) {
        await this.delete(key);
        return null;
      }

      return JSON.parse(result.value) as T;
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
    try {
      const db = await openDb();
      const result = await db.getFirstAsync<{
        value: string;
        timestamp: number;
        ttl: number;
      }>('SELECT value, timestamp, ttl FROM cache WHERE key = ?', key);

      if (!result) return null;

      const age = Date.now() - result.timestamp;
      if (age > result.ttl + graceMs) {
        await this.delete(key);
        return null;
      }

      return {
        value: JSON.parse(result.value) as T,
        age,
        isStale: age > result.ttl,
      };
    } catch (error) {
      console.warn('CacheService.getWithMeta error:', error);
      return null;
    }
  }

  static async set(key: string, value: any, ttlMs: number = 3600000) {
    try {
      const db = await openDb();
      const stringValue = JSON.stringify(value);
      const timestamp = Date.now();
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
    try {
      const db = await openDb();
      await db.runAsync('DELETE FROM cache WHERE key = ?', key);
    } catch (error) {
      console.warn('CacheService.delete error:', error);
    }
  }

  static async clear() {
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
      const sortedPrefixes = prefixes
        ? [...prefixes].sort((a, b) => b.length - a.length)
        : null;

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

  /** Remove every row whose `timestamp + ttl < now`. Returns the row count removed. */
  static async prune(): Promise<number> {
    try {
      const db = await openDb();
      const result = await db.runAsync(
        'DELETE FROM cache WHERE timestamp + ttl < ?',
        Date.now()
      );
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

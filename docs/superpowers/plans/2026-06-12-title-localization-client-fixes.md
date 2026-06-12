# Title Localization Client Fixes (A1–A3 + B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chinese titles resolve from local `name_cn` data (offline-first), Russian titles resolve via the Shikimori≡MAL alias, and negative-cache poisoning structurally impossible.

**Architecture:** Per `docs/superpowers/specs/2026-06-12-title-localization-data-core-design.md`. Four layers touched: `CacheService` (targeted negative-entry delete), `IDMappingService` (shikimori alias, `getChineseTitleSource`, `name_cn` ingest, `updateMappings → boolean`), `LocalDB` (column migration + one-time meta reset), `TitleLocalizationService` (v2 cache keys, readiness guard, local-first chinese resolution, flush-on-import). The client must tolerate mapping data that does not yet carry `name_cn`/`bangumi_id` keys (B1 ships independently).

**Tech Stack:** Expo SQLite (mocked by `test-setup.ts` FakeDatabase), Bun tests (`bun run test:unit`), strict TS (`bunx tsc --noEmit`).

**Performance constraints baked in:**
- Chinese resolution = exactly **one** SQLite SELECT (`name_cn` + `bangumi_id` together) before any network.
- Mapping-readiness check memoizes once-true (no per-item meta SELECT after first success).
- Negative flush = one SQL DELETE (`LIKE prefix AND value = '{"v":null}'`), not a key scan in JS.
- Nothing on the React render path changes — all work stays inside `ensure()`'s queue.

---

### Task 1: `CacheService.clearByPrefixWhereValue`

**Files:**
- Modify: `libs/services/cache-service.ts` (after `clearByPrefix`, ~line 340)
- Modify: `test-setup.ts` (FakeDatabase DELETE branch, before the existing `WHERE KEY LIKE` branch at ~line 369)
- Test: `__tests__/unit/cache-service.test.ts`

- [ ] **Step 1: Write the failing test** (append to `cache-service.test.ts`, follow its existing setup style — read the file's first describe block to mirror init/reset conventions):

```ts
describe('CacheService.clearByPrefixWhereValue', () => {
  it('CSV-001 deletes only entries matching prefix AND exact serialized value', async () => {
    await CacheService.set('title_loc_v2_chinese_anilist_1', { v: null }, 60_000);
    await CacheService.set('title_loc_v2_chinese_anilist_2', { v: '進擊的巨人' }, 60_000);
    await CacheService.set('other_key', { v: null }, 60_000);

    const removed = await CacheService.clearByPrefixWhereValue(
      'title_loc_v2_',
      JSON.stringify({ v: null })
    );

    expect(removed).toBe(1);
    expect(CacheService.getSync('title_loc_v2_chinese_anilist_1')).toBeNull();
    expect(CacheService.getSync<{ v: string }>('title_loc_v2_chinese_anilist_2')?.v).toBe(
      '進擊的巨人'
    );
    expect(CacheService.getSync<{ v: null }>('other_key')?.v).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --preload ./test-setup.ts __tests__/unit/cache-service.test.ts`
Expected: FAIL — `clearByPrefixWhereValue is not a function`

- [ ] **Step 3: Implement.** In `cache-service.ts` after `clearByPrefix`:

```ts
  /**
   * Delete rows whose key begins with `prefix` AND whose serialized value
   * equals `valueJson` exactly. Used by TitleLocalizationService to flush
   * negative entries (`{"v":null}`) after a mapping-data refresh without
   * touching positive hits. Returns the row count removed.
   */
  static async clearByPrefixWhereValue(prefix: string, valueJson: string): Promise<number> {
    if (!prefix) return 0;
    for (const [k, e] of Array.from(mem.entries())) {
      if (k.startsWith(prefix) && JSON.stringify(e.value) === valueJson) mem.delete(k);
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
```

In `test-setup.ts`, inside the `DELETE FROM CACHE` handling, **before** the existing `WHERE KEY LIKE` branch:

```ts
      // DELETE FROM cache WHERE key LIKE ? ESCAPE '\' AND value = ?
      if (upper.includes('WHERE KEY LIKE') && upper.includes('AND VALUE = ?')) {
        const raw = String(params[0] ?? '');
        const valueJson = String(params[1] ?? '');
        const literal = raw
          .replace(/%$/, '')
          .replace(/\\_/g, '_')
          .replace(/\\%/g, '%')
          .replace(/\\\\/g, '\\');
        let removed = 0;
        for (const [k, v] of [...this.cache.entries()]) {
          if (k.startsWith(literal) && v.value === valueJson) {
            this.cache.delete(k);
            removed++;
          }
        }
        result.changes = removed;
        return result;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --preload ./test-setup.ts __tests__/unit/cache-service.test.ts`
Expected: PASS (all existing cache tests too)

- [ ] **Step 5: Commit**

```bash
git add libs/services/cache-service.ts test-setup.ts __tests__/unit/cache-service.test.ts
git commit -m "feat(cache): clearByPrefixWhereValue for targeted negative-entry flush"
```

---

### Task 2: Shikimori ≡ MAL alias in `IDMappingService`

**Files:**
- Modify: `libs/services/sync/id-mapping-service.ts` (`mapID` ~line 200, `mapAllPlatforms` ~line 232)
- Test: `__tests__/unit/id-mapping-service.test.ts`

Shikimori reuses MAL numeric IDs; our dataset intentionally never ships `shikimori_id` (spec B1). Alias rules: target `shikimori` → prefer explicit `shikimori_id`, else `mal_id`. Source `shikimori` → try `shikimori_id` column, else re-query `mal_id` column.

- [ ] **Step 1: Write the failing tests** (append to the existing describe; the FakeDatabase returns rows from a `getFirstAsync` spy):

```ts
  it('IDM-007 maps to shikimori via mal_id when shikimori_id column is empty', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      shikimori_id: null,
      mal_id: 5114,
    } as never);
    const mapped = await svc.mapID('anilist', 5114, 'shikimori');
    expect(mapped).toBe('5114');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('IDM-008 explicit shikimori_id wins over the mal alias', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      shikimori_id: 999,
      mal_id: 5114,
    } as never);
    const mapped = await svc.mapID('anilist', 5114, 'shikimori');
    expect(mapped).toBe('999');
    spy.mockRestore();
  });

  it('IDM-009 maps from shikimori by falling back to the mal_id column', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync')
      .mockResolvedValueOnce(null as never) // WHERE shikimori_id = ? → no row
      .mockResolvedValueOnce({ anilist_id: 5114 } as never); // WHERE mal_id = ?
    const mapped = await svc.mapID('shikimori', 5114, 'anilist');
    expect(mapped).toBe(5114);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('IDM-010 mapAllPlatforms aliases shikimori from mal_id', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      mal_id: 5114,
      anilist_id: 5114,
      kitsu_id: null,
      bangumi_id: null,
      shikimori_id: null,
      simkl_id: null,
      annict_id: null,
    } as never);
    const all = await svc.mapAllPlatforms('anilist', '5114');
    expect(all.shikimori).toBe('5114');
    expect(all.myanimelist).toBe('5114');
    spy.mockRestore();
  });
```

Note: `mapID` returns the raw SQLite value for the generic path (number) but `String(...)` for alias paths — assertions above match the implementation below. Keep `String()` coercion at the call site (`title-localization-service` already does `String(mappedId)`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/id-mapping-service.test.ts`
Expected: IDM-007/008 FAIL (generic path returns `null` from the single-column SELECT — the spy row has no `shikimori_id`-only column shape), IDM-009 FAIL (returns null), IDM-010 FAIL (`all.shikimori` undefined)

- [ ] **Step 3: Implement.** Replace the body of `mapID` from the `fromCol`/`toCol` resolution down:

```ts
  async mapID(
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string
  ): Promise<string | number | null> {
    if (fromPlatform === toPlatform) return fromId;

    const manual = this.getManualMapping(fromPlatform, fromId, toPlatform);
    if (manual !== null) return manual;

    const fromCol = this.getColumnName(fromPlatform);
    const toCol = this.getColumnName(toPlatform);
    if (!fromCol || !toCol) return null;

    const db = await LocalDB.getDatabase();

    // Shikimori reuses MAL numeric IDs and our dataset doesn't carry a
    // dedicated shikimori_id (see 2026-06-12 title-localization spec), so the
    // alias lives here, once, for every caller.
    if (toPlatform === 'shikimori') {
      const row = await db.getFirstAsync<{
        shikimori_id: number | string | null;
        mal_id: number | string | null;
      }>(`SELECT shikimori_id, mal_id FROM id_mappings WHERE ${fromCol} = ? LIMIT 1`, fromId);
      const v = row ? (row.shikimori_id ?? row.mal_id) : null;
      return v == null || v === '' ? null : String(v);
    }

    if (fromPlatform === 'shikimori') {
      const direct = await db.getFirstAsync<Record<string, string | number>>(
        `SELECT ${toCol} FROM id_mappings WHERE shikimori_id = ? LIMIT 1`,
        fromId
      );
      if (direct) return direct[toCol] ?? null;
      const viaMal = await db.getFirstAsync<Record<string, string | number>>(
        `SELECT ${toCol} FROM id_mappings WHERE mal_id = ? LIMIT 1`,
        fromId
      );
      return viaMal ? (viaMal[toCol] ?? null) : null;
    }

    const result = await db.getFirstAsync<Record<string, string | number>>(
      `SELECT ${toCol} FROM id_mappings WHERE ${fromCol} = ? LIMIT 1`,
      fromId
    );

    return result ? (result[toCol] ?? null) : null;
  }
```

In `mapAllPlatforms`, after the `for (const [col, platform] of Object.entries(COLUMN_TO_PLATFORM))` loop:

```ts
    // Shikimori ≡ MAL alias (no dedicated shikimori_id in the dataset).
    if (!out.shikimori && out.myanimelist) {
      out.shikimori = out.myanimelist;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --preload ./test-setup.ts __tests__/unit/id-mapping-service.test.ts`
Expected: PASS (IDM-001…010)

- [ ] **Step 5: Commit**

```bash
git add libs/services/sync/id-mapping-service.ts __tests__/unit/id-mapping-service.test.ts
git commit -m "feat(sync): shikimori IDs alias to mal_id in IDMappingService"
```

---

### Task 3: `getChineseTitleSource` + `name_cn` ingest in `IDMappingService`

**Files:**
- Modify: `libs/services/sync/id-mapping-service.ts` (`AnimeMapping` interface ~line 24, `bulkInsert` ~line 126, new method after `mapAllPlatforms`)
- Test: `__tests__/unit/id-mapping-service.test.ts`

- [ ] **Step 1: Write the failing tests:**

```ts
  it('IDM-011 getChineseTitleSource returns trimmed name_cn and stringified bangumi_id', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      name_cn: '  進擊的巨人 ',
      bangumi_id: 23686,
    } as never);
    const src = await svc.getChineseTitleSource('anilist', '16498');
    expect(src).toEqual({ nameCn: '進擊的巨人', bangumiId: '23686' });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('IDM-012 getChineseTitleSource nullifies empty fields and missing rows', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync')
      .mockResolvedValueOnce({ name_cn: '', bangumi_id: null } as never)
      .mockResolvedValueOnce(null as never);
    expect(await svc.getChineseTitleSource('anilist', '1')).toEqual({
      nameCn: null,
      bangumiId: null,
    });
    expect(await svc.getChineseTitleSource('anilist', '2')).toBeNull();
    spy.mockRestore();
  });

  it('IDM-013 getChineseTitleSource honors a manual bangumi override', async () => {
    const svc = IDMappingService.getInstance();
    svc.setManualMapping('anilist', 16498, 'bangumi', 99999);
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      name_cn: null,
      bangumi_id: 23686,
    } as never);
    const src = await svc.getChineseTitleSource('anilist', '16498');
    expect(src?.bangumiId).toBe('99999');
    spy.mockRestore();
  });

  it('IDM-014 getChineseTitleSource uses the id itself for bangumi-platform items', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue(null as never);
    const src = await svc.getChineseTitleSource('bangumi', '23686');
    expect(src).toEqual({ nameCn: null, bangumiId: '23686' });
    spy.mockRestore();
  });

  it('IDM-015 bulkInsert writes name_cn through the prepared statement', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const captured: unknown[][] = [];
    const spy = spyOn(db, 'prepareAsync').mockResolvedValue({
      executeAsync: async (params: unknown[]) => {
        captured.push(params as unknown[]);
        return { changes: 1, lastInsertRowId: 0 };
      },
      finalizeAsync: async () => {},
    } as never);
    await svc.bulkInsert([{ mal_id: 1, bangumi_id: 2, name_cn: '葬送的芙莉蓮' }]);
    expect(spy.mock.calls[0]?.[0]).toContain('name_cn');
    expect(captured[0]).toContain('葬送的芙莉蓮');
    spy.mockRestore();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/id-mapping-service.test.ts`
Expected: IDM-011…014 FAIL (`getChineseTitleSource is not a function`), IDM-015 FAIL (SQL lacks `name_cn`)

- [ ] **Step 3: Implement.**

`AnimeMapping` gains:

```ts
  /** Official Chinese title joined from the Bangumi Archive dump (B1). */
  name_cn?: string;
```

`bulkInsert` statement and params:

```ts
      const statement = await tx.prepareAsync(
        `INSERT INTO id_mappings (
          mal_id, anilist_id, kitsu_id, bangumi_id, shikimori_id, simkl_id, annict_id,
          thetvdb_id, themoviedb_id, livechart_id, anime_planet_id, anisearch_id, notify_moe_id,
          name_cn
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
```

…and in the per-row `executeAsync` array, append after the `notify_moe_id` entry:

```ts
              m.name_cn ?? null,
```

New method after `mapAllPlatforms`:

```ts
  /**
   * One-SELECT source bundle for Chinese title resolution: the locally-shipped
   * `name_cn` (preferred, offline) plus the `bangumi_id` fallback for a
   * network fetch when the dump predates this anime. `null` = row absent.
   */
  async getChineseTitleSource(
    platform: PlatformType | string,
    id: number | string
  ): Promise<{ nameCn: string | null; bangumiId: string | null } | null> {
    const col = this.getColumnName(platform);
    if (!col) return null;

    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{
      name_cn: string | null;
      bangumi_id: number | string | null;
    }>(`SELECT name_cn, bangumi_id FROM id_mappings WHERE ${col} = ? LIMIT 1`, id);

    const manual = this.getManualMapping(platform, id, 'bangumi');
    const selfId = platform === 'bangumi' ? String(id) : null;
    if (!row) {
      return manual !== null || selfId !== null
        ? { nameCn: null, bangumiId: manual ?? selfId }
        : null;
    }

    const trimmed = typeof row.name_cn === 'string' ? row.name_cn.trim() : '';
    const rowBangumi =
      row.bangumi_id != null && row.bangumi_id !== '' ? String(row.bangumi_id) : null;
    return {
      nameCn: trimmed.length > 0 ? trimmed : null,
      bangumiId: manual ?? rowBangumi ?? selfId,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --preload ./test-setup.ts __tests__/unit/id-mapping-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/services/sync/id-mapping-service.ts __tests__/unit/id-mapping-service.test.ts
git commit -m "feat(sync): ingest name_cn and expose getChineseTitleSource"
```

---

### Task 4: `LocalDB` — `name_cn` column + one-time meta reset

**Files:**
- Modify: `libs/db.ts` (DDL `CREATE TABLE id_mappings` ~line 272; `runColumnMigrations` ~line 97)

No unit test: FakeDatabase's `execAsync` is a no-op so migrations aren't observable in tests; correctness is covered by `tsc` + the simulator verification step in Task 7.

- [ ] **Step 1: DDL.** In the `CREATE TABLE IF NOT EXISTS id_mappings` block, after `notify_moe_id TEXT`:

```sql
        notify_moe_id TEXT,
        name_cn TEXT
```

- [ ] **Step 2: Migration with one-time side effect.** Replace `runColumnMigrations`:

```ts
// SQLite has no `ADD COLUMN IF NOT EXISTS`, so we catch the duplicate-column
// error and move on. Each entry is safe to attempt every boot. `onApplied`
// runs only when the ALTER actually executed (i.e. the column was just added
// on an upgraded install) — never on fresh installs (DDL already has the
// column → duplicate-column skip) and never on later boots.
async function runColumnMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const migrations: { sql: string; onApplied?: (db: SQLite.SQLiteDatabase) => Promise<void> }[] = [
    { sql: 'ALTER TABLE user_anime ADD COLUMN notes TEXT' },
    { sql: 'ALTER TABLE user_anime ADD COLUMN rewatch_count INTEGER DEFAULT 0' },
    {
      sql: 'ALTER TABLE id_mappings ADD COLUMN name_cn TEXT',
      // The freshly-added column is empty until the next mapping download;
      // resetting the freshness marker forces one refetch of the enriched
      // dataset instead of waiting out the 14-day window.
      onApplied: async (d) => {
        await d.runAsync(`DELETE FROM id_mappings_meta WHERE key = 'lastUpdatedAt'`);
      },
    },
  ];
  for (const m of migrations) {
    try {
      await db.execAsync(m.sql);
      await m.onApplied?.(db);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate column/i.test(msg)) continue;
      if (isStaleHandleError(err)) throw err;
      console.warn('[LocalDB] migration failed:', m.sql, err);
    }
  }
}
```

- [ ] **Step 3: Type check + full unit suite (regression guard)**

Run: `bunx tsc --noEmit && bun run test:unit`
Expected: clean / all PASS

- [ ] **Step 4: Commit**

```bash
git add libs/db.ts
git commit -m "feat(db): id_mappings.name_cn column with one-time freshness reset"
```

---

### Task 5: `TitleLocalizationService` — v2 keys, readiness guard, local-first chinese, flush-on-import

**Files:**
- Modify: `libs/services/title-localization-service.ts`
- Test: `__tests__/unit/title-localization-service.test.ts` (rewrite — the chinese path no longer goes through `mapID`)

- [ ] **Step 1: Rewrite the test file.** Replace its contents:

```ts
import { describe, expect, it } from 'bun:test';
import { TitleLocalizationService } from '../../libs/services/title-localization-service';

function makeFakeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    getSync: <T,>(key: string): T | null => (store.has(key) ? (store.get(key) as T) : null),
    get: async <T,>(key: string): Promise<T | null> =>
      store.has(key) ? (store.get(key) as T) : null,
    set: async (key: string, value: unknown, _ttlMs?: number) => {
      store.set(key, value);
    },
    clearByPrefixWhereValue: async (prefix: string, valueJson: string) => {
      let removed = 0;
      for (const [k, v] of Array.from(store.entries())) {
        if (k.startsWith(prefix) && JSON.stringify(v) === valueJson) {
          store.delete(k);
          removed++;
        }
      }
      return removed;
    },
  };
}

type FakeIdMapping = {
  mapID: (
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string
  ) => Promise<string | number | null>;
  getChineseTitleSource: (
    platform: string,
    id: number | string
  ) => Promise<{ nameCn: string | null; bangumiId: string | null } | null>;
  getLastUpdateTime: () => Promise<number | null>;
};

/** Mapping deps where the dataset has been imported (ready) by default. */
function makeIdMapping(overrides: Partial<FakeIdMapping> = {}): FakeIdMapping {
  return {
    mapID: async () => null,
    getChineseTitleSource: async () => null,
    getLastUpdateTime: async () => 1_700_000_000_000,
    ...overrides,
  };
}

/** ensure() is fire-and-forget; drain its queue before asserting. */
async function settle(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('TitleLocalizationService', () => {
  it('TLS-001 chinese resolves from local name_cn without any fetch', async () => {
    const cache = makeFakeCache();
    let fetchCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => ({ nameCn: '進擊的巨人', bangumiId: '23686' }),
      }),
      fetchers: {
        chinese: async () => {
          fetchCalls += 1;
          return 'should not be called';
        },
      },
    });

    let notified = 0;
    service.subscribe(() => {
      notified += 1;
    });

    expect(service.getSync('chinese', 'anilist', '16498')).toBeUndefined();
    service.ensure('chinese', 'anilist', '16498');
    await settle();

    expect(service.getSync('chinese', 'anilist', '16498')).toBe('進擊的巨人');
    expect(fetchCalls).toBe(0);
    expect(notified).toBe(1);
  });

  it('TLS-002 chinese falls back to the Bangumi fetcher via bangumi_id', async () => {
    const cache = makeFakeCache();
    let fetchedWith: string | null = null;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => ({ nameCn: null, bangumiId: '23686' }),
      }),
      fetchers: {
        chinese: async (id) => {
          fetchedWith = id;
          return '进击的巨人';
        },
      },
    });

    service.ensure('chinese', 'anilist', '16498');
    await settle();

    expect(fetchedWith).toBe('23686');
    expect(service.getSync('chinese', 'anilist', '16498')).toBe('进击的巨人');
  });

  it('TLS-003 caches a negative result only when mapping data is ready', async () => {
    const cache = makeFakeCache();
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping(), // source null + ready
      fetchers: { chinese: async () => 'unused' },
    });

    service.ensure('chinese', 'anilist', '999999');
    await settle();

    expect(service.getSync('chinese', 'anilist', '999999')).toBeNull();
  });

  it('TLS-004 no negative cache before the first successful mapping import', async () => {
    const cache = makeFakeCache();
    let sourceCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => {
          sourceCalls += 1;
          return null;
        },
        getLastUpdateTime: async () => null, // never imported
      }),
      fetchers: { chinese: async () => 'unused' },
    });

    service.ensure('chinese', 'anilist', '16498');
    await settle();

    // unknown (undefined), NOT known-absent (null) — and nothing persisted.
    expect(service.getSync('chinese', 'anilist', '16498')).toBeUndefined();
    expect(cache.store.size).toBe(0);

    // Within the backoff window the retry is suppressed.
    service.ensure('chinese', 'anilist', '16498');
    await settle();
    expect(sourceCalls).toBe(1);
  });

  it('TLS-005 russian resolves through mapID (shikimori alias) and caches negatives', async () => {
    const cache = makeFakeCache();
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        mapID: async (_from, _fromId, to) => (to === 'shikimori' ? '5114' : null),
      }),
      fetchers: { russian: async (id) => (id === '5114' ? 'Стальной алхимик' : null) },
    });

    service.ensure('russian', 'anilist', '5114');
    await settle();
    expect(service.getSync('russian', 'anilist', '5114')).toBe('Стальной алхимик');
  });

  it('TLS-006 cache keys use the v2 prefix (poisoned v1 entries orphaned)', async () => {
    const cache = makeFakeCache();
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => ({ nameCn: '冰菓', bangumiId: null }),
      }),
    });

    service.ensure('chinese', 'anilist', '12189');
    await settle();

    const keys = Array.from(cache.store.keys());
    expect(keys).toHaveLength(1);
    expect(keys[0]).toStartWith('title_loc_v2_');
  });

  it('TLS-007 dedupes concurrent ensure calls for the same key', async () => {
    const cache = makeFakeCache();
    let sourceCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => {
          sourceCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { nameCn: '冰菓', bangumiId: null };
        },
      }),
    });

    service.ensure('chinese', 'anilist', '12189');
    service.ensure('chinese', 'anilist', '12189');
    service.ensure('chinese', 'anilist', '12189');
    await settle(20);

    expect(sourceCalls).toBe(1);
    expect(service.getSync('chinese', 'anilist', '12189')).toBe('冰菓');
  });

  it('TLS-008 a failed fetch is not cached and backs off instead of hammering', async () => {
    const cache = makeFakeCache();
    let fetchCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => ({ nameCn: null, bangumiId: '23686' }),
      }),
      fetchers: {
        chinese: async () => {
          fetchCalls += 1;
          throw new Error('network down');
        },
      },
    });

    service.ensure('chinese', 'anilist', '16498');
    await settle();
    expect(service.getSync('chinese', 'anilist', '16498')).toBeUndefined();
    expect(fetchCalls).toBe(1);

    service.ensure('chinese', 'anilist', '16498');
    await settle();
    expect(fetchCalls).toBe(1);
  });

  it('TLS-009 onMappingDataRefreshed flushes negatives, keeps hits, clears backoff, notifies', async () => {
    const cache = makeFakeCache();
    let ensureRound = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => {
          ensureRound += 1;
          // Round 1: dataset miss → negative. Round 2 (post-refresh): hit.
          return ensureRound === 1 ? null : { nameCn: '葬送的芙莉蓮', bangumiId: null };
        },
      }),
    });

    service.ensure('chinese', 'anilist', '154587');
    await settle();
    expect(service.getSync('chinese', 'anilist', '154587')).toBeNull();

    // Seed an unrelated positive hit that must survive the flush.
    await cache.set('title_loc_v2_chinese_anilist_1', { v: '保留我' });

    let notified = 0;
    service.subscribe(() => {
      notified += 1;
    });

    await service.onMappingDataRefreshed();
    expect(notified).toBe(1);
    expect(cache.store.has('title_loc_v2_chinese_anilist_1')).toBe(true);
    expect(service.getSync('chinese', 'anilist', '154587')).toBeUndefined();

    // Re-ensure now succeeds immediately (backoff was cleared too).
    service.ensure('chinese', 'anilist', '154587');
    await settle();
    expect(service.getSync('chinese', 'anilist', '154587')).toBe('葬送的芙莉蓮');
  });
});
```

(If `toStartWith` is unavailable in this bun version, use `expect(keys[0]?.startsWith('title_loc_v2_')).toBe(true)`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/title-localization-service.test.ts`
Expected: FAIL — type errors on deps (`getChineseTitleSource`/`getLastUpdateTime` missing from Pick) and behavioral failures.

- [ ] **Step 3: Implement.** In `title-localization-service.ts`:

Cache key (replaces the old `cacheKey`; v1 entries are orphaned deliberately and age out via TTL/prune):

```ts
/**
 * v2: v1 keys were poisoned by negative results written while the dataset
 * had no bangumi_id at all (see 2026-06-12 spec). Bumping the prefix orphans
 * them; CacheManager prune removes them after TTL.
 */
const CACHE_PREFIX = 'title_loc_v2_';

function cacheKey(lang: LocalizedTitleLanguage, platform: PlatformType, id: string): string {
  return `${CACHE_PREFIX}${lang}_${platform}_${id}`;
}
```

Deps:

```ts
export interface TitleLocalizationDeps {
  cache?: Pick<typeof CacheService, 'getSync' | 'get' | 'set' | 'clearByPrefixWhereValue'>;
  idMapping?: Pick<
    typeof idMappingService,
    'mapID' | 'getChineseTitleSource' | 'getLastUpdateTime'
  >;
  fetchers?: Partial<Record<LocalizedTitleLanguage, (mappedId: string) => Promise<string | null>>>;
}
```

Class additions/changes (constructor stays, field types follow the deps):

```ts
  /** Once true, stays true — an import is never undone. */
  private mappingReadyMemo = false;

  private async isMappingReady(): Promise<boolean> {
    if (this.mappingReadyMemo) return true;
    const t = await this.idMapping.getLastUpdateTime();
    if (t !== null) this.mappingReadyMemo = true;
    return this.mappingReadyMemo;
  }

  /**
   * Resolution outcome: 'done' carries the title (or a confirmed absence);
   * 'transient' means we couldn't tell ("dataset not imported yet") and must
   * NOT write a negative cache — backoff and retry later instead.
   */
  private async resolve(
    lang: LocalizedTitleLanguage,
    platform: PlatformType,
    id: string
  ): Promise<{ kind: 'done'; title: string | null } | { kind: 'transient' }> {
    if (lang === 'chinese') {
      // Single SELECT: locally-shipped name_cn (offline, preferred) plus the
      // bangumi_id needed for the network fallback.
      const src = await this.idMapping.getChineseTitleSource(platform, id);
      if (src?.nameCn) return { kind: 'done', title: src.nameCn };
      if (src?.bangumiId) return { kind: 'done', title: await this.fetchers.chinese(src.bangumiId) };
      if (!(await this.isMappingReady())) return { kind: 'transient' };
      return { kind: 'done', title: null };
    }

    const mappedId = await this.idMapping.mapID(platform, id, SOURCE_PLATFORM[lang]);
    if (mappedId == null) {
      if (!(await this.isMappingReady())) return { kind: 'transient' };
      return { kind: 'done', title: null };
    }
    return { kind: 'done', title: await this.fetchers[lang](String(mappedId)) };
  }
```

`ensure()`'s queued task body becomes:

```ts
    this.inflight.add(key);
    this.enqueue(async () => {
      try {
        // The persistent layer may have it even when the memory mirror is
        // cold (fresh launch) — `get` pulls it into the mirror for getSync.
        const persisted = await this.cache.get<CachedTitle>(key);
        if (persisted) {
          this.emit();
          return;
        }

        const resolved = await this.resolve(lang, platform, id);
        if (resolved.kind === 'transient') {
          // Mapping dataset not imported yet — this is "we can't know",
          // never "known absent". Backoff, don't poison the cache.
          this.failedAt.set(key, Date.now());
          return;
        }

        await this.cache.set(
          key,
          { v: resolved.title } satisfies CachedTitle,
          resolved.title ? HIT_TTL_MS : MISS_TTL_MS
        );
        this.emit();
      } catch (err) {
        this.failedAt.set(key, Date.now());
        Logger.warn(`[TitleLocalization] ${lang} title fetch failed for ${platform}:${id}`, err);
      } finally {
        this.inflight.delete(key);
      }
    });
```

New public method (after `subscribe`):

```ts
  /**
   * Called after a successful mapping-data import (app/_layout.tsx). Negative
   * entries were judged against the OLD dataset — drop them so the new data
   * gets a chance; positive hits stay. Clears fetch backoffs and notifies
   * subscribers so visible screens re-kick enrichment immediately.
   */
  async onMappingDataRefreshed(): Promise<void> {
    this.mappingReadyMemo = true;
    this.failedAt.clear();
    await this.cache.clearByPrefixWhereValue(
      CACHE_PREFIX,
      JSON.stringify({ v: null } satisfies CachedTitle)
    );
    this.emit();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --preload ./test-setup.ts __tests__/unit/title-localization-service.test.ts`
Expected: PASS (TLS-001…009)

- [ ] **Step 5: Commit**

```bash
git add libs/services/title-localization-service.ts __tests__/unit/title-localization-service.test.ts
git commit -m "feat(i18n): local-first chinese titles, readiness guard, v2 cache keys"
```

---

### Task 6: `updateMappings` → `Promise<boolean>` + launch wiring

**Files:**
- Modify: `libs/services/sync/id-mapping-service.ts` (`updateMappings` ~line 91)
- Modify: `app/_layout.tsx:95`
- Test: `__tests__/unit/id-mapping-service.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
  it('IDM-016 updateMappings reports whether an import actually ran', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    // Fresh meta → not fresh → would download; make the freshness row exist instead.
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      value: String(Date.now()),
    } as never);
    await expect(svc.updateMappings()).resolves.toBe(false);
    spy.mockRestore();
  });
```

(The `true` branch requires the FileSystem download — covered indirectly: the method's last line returns `true`, type-checked by the signature.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --preload ./test-setup.ts __tests__/unit/id-mapping-service.test.ts`
Expected: FAIL — `resolves.toBe(false)` gets `undefined`

- [ ] **Step 3: Implement.** Signature and returns:

```ts
  /**
   * Download the upstream merged mapping list and replace the SQLite table
   * contents inside a single transaction. Short-circuits when the local copy
   * is younger than `FRESHNESS_WINDOW_MS`. Returns true when an import
   * actually ran (callers use this to flush stale title caches).
   */
  async updateMappings(): Promise<boolean> {
    const lastUpdate = await this.getLastUpdateTime();
    if (lastUpdate !== null && Date.now() - lastUpdate < FRESHNESS_WINDOW_MS) {
      return false;
    }
    // … existing body unchanged …
    await this.bulkInsert(mappings);
    await this.setLastUpdateTime(Date.now());
    return true;
  }
```

In `app/_layout.tsx`, add the import alongside the existing service imports:

```ts
import { titleLocalizationService } from '../libs/services/title-localization-service';
```

and replace line 95:

```ts
      void idMappingService
        .updateMappings()
        .then((imported) => {
          if (imported) void titleLocalizationService.onMappingDataRefreshed();
        })
        .catch((e) => console.warn('[updateMappings]', e));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --preload ./test-setup.ts __tests__/unit/id-mapping-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/services/sync/id-mapping-service.ts app/_layout.tsx __tests__/unit/id-mapping-service.test.ts
git commit -m "feat(sync): flush stale title caches after a real mapping import"
```

---

### Task 7: Full verification

- [ ] **Step 1: Full unit suite**

Run: `bun run test:unit`
Expected: all PASS (i18n parity test included)

- [ ] **Step 2: Type check**

Run: `bunx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Simulator sanity check (manual).** Launch the app on the dev simulator with App language = 中文. Expected: previously-poisoned titles (e.g. AniList 5114 鋼之鍊金術師) recover — v1 poison keys are orphaned, russian resolves via the alias. Chinese stays original-language for most items **until B1 data ships** (`name_cn`/`bangumi_id` still absent from the dataset); readiness guard + flush-on-import make them appear automatically after the next import once B1 publishes.

- [ ] **Step 4: Commit any stragglers; do NOT push** (per repo workflow, user pushes).

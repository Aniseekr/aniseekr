# Pilgrimage Phase 5（Collection tab 修理）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** collection 主 tab 只留單一分類體系（資料夾是唯一入口，砍掉重複的狀態 tabs）、資料夾內有真的排序＋搜尋、主頁排序只留可用模式、分享鷹架的 UI 痕跡移除但 schema 保留。

**Architecture:** 全部是既有 seam 的最小修改。排序邏輯抽成純函式 `folder-sort.ts`（可離線單測）；資料夾預設順序治在 `collection-service.getFolderItems` 這個唯一 choke point（只有 `[id].tsx` 呼叫它）；狀態 tabs 的移除是把 `selectedCategory` 這條 render 狀態整條抽掉（Rule 9：少一條無謂 render 狀態），主頁固定顯示全部資料夾格子；分享是純 JSX/schema 註解的刪除。

**Tech Stack:** Bun test（`--preload ./test-setup.ts`）、Expo Router、SQLite（`LocalDB`）、MMKV（`kvGet/kvSet`、`app-storage` mock seam）、themed primitives、`useT()` i18n。

**Spec:** `docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md`（Phase 5 = 5.1–5.5）。

---

## 現況核實後與 outline 的差異（binding，實作以此為準）

Reading 過 `index.tsx`／`[id].tsx`／`collection-service.ts`／`collection-prefs.ts` 全檔，以下與 outline 有出入或需補充：

1. **outline 只列 `CATEGORIES`/`CATEGORY_TO_STATUS`，漏了第三張 map。** 實際上 `index.tsx:65-70` 還有 `CATEGORY_TO_SYSTEM_FOLDER`（`All→system_all` 等），供「查看全部」deep-link（`index.tsx:732`）。移除狀態 tabs 時三張 map 都要砍，「查看全部」改恆指 `system_all`（= 5.4）。
2. **壞排序模式從 UI 實際可達的只有 `rarity`。** `sortOptions`（`index.tsx:529-537`）只曝露 `newest/oldest/count/rarity`；`popularity`／`id` 只存在於 `CollectionSortMode` type 與 `visibleFolders` 的 switch 分支（`index.tsx:497-500`），UI 從來點不到 → 是死型別成員＋死分支。三個都要從 type 刪掉。
3. **`sharedBy` 的 UI 引用只有兩處**：`visibleFolders` 的 `popularity` 排序分支（`index.tsx:498`，5.3 一併刪）與 `sameCollections` 等值比較器（`index.tsx:139-140`，非顯示、非排序 → 保留不動）。`isShared` 的顯示痕跡是 `FolderGrid.tsx:103`（people icon badge）與 `CreateFolderModal.tsx:165-173`（"Share with friends" Switch）。
4. **沒有現成可複用的 inline SearchBar 元件。** `CollectionSearchModal` 是整頁 Modal（主頁全域搜尋），不是可嵌入資料夾頁的輸入列。故 5.2 的資料夾內搜尋走 outline 的 fallback：`ThemedSurface` 風格的最小 inline `TextInput`（沿用 `CollectionSearchModal` 的 searchBar 樣式風格）。
5. **`FolderItem`（`[id].tsx:28-38`）沒有 `updated_at` 欄位**，且主查詢（`[id].tsx:196-201`）與 favorites 查詢（`[id].tsx:150`）都沒 SELECT `updated_at`。要排「更新時間」必須把 `updated_at` 加進兩條 SELECT 與 mapping。`user_anime` 表確有 `updated_at INTEGER`（`libs/db.ts:329`）。
6. **`getFolderItems` 的 `system_all` 分支（`collection-service.ts:275`）也沒有 ORDER BY**，不只 outline 提到的 status 分支（`:289-292`）。兩處都要加 `ORDER BY COALESCE(updated_at, 0) DESC`。custom 分支（`:296-299`）已是 `ORDER BY added_at DESC`，保留。
7. **`folderType` union（`types/index.ts:8`）沒有 `'all'` 成員**，故 `system_all` 只能誤標成別的值（現為 `'watching'`，`collection-service.ts:13`）。死碼 `FolderList.tsx:112` 早已假設 `folderType === 'all'`。修法：union 補 `'all'`（additive，`cloudkit-converter`/`legacy-aniseeker` 都用 loose `string`，不會炸），`system_all.folderType` 改 `'all'`，`index.tsx:425` 的 `&& folder.id === 'system_watching'` id-guard 可一併拆掉。
8. **目前沒有任何 collection 單元測試**（`__tests__/unit/` 下無 `collection*`）。本 plan 新增三個測試檔。
9. `NearbyPilgrimageBadge`（`[id].tsx:444`）保留不動（Phase 6 才碰）。
10. MMKV 測試 seam 已驗證：`appStorage.clearAll()` + `__resetAppStorageForTests()` + `kvGet/kvSet`（見 `__tests__/unit/bangumi-prefs.test.ts`）。service 測試用 `spyOn(LocalDB, 'getDatabase')`（見 `__tests__/unit/pilgrimage/collection-pilgrimage-service.test.ts` 的 fakeDb 模式）。

**任務順序（每個 commit 都讓 tab 保持可用）：**
Task 1（5.3，純刪型別／死分支，不動導覽）→ Task 2（5.2，資料夾頁排序＋搜尋，獨立）→ Task 3（5.1＋5.4，**唯一**同時砍狀態 tabs 並讓資料夾成主導覽的 task）→ Task 4（5.5，刪分享 UI）。狀態 tabs 只在 Task 3 被刪。

## Global Constraints

- 測試一律 `bun run test:unit` 或 `bun test --preload ./test-setup.ts <file>` — 裸 `bun test` 會炸（CLAUDE.md Workflow，會跳過 native mock）。
- 型別檢查：`bunx tsc --noEmit`。baseline 有兩個既存 TS2882（`global.css`）雜訊 — 不得**新增**任何 error。
- UI 字串一律 `useT()`；新 key **先加 `libs/i18n/locales/en.json`，再補同形 `zh-Hant.json`**（Rule 11）。不要動 `ja/ko/zh-Hans`（缺 key 會 fallback；多 key 會被 parity 測試擋）。i18n parity 測試（`__tests__/unit/i18n.test.ts`）：非英文 locale 只准鏡像已存在的 key，**不准有 en 沒有的 key**。
- 顏色一律 `useTheme()` token（Rule 4）；錯誤／空狀態要誠實（Rule 8）；高頻／可推導的值不進 React state（Rule 9 — 本 plan 反而是**拆掉** `selectedCategory` 這條多餘 render 狀態）。
- 每個 task 結尾 commit（訊息已給）。不要 push。全程只有一顆 branch，禁跑任何 git 以外的破壞性指令。

---

### Task 1: 刪壞排序模式（5.3）— `CollectionSortMode` 只留 `newest`/`oldest`/`count`

移除 `popularity`（恆 0 的 `sharedBy` no-op）、`rarity`（R18 proxy）、`id`（UUID）三個壞模式；`sortOptions` 與 type 對齊；MMKV 讀到殘值 fallback 預設。此 task 不動導覽 — 狀態 tabs 仍在、sort chips 仍只在非 All 顯示，tab 照常運作。

**Files:**
- Modify: `libs/services/collection-prefs.ts`（type + `VALID_SORT_MODES`，`:5-14`）
- Modify: `app/(tabs)/collection/index.tsx`（`visibleFolders` sort switch `:494-502`；`sortOptions` `:529-537`）
- Test（Create）: `__tests__/unit/collection-prefs.test.ts`

**Interfaces:**
- Produces: `type CollectionSortMode = 'newest' | 'oldest' | 'count'`；`loadCollectionSortModeSync(): CollectionSortMode`（殘值 → `'newest'`）；`saveCollectionSortMode(mode: CollectionSortMode): Promise<void>`。Task 3 的主頁 sort chips 依賴此縮減後的集合。

- [ ] **Step 1: 寫 failing test** — 新檔 `__tests__/unit/collection-prefs.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  loadCollectionSortModeSync,
  saveCollectionSortMode,
} from '../../libs/services/collection-prefs';
import {
  appStorage,
  __resetAppStorageForTests,
  kvSet,
} from '../../libs/services/storage/app-storage';
import { COLLECTION_SORT_MODE_STORAGE_KEY } from '../../libs/services/storage/keys';

describe('collection sort-mode prefs', () => {
  beforeEach(() => {
    appStorage.clearAll();
    __resetAppStorageForTests();
  });

  it('defaults to newest when unset', () => {
    expect(loadCollectionSortModeSync()).toBe('newest');
  });

  it('round-trips a still-valid mode', async () => {
    await saveCollectionSortMode('count');
    expect(loadCollectionSortModeSync()).toBe('count');
  });

  it('falls back to newest for retired mode "rarity"', () => {
    kvSet(COLLECTION_SORT_MODE_STORAGE_KEY, 'rarity');
    expect(loadCollectionSortModeSync()).toBe('newest');
  });

  it('falls back to newest for retired mode "popularity"', () => {
    kvSet(COLLECTION_SORT_MODE_STORAGE_KEY, 'popularity');
    expect(loadCollectionSortModeSync()).toBe('newest');
  });

  it('falls back to newest for retired mode "id"', () => {
    kvSet(COLLECTION_SORT_MODE_STORAGE_KEY, 'id');
    expect(loadCollectionSortModeSync()).toBe('newest');
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/collection-prefs.test.ts`
Expected: 三個 retired-mode 測試 FAIL（現在 `rarity/popularity/id` 仍在 `VALID_SORT_MODES`，`loadCollectionSortModeSync` 原樣回傳 `'rarity'` 等，不是 `'newest'`）。`defaults`／`round-trips` 兩個 PASS。

- [ ] **Step 3: 縮減 `collection-prefs.ts`**（`:5-14`）

```ts
export type CollectionSortMode = 'newest' | 'oldest' | 'count';

const VALID_SORT_MODES: CollectionSortMode[] = ['newest', 'oldest', 'count'];
```

（`loadCollectionSortModeSync`／`saveCollectionSortMode` 主體不動 — 殘值不在 `VALID_SORT_MODES` 即 fallback `'newest'`，正好治好舊 MMKV 存的 `rarity/popularity/id`。）

- [ ] **Step 4: 刪 `index.tsx` 死排序分支**

`visibleFolders` 的 sort（`index.tsx:494-502`）改成：

```ts
    return [...filtered].sort((a, b) => {
      if (sortMode === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
      if (sortMode === 'oldest') return a.createdAt.getTime() - b.createdAt.getTime();
      if (sortMode === 'count') return b.animeCount - a.animeCount;
      return 0;
    });
```

`sortOptions`（`index.tsx:529-537`）刪掉 `rarity` 那筆：

```ts
  const sortOptions: { label: string; value: SortMode }[] = useMemo(
    () => [
      { label: t('tabs.collectionScreen.sort.newest'), value: 'newest' },
      { label: t('tabs.collectionScreen.sort.oldest'), value: 'oldest' },
      { label: t('tabs.collectionScreen.sort.count'), value: 'count' },
    ],
    [t]
  );
```

（`tabs.collectionScreen.sort.rarity` i18n key 留在 catalog 不刪 — parity 允許未用 key，刪反而要動兩個 locale。）

- [ ] **Step 5: 跑測試確認 pass + 型別**

Run: `bun test --preload ./test-setup.ts __tests__/unit/collection-prefs.test.ts`
Expected: 5 綠。
Run: `bunx tsc --noEmit`
Expected: 只剩 baseline 兩個 `global.css` TS2882，無新 error（`b.sharedBy`／`isR18` 分支已刪，`SortMode` 縮減後 `sortMode === 'rarity'` 這類比較若殘留會是 TS error → 確認全清）。

- [ ] **Step 6: commit**

```
git add libs/services/collection-prefs.ts "app/(tabs)/collection/index.tsx" __tests__/unit/collection-prefs.test.ts
git commit -m "fix(collection): drop broken sort modes (popularity/rarity/id), align sortOptions"
```

---

### Task 2: 資料夾內排序＋搜尋（5.2）

`getFolderItems` 系統資料夾 SQL 補預設 `ORDER BY`；抽出純函式 `folder-sort.ts`（排序／過濾／持久化）；`[id].tsx` 加排序控制（加入順序／更新／標題／評分）＋ 最小 inline 搜尋框；偏好用新 MMKV key 持久化（別跟主頁資料夾格子的排序混用）。此 task 完全獨立於狀態 tabs，tab 照常運作。

**Files:**
- Modify: `libs/services/storage/keys.ts`（新增 key，Tier 2 區塊）
- Create: `libs/services/collection/folder-sort.ts`
- Modify: `libs/services/collection/collection-service.ts`（`getFolderItems` `:275`、`:289-292`）
- Modify: `app/(tabs)/collection/[id].tsx`（`FolderItem`、兩條 SELECT、mapping、排序／搜尋 UI 與 state）
- Modify: `libs/i18n/locales/en.json`、`libs/i18n/locales/zh-Hant.json`
- Test（Create）: `__tests__/unit/collection-folder-sort.test.ts`、`__tests__/unit/collection-service.test.ts`

**Interfaces:**
- Produces（`folder-sort.ts`）:
  - `type FolderSortMode = 'added' | 'updated' | 'title' | 'rating'`
  - `const FOLDER_SORT_MODES: FolderSortMode[]`（順序即 UI chip 順序）
  - `interface SortableFolderItem { title: string; score: number; updated_at: number | null }`
  - `sortFolderItems<T extends SortableFolderItem>(items: readonly T[], mode: FolderSortMode): T[]`（回新陣列，`'added'` 保留輸入順序，不 mutate 輸入）
  - `filterFolderItems<T extends { title: string }>(items: readonly T[], query: string): T[]`
  - `loadFolderSortModeSync(): FolderSortMode`（殘值 → `'added'`）
  - `saveFolderSortMode(mode: FolderSortMode): void`
- Consumes（既有）:
  - `collectionService.getFolderItems(folderId: string): Promise<string[]>`（`[id].tsx:177` 唯一 caller）
  - `kvGet(key: string): string | null` / `kvSet(key: string, value: string): void`（`libs/services/storage/app-storage`）
  - `Logger.warn`（`libs/utils/logger`）

- [ ] **Step 1: 加 MMKV key** — `libs/services/storage/keys.ts`，緊接 `COLLECTION_SORT_MODE_STORAGE_KEY`（`:24`）之後：

```ts
export const COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY = 'aniseekr.collection.folderSortMode.v1';
```

- [ ] **Step 2: 寫 failing tests**

新檔 `__tests__/unit/collection-folder-sort.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  sortFolderItems,
  filterFolderItems,
  loadFolderSortModeSync,
  saveFolderSortMode,
  type SortableFolderItem,
} from '../../libs/services/collection/folder-sort';
import {
  appStorage,
  __resetAppStorageForTests,
  kvSet,
} from '../../libs/services/storage/app-storage';
import { COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY } from '../../libs/services/storage/keys';

type Row = SortableFolderItem & { id: string };
const rows: Row[] = [
  { id: 'a', title: 'Bocchi the Rock!', score: 90, updated_at: null }, // updated_at missing → sorts last
  { id: 'b', title: 'Aria', score: 70, updated_at: 300 },
  { id: 'c', title: 'Cowboy Bebop', score: 100, updated_at: 200 },
];

describe('sortFolderItems', () => {
  it('added keeps input order', () => {
    expect(sortFolderItems(rows, 'added').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('updated sorts by updated_at desc, nulls last', () => {
    expect(sortFolderItems(rows, 'updated').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
  it('title sorts alphabetically', () => {
    expect(sortFolderItems(rows, 'title').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('rating sorts by score desc', () => {
    expect(sortFolderItems(rows, 'rating').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
  it('does not mutate the input array', () => {
    const input: Row[] = [...rows];
    sortFolderItems(input, 'title');
    expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('filterFolderItems', () => {
  it('matches title case-insensitively', () => {
    expect(filterFolderItems(rows, 'bOcChI').map((r) => r.id)).toEqual(['a']);
  });
  it('blank query returns all', () => {
    expect(filterFolderItems(rows, '   ').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('folder sort persistence', () => {
  beforeEach(() => {
    appStorage.clearAll();
    __resetAppStorageForTests();
  });
  it('defaults to added when unset', () => {
    expect(loadFolderSortModeSync()).toBe('added');
  });
  it('round-trips a saved mode', () => {
    saveFolderSortMode('rating');
    expect(loadFolderSortModeSync()).toBe('rating');
  });
  it('falls back to added for a stale/invalid value', () => {
    kvSet(COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY, 'popularity');
    expect(loadFolderSortModeSync()).toBe('added');
  });
});
```

新檔 `__tests__/unit/collection-service.test.ts`（`getFolderItems` 的 ORDER BY seam — fakeDb 捕捉 SQL 字串）：

```ts
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { LocalDB } from '../../libs/db';
import { collectionService } from '../../libs/services/collection/collection-service';

afterEach(() => {
  mock.restore();
});

/** Stub LocalDB.getDatabase; capture every SQL passed to getAllAsync. */
function stubDb() {
  const sqls: string[] = [];
  const db = {
    getAllAsync: async (sql: string) => {
      sqls.push(sql);
      return [{ anime_id: '1' }, { anime_id: '2' }];
    },
  };
  spyOn(LocalDB, 'getDatabase').mockResolvedValue(db as never);
  return { sqls };
}

describe('collectionService.getFolderItems ordering', () => {
  it('orders a system status folder by updated_at DESC', async () => {
    const { sqls } = stubDb();
    await collectionService.getFolderItems('system_watching');
    expect(sqls[0]).toContain('WHERE status = ?');
    expect(sqls[0]).toContain('ORDER BY COALESCE(updated_at, 0) DESC');
  });

  it('orders system_all by updated_at DESC', async () => {
    const { sqls } = stubDb();
    await collectionService.getFolderItems('system_all');
    expect(sqls[0]).toContain('FROM user_anime');
    expect(sqls[0]).toContain('ORDER BY COALESCE(updated_at, 0) DESC');
  });

  it('keeps custom folders ordered by added_at DESC', async () => {
    const { sqls } = stubDb();
    await collectionService.getFolderItems('some-custom-uuid');
    expect(sqls[0]).toContain('ORDER BY added_at DESC');
  });
});
```

- [ ] **Step 3: 跑測試確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/collection-folder-sort.test.ts`
Expected: 全 FAIL（`folder-sort.ts` 尚不存在 → import error）。
Run: `bun test --preload ./test-setup.ts __tests__/unit/collection-service.test.ts`
Expected: 前兩個（system_watching／system_all）FAIL（現在無 ORDER BY），custom 那個 PASS（既有 `ORDER BY added_at DESC`）。

- [ ] **Step 4: 建立 `libs/services/collection/folder-sort.ts`**

```ts
import { kvGet, kvSet } from '../storage/app-storage';
import { COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';

export type FolderSortMode = 'added' | 'updated' | 'title' | 'rating';

/** Order here drives the on-screen chip order. */
export const FOLDER_SORT_MODES: FolderSortMode[] = ['added', 'updated', 'title', 'rating'];

export interface SortableFolderItem {
  title: string;
  /** Stored score (0–100, i.e. display rating × 10). */
  score: number;
  updated_at: number | null;
}

/**
 * Sort a folder's items. `'added'` preserves the DB order that
 * `getFolderItems` already applied (added_at DESC for custom folders,
 * updated_at DESC for system folders) — so we return a shallow copy without
 * touching order. The other modes sort a copy (never the caller's array).
 * Array.prototype.sort is stable in Hermes/V8, so equal keys keep DB order.
 */
export function sortFolderItems<T extends SortableFolderItem>(
  items: readonly T[],
  mode: FolderSortMode
): T[] {
  const copy = [...items];
  if (mode === 'added') return copy;
  copy.sort((a, b) => {
    if (mode === 'title') return a.title.localeCompare(b.title);
    if (mode === 'rating') return b.score - a.score;
    // 'updated' — missing timestamps sort last.
    return (b.updated_at ?? 0) - (a.updated_at ?? 0);
  });
  return copy;
}

export function filterFolderItems<T extends { title: string }>(
  items: readonly T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((it) => it.title.toLowerCase().includes(q));
}

/** Synchronous MMKV read — safe for first-frame `useState` initialisers. */
export function loadFolderSortModeSync(): FolderSortMode {
  try {
    const raw = kvGet(COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY);
    if (raw && (FOLDER_SORT_MODES as string[]).includes(raw)) {
      return raw as FolderSortMode;
    }
    return 'added';
  } catch (err) {
    Logger.warn('[FolderSort] load failed, using default', err);
    return 'added';
  }
}

export function saveFolderSortMode(mode: FolderSortMode): void {
  try {
    kvSet(COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY, mode);
  } catch (err) {
    Logger.warn('[FolderSort] save failed', err);
  }
}
```

- [ ] **Step 5: 加 `getFolderItems` 的預設 ORDER BY** — `collection-service.ts`

`system_all` 分支（`:274-277`）：

```ts
      if (folderId === 'system_all') {
        const rows = await db.getAllAsync<{ anime_id: string }>(
          'SELECT anime_id FROM user_anime ORDER BY COALESCE(updated_at, 0) DESC'
        );
        return rows.map((r) => r.anime_id);
      }
```

system status 分支（`:289-292`）：

```ts
      const rows = await db.getAllAsync<{ anime_id: string }>(
        'SELECT anime_id FROM user_anime WHERE status = ? ORDER BY COALESCE(updated_at, 0) DESC',
        status
      );
      return rows.map((r) => r.anime_id);
```

（custom 分支 `:296-299` 已是 `ORDER BY added_at DESC`，不動。）

- [ ] **Step 6: `[id].tsx` — 補 `updated_at` 進 `FolderItem` 與兩條 SELECT／mapping**

`FolderItem` interface（`:28-38`）加一欄：

```ts
interface FolderItem {
  id: string;
  title: string;
  image_url: string;
  progress: number;
  total_episodes: number;
  status: string;
  score: number;
  notes: string;
  rewatch_count: number;
  updated_at: number | null;
}
```

favorites 路徑的 trackingRows（`:141-156`）SELECT 與 map 補 `updated_at`：

```ts
          const trackingRows = await db.getAllAsync<{
            anime_id: string;
            progress: number;
            total_episodes: number;
            status: string;
            score: number;
            notes: string | null;
            rewatch_count: number | null;
            updated_at: number | null;
          }>(
            `SELECT anime_id, progress, total_episodes, status, score, notes, rewatch_count,
                    updated_at
               FROM user_anime
              WHERE anime_id IN (${placeholders})`,
            ...favRows.map((r) => r.id)
          );
```

favorites mapping（`:158-171`）加 `updated_at: t?.updated_at ?? null`（其餘不動）。

主查詢（`:185-201`）補 `updated_at`：

```ts
      const rows = await db.getAllAsync<{
        anime_id: string;
        title: string;
        image_url: string;
        progress: number;
        total_episodes: number;
        status: string;
        score: number;
        notes: string | null;
        rewatch_count: number | null;
        updated_at: number | null;
      }>(
        `SELECT anime_id, title, image_url, progress, total_episodes, status, score,
                notes, rewatch_count, updated_at
           FROM user_anime
          WHERE anime_id IN (${placeholders})`,
        ...animeIds
      );
```

主 mapping（`:208-218`）的 `loadedItems.push({...})` 加 `updated_at: row.updated_at ?? null`。

- [ ] **Step 7: `[id].tsx` — imports、state、排序／搜尋控制**

imports（`:2` 與 `:9` 附近）：

```ts
import { View, FlatList, StyleSheet, Pressable, TextInput, ScrollView } from 'react-native';
```

新增（放在既有 collection-service import 附近）：

```ts
import {
  FOLDER_SORT_MODES,
  sortFolderItems,
  filterFolderItems,
  loadFolderSortModeSync,
  saveFolderSortMode,
  type FolderSortMode,
} from '../../../libs/services/collection/folder-sort';
```

component 內新增 state（緊接 `viewMode` state `:109` 之後）：

```ts
  const [sortMode, setSortMode] = useState<FolderSortMode>(loadFolderSortModeSync);
  const [search, setSearch] = useState('');
```

派生（放在 `renderItem` 之前）：

```ts
  const searching = search.trim().length > 0;
  const visibleItems = useMemo(
    () => filterFolderItems(sortFolderItems(items, sortMode), search),
    [items, sortMode, search]
  );

  const handleSort = useCallback((mode: FolderSortMode) => {
    hapticsBridge.selection();
    setSortMode(mode);
    saveFolderSortMode(mode); // Rule 9: persist inline, no reconciling effect.
  }, []);

  const sortLabel = useCallback(
    (mode: FolderSortMode) =>
      mode === 'added'
        ? t('tabs.collectionFolderScreen.sort.added')
        : mode === 'updated'
          ? t('tabs.collectionFolderScreen.sort.updated')
          : mode === 'title'
            ? t('tabs.collectionFolderScreen.sort.title')
            : t('tabs.collectionFolderScreen.sort.rating'),
    [t]
  );
```

（`useMemo`/`useCallback` 已在 `:1` import。）

- [ ] **Step 8: `[id].tsx` — 渲染控制列、接 `visibleItems`、搜尋空狀態**

在 header `</View>`（`:521`）之後、`{loading ? ... }` 區塊（`:523`）之前插入控制列（只在 list 模式且有資料時顯示）：

```tsx
      {!loading && viewMode === 'list' && items.length > 0 ? (
        <View style={styles.controls}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
            ]}>
            <MaterialIcons name="search" size={18} color={theme.text.secondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('tabs.collectionFolderScreen.searchPlaceholder')}
              placeholderTextColor={theme.text.tertiary}
              style={[styles.searchInput, { color: theme.text.primary }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.text.tertiary} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortRow}>
            {FOLDER_SORT_MODES.map((mode) => {
              const active = sortMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => handleSort(mode)}
                  style={[
                    styles.sortChip,
                    {
                      backgroundColor: active ? theme.accent : theme.background.secondary,
                      borderColor: active ? theme.accent : theme.glassBorder,
                    },
                  ]}>
                  <ThemedText
                    variant="captionSmall"
                    weight={active ? '700' : '600'}
                    style={{ color: active ? theme.background.primary : theme.text.secondary }}>
                    {sortLabel(mode)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
```

FlatList（`:542-563`）`data` 改 `visibleItems`，`ListEmptyComponent` 依 `searching` 切換文案：

```tsx
        <FlatList
          data={visibleItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 140 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons
                name={searching ? 'search-off' : 'folder-open'}
                size={48}
                color={theme.text.tertiary}
              />
              <ThemedText
                variant="titleMedium"
                weight="700"
                align="center"
                style={{ marginTop: 12 }}>
                {searching
                  ? t('collectionUi.noMatches')
                  : t('tabs.collectionFolderScreen.emptyTitle')}
              </ThemedText>
              <ThemedText variant="bodySmall" tone="secondary" align="center">
                {searching
                  ? t('collectionUi.noMatchingAnimeInYour')
                  : t('tabs.collectionFolderScreen.emptyBody')}
              </ThemedText>
            </View>
          }
        />
```

（swipe deck 仍吃全量 `items`（triage 整個資料夾），控制列 `viewMode === 'list'` gate 已排除 swipe 模式。）

styles（`StyleSheet.create` 內，`listContent` 附近）新增：

```ts
  controls: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    gap: Spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    ...Typography.bodyMedium,
    paddingVertical: 0,
  },
  sortRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  sortChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
```

`Typography` import：`[id].tsx:23` 目前是 `import { Radius, Spacing } from '../../../constants/DesignSystem';` → 改成 `import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';`。

- [ ] **Step 9: 加 i18n key**（先 en，再 zh-Hant，同形）

`libs/i18n/locales/en.json` 的 `tabs.collectionFolderScreen` 物件內新增 `sort` 子物件與 `searchPlaceholder`：

```json
    "sort": {
      "added": "Added",
      "updated": "Updated",
      "title": "Title",
      "rating": "Rating"
    },
    "searchPlaceholder": "Search this folder",
```

`libs/i18n/locales/zh-Hant.json` 同位置：

```json
    "sort": {
      "added": "加入順序",
      "updated": "最近更新",
      "title": "標題",
      "rating": "評分"
    },
    "searchPlaceholder": "搜尋此資料夾",
```

- [ ] **Step 10: 跑測試確認 pass + 型別 + parity**

Run: `bun test --preload ./test-setup.ts __tests__/unit/collection-folder-sort.test.ts`
Expected: 全綠。
Run: `bun test --preload ./test-setup.ts __tests__/unit/collection-service.test.ts`
Expected: 3 綠。
Run: `bun test --preload ./test-setup.ts __tests__/unit/i18n.test.ts`
Expected: 綠（新 key 在 en＋zh-Hant 同形）。
Run: `bunx tsc --noEmit`
Expected: 無新 error。

- [ ] **Step 11: commit**

```
git add libs/services/storage/keys.ts libs/services/collection/folder-sort.ts libs/services/collection/collection-service.ts "app/(tabs)/collection/[id].tsx" libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json __tests__/unit/collection-folder-sort.test.ts __tests__/unit/collection-service.test.ts
git commit -m "feat(collection): folder-detail sort (added/updated/title/rating) + inline search + default ORDER BY"
```

---

### Task 3: 單一分類體系（5.1）＋ 主頁預覽「查看全部」直達（5.4）

**這是唯一同時刪狀態 tabs 且讓資料夾成為主導覽的 task。** 砍 `CATEGORIES`/`CATEGORY_TO_STATUS`/`CATEGORY_TO_SYSTEM_FOLDER` 與 `selectedCategory` 整條 render 狀態；主頁恆顯示全部資料夾格子（系統＋自訂），folder-grid sort chips 改恆顯示（用 Task 1 縮減後的模式）；修 `system_all` 的 `folderType` 錯標（union 補 `'all'`）；主頁動漫預覽仍 6 張，「查看全部」恆 deep-link 到 `system_all` 資料夾（其排序／搜尋在 Task 2 已就緒 = 5.4）；`CollectionHeader` 拆掉 tab strip 並把 meta 列 raw English 過 `t()`。

**Files:**
- Modify: `types/index.ts`（`folderType` union `:8`）
- Modify: `libs/services/collection/collection-service.ts`（`system_all.folderType` `:13`）
- Modify: `components/collection/CollectionHeader.tsx`（拆 tab strip、meta i18n）
- Modify: `app/(tabs)/collection/index.tsx`（拆 `selectedCategory`、三張 map、See-all、空狀態、sort chips gate、categoryCounts id-guard）
- Modify: `libs/i18n/locales/en.json`、`libs/i18n/locales/zh-Hant.json`
- Test（Modify）: `__tests__/unit/collection-service.test.ts`（追加 `folderType === 'all'` 斷言）

**Interfaces:**
- Consumes: `collectionService.getFolders(): Promise<CollectionFolder[]>`（回傳含 `system_all`，本 task 後其 `folderType === 'all'`）；`CollectionFolder['folderType']`（本 task 後含 `'all'`）。
- Produces: `CollectionHeader` prop 縮減為 `{ totalAnime?, folderCount?, onPressShare?, onAddFolder?, onPressSearch? }`（移除 `categories`/`selectedCategory`/`categoryCounts`/`onSelectCategory`）。Task 4 不依賴這些。

- [ ] **Step 1: 寫 failing test**（追加到 `__tests__/unit/collection-service.test.ts`）

```ts
describe('collectionService.getFolders system_all label', () => {
  it('labels system_all with folderType "all" (not the mislabelled "watching")', async () => {
    spyOn(LocalDB, 'getDatabase').mockResolvedValue({
      getAllAsync: async () => [],
      getFirstAsync: async () => ({ count: 0 }),
    } as never);
    const folders = await collectionService.getFolders();
    const all = folders.find((f) => f.id === 'system_all');
    expect(all?.folderType).toBe('all');
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/collection-service.test.ts`
Expected: 新增的 `system_all` 斷言 FAIL（現值 `'watching'`）。前面 3 個 ordering 測試仍綠。

- [ ] **Step 3: `folderType` union 補 `'all'`** — `types/index.ts:8`

```ts
  folderType: 'custom' | 'wishlist' | 'favorites' | 'watching' | 'completed' | 'dropped' | 'all';
```

- [ ] **Step 4: `system_all.folderType` 改 `'all'`** — `collection-service.ts:6-14`

```ts
  {
    id: 'system_all',
    name: 'All',
    icon: 'library',
    isShared: false,
    isSystemFolder: true,
    isR18: false,
    folderType: 'all',
  },
```

（`getFolders` 的 count switch `:228` 的 `else if (folder.id === 'system_all')` 分支照舊先攔 `system_all`，`'all'` 不在 `statusMap` 也不影響。）

- [ ] **Step 5: 跑測試確認 pass**

Run: `bun test --preload ./test-setup.ts __tests__/unit/collection-service.test.ts`
Expected: 4 綠。

- [ ] **Step 6: 拆 `CollectionHeader` 的 tab strip + meta i18n**

interface（`:10-25`）移除四個 prop：

```ts
interface CollectionHeaderProps {
  /** Total anime count, shown in subtitle. */
  totalAnime?: number;
  /** Number of user-visible folders (favorites + custom), shown in subtitle. */
  folderCount?: number;
  /** Cloud-upload action (enters share mode in design). */
  onPressShare?: () => void;
  /** Plus action (create folder). */
  onAddFolder?: () => void;
  /** Optional search shortcut, rendered as a small glass button. */
  onPressSearch?: () => void;
}
```

destructure（`:27-37`）同步移除 `categories`/`selectedCategory`/`onSelectCategory`/`categoryCounts`。

meta 列（`:42-47`）過 `t()`：

```ts
  const metaParts = [
    totalAnime !== undefined
      ? t('tabs.collectionScreen.metaAnimeCount', { count: String(totalAnime) })
      : null,
    folderCount !== undefined
      ? folderCount === 1
        ? t('tabs.collectionScreen.folderCount.one', { count: String(folderCount) })
        : t('tabs.collectionScreen.folderCount.other', { count: String(folderCount) })
      : null,
  ].filter(Boolean) as string[];
```

刪整段 category `<ScrollView>`（`:98-135`）與其 styles `categoriesContainer`／`categoryButton`／`categoryContent`（`:173-188`）。刪後 `Pressable`、`ScrollView`（`react-native`）、`hapticsBridge` 變成未用 import → 一併移除（`MaterialIcons`、`ThemedIconButton`、`ThemedText`、`readableTextOn`、`Spacing`、`Typography` 仍用）。

- [ ] **Step 7: `index.tsx` — 拆 `selectedCategory` 與三張 map**

刪常數：`CATEGORIES`（`:53`）、`CATEGORY_TO_STATUS`（`:55-62`）、`CATEGORY_TO_SYSTEM_FOLDER`（`:64-70`）。保留 `ANIME_PREVIEW_LIMIT`。

`fetchAnimeCards` 去參數、恆無狀態查詢（`:90-114`）：

```ts
async function fetchAnimeCards(): Promise<CollectionAnimeCardItem[]> {
  const db = await LocalDB.getDatabase();
  const rows = await db.getAllAsync<AnimeCardRow>(
    `SELECT anime_id, title, image_url, progress, total_episodes, status
       FROM user_anime
      WHERE title IS NOT NULL
      ORDER BY COALESCE(updated_at, 0) DESC`
  );

  return rows.map((r) => ({
    id: r.anime_id,
    title: r.title || 'Untitled',
    imageUrl: r.image_url,
    progress: r.progress ?? 0,
    totalEpisodes: r.total_episodes ?? null,
    status: r.status,
  }));
}
```

component 內：刪 `selectedCategory` state（`:169`）、`categoryLoadInitializedRef`（`:189`）。

`loadAnimeCards`（`:192-203`）去參數：

```ts
  const loadAnimeCards = useCallback(async () => {
    const requestId = ++animeCardsLoadRef.current;
    try {
      const next = await fetchAnimeCards();
      if (requestId !== animeCardsLoadRef.current) return;
      setAnimeCards((prev) => (sameAnimeCards(prev, next) ? prev : next));
    } catch (error) {
      if (requestId !== animeCardsLoadRef.current) return;
      console.error('Failed to load anime cards:', error);
      setAnimeCards((prev) => (prev.length === 0 ? prev : []));
    }
  }, []);
```

`loadCollectionData`（`:205-241`）去參數；內部 `fetchAnimeCards(category)` → `fetchAnimeCards()`。

刪掉 category-change effect（`:249-255`，整段 `useEffect(() => { if (!categoryLoadInitializedRef...) ... loadAnimeCards(selectedCategory); }, [...])`）。`loadAnimeCards` 現在只被 nothing 直接呼叫（初次由 `loadCollectionData` 帶起）→ 若 lint 抱怨未用，保留給未來手動 refresh；為 YAGNI 也可直接刪 `loadAnimeCards`。**決定：刪 `loadAnimeCards`（連同 `animeCardsLoadRef` 若不再被 `loadCollectionData` 用到則保留 — `loadCollectionData` 仍用 `animeCardsLoadRef`，故 ref 保留、只刪 `loadAnimeCards` 函式與那段 effect）。**

初次 hydration effect（`:243-247`）：`loadCollectionData(selectedCategory)` → `loadCollectionData()`。

focus effect（`:262-270`）、tracking effect（`:275-279`）、`onRefresh`（`:513-518`）、`refreshCollectionData`（`:520-522`）：全部 `loadCollectionData(selectedCategory)` → `loadCollectionData()`，依賴陣列去掉 `selectedCategory`。

- [ ] **Step 8: `index.tsx` — categoryCounts id-guard、visibleFolders、sort chips gate**

`categoryCounts`（`:420-432`）拆 id-guard（`system_all` 已非 `'watching'`）：

```ts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    collections.forEach((folder) => {
      if (folder.id === 'system_all') counts['All'] = folder.animeCount;
      if (folder.folderType === 'favorites') counts['Favorites'] = folder.animeCount;
      if (folder.folderType === 'watching') counts['Watching'] = folder.animeCount;
      if (folder.folderType === 'completed') counts['Done'] = folder.animeCount;
      if (folder.folderType === 'dropped') counts['Dropped'] = folder.animeCount;
      if (folder.folderType === 'wishlist') counts['Planned'] = folder.animeCount;
    });
    return counts;
  }, [collections]);
```

`visibleFolders`（`:464-503`）拆掉 category 分支與 `targetTypeMap`，恆顯示全部（除 `system_all`）：

```ts
  const visibleFolders = useMemo(() => {
    // Hide the synthetic 'system_all' folder — its count duplicates the
    // overview card, so showing it as a tile is just noise.
    const baseFolders = collections.filter((f) => f.id !== 'system_all');
    return [...baseFolders].sort((a, b) => {
      if (sortMode === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
      if (sortMode === 'oldest') return a.createdAt.getTime() - b.createdAt.getTime();
      if (sortMode === 'count') return b.animeCount - a.animeCount;
      return 0;
    });
  }, [collections, sortMode]);
```

sort chips（`:600-627`）拆掉 `selectedCategory !== 'All'` gate → 恆顯示（其餘 map 內容不變）：

```tsx
            <View style={styles.sortRow}>
              {sortOptions.map((option) => {
                const isActive = sortMode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleSort(option.value)}
                    style={[
                      styles.sortChip,
                      {
                        backgroundColor: isActive ? theme.accent : theme.background.tertiary,
                        borderColor: isActive ? theme.accent : theme.glassBorder,
                      },
                    ]}>
                    <ThemedText
                      variant="captionSmall"
                      weight={isActive ? '700' : '600'}
                      style={{
                        color: isActive ? theme.background.primary : theme.text.secondary,
                      }}>
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
```

- [ ] **Step 9: `index.tsx` — CollectionHeader 呼叫、空狀態、recent 區、See-all**

`CollectionHeader`（`:552-562`）拿掉四個 prop：

```tsx
          <CollectionHeader
            totalAnime={totalCount}
            folderCount={userFolderCount}
            onAddFolder={() => setCreateModalVisible(true)}
            onPressShare={enterShareMode}
            onPressSearch={() => setSearchOpen(true)}
          />
```

folder 空狀態（`:640-681`）：`system_all` 一定存在 → `visibleFolders` 恆 ≥5 系統資料夾，空狀態理論上不會觸發；仍保留防禦，但收斂成 `.all` 文案、去掉 `selectedCategory` 分支：

```tsx
            ) : (
              <View style={styles.emptyState}>
                <ThemedText variant="titleMedium" weight="700" align="center">
                  {t('tabs.collectionScreen.emptyFolderTitle.all')}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  {t('tabs.collectionScreen.emptyFolderBody.all')}
                </ThemedText>
                <Pressable
                  onPress={() => {
                    hapticsBridge.tap();
                    setCreateModalVisible(true);
                  }}
                  style={({ pressed }) => [
                    styles.emptyAction,
                    { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
                  ]}>
                  <MaterialIcons name="create-new-folder" size={16} color={theme.background.primary} />
                  <ThemedText
                    variant="bodySmall"
                    weight="700"
                    style={{ color: theme.background.primary }}>
                    {t('tabs.collectionScreen.newFolder')}
                  </ThemedText>
                </Pressable>
              </View>
            )}
```

recent 區標題（`:720-727`）恆用 `recentAnime`：

```tsx
              <ThemedText variant="titleMedium" weight="700">
                {t('tabs.collectionScreen.recentAnime')}
              </ThemedText>
```

See-all（`:728-744`）恆指 `system_all`（= 5.4，全清單排序在 Task 2 已就緒）：

```tsx
              {animeCards.length > ANIME_PREVIEW_LIMIT ? (
                <Pressable
                  onPress={() => {
                    hapticsBridge.tap();
                    router.push(
                      `/collection/system_all?name=${encodeURIComponent(
                        t('tabs.collectionScreen.categoryAll')
                      )}`
                    );
                  }}
                  hitSlop={8}
                  style={styles.sectionHeaderRight}>
                  <ThemedText variant="captionSmall" tone="secondary" weight="600">
                    {t('tabs.collectionScreen.seeAllCount', { count: String(animeCards.length) })}
                  </ThemedText>
                  <MaterialIcons name="chevron-right" size={14} color={theme.text.tertiary} />
                </Pressable>
              ) : null}
```

anime 空狀態（`:757-770`）收斂成 `.all`：

```tsx
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  {t('tabs.collectionScreen.emptyAnimeBody.all')}
                </ThemedText>
```

- [ ] **Step 10: 加 i18n key**（先 en 再 zh-Hant，同形）

`libs/i18n/locales/en.json` 的 `tabs.collectionScreen` 內新增：

```json
    "metaAnimeCount": "{count} anime",
```

`libs/i18n/locales/zh-Hant.json` 同位置：

```json
    "metaAnimeCount": "{count} 部動畫",
```

（`categoryAll`/`folderCount.*`/`recentAnime`/`seeAllCount`/`emptyFolderTitle.all` 等既有 key 全部已存在，不新增。）

- [ ] **Step 11: 型別 + 全套測試**

Run: `bunx tsc --noEmit`
Expected: 無新 error。重點確認：`CollectionHeader` 移除 prop 後 `index.tsx` 無殘留傳參；`selectedCategory` 已全清（任何 `selectedCategory` 殘留都是 TS error）；`recentAnimeForCategory`／`emptyAnimeBody.category`／`emptyFolderTitle.category` 等只在被刪分支用到的 key 不再被引用（key 留 catalog 無妨）。
Run: `bun test --preload ./test-setup.ts __tests__/unit/collection-service.test.ts __tests__/unit/i18n.test.ts`
Expected: 綠。
Run: `bun run test:unit`
Expected: 全套綠（baseline 1397 起跳，本 plan 新增測試計入；無回歸）。

- [ ] **Step 12: commit**

```
git add types/index.ts libs/services/collection/collection-service.ts components/collection/CollectionHeader.tsx "app/(tabs)/collection/index.tsx" libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json __tests__/unit/collection-service.test.ts
git commit -m "refactor(collection): single taxonomy — drop status tabs, folders are the sole entry; fix system_all folderType; See-all -> All folder"
```

---

### Task 4: 移除分享鷹架 UI（5.5）— schema 保留、UI 痕跡刪除

無後端的資料夾分享：刪 `FolderGrid` 的 people-icon badge 與 `CreateFolderModal` 的「Share with friends」Switch（Rule 8：不呈現一個不存在的功能）；DB 欄位（`is_shared`）與 `CollectionFolder.isShared/sharedBy` type 欄位保留、標註 dormant（不做 migration）。順手把同一 metaRow 的 `{count} item/items` raw English 過 `t()`。此 task 為純 JSX／schema 註解變更，無新邏輯路徑，故無新單元測試 — 以 `bunx tsc --noEmit` ＋ 全套回歸為驗收（Rule 8 誠實：不製造裝飾性斷言）。

**Files:**
- Modify: `components/collection/FolderGrid.tsx`（`:103-111` badge、`:86` item count i18n）
- Modify: `components/collection/CreateFolderModal.tsx`（`isShared` state/effect/Switch/editing prop）
- Modify: `app/(tabs)/collection/index.tsx`（CreateFolderModal `editing` prop 去 `isShared`，`:798-808`）
- Modify: `libs/services/collection/collection-service.ts`（dormant 註解，`SYSTEM_FOLDERS`／`sharedBy`）
- Modify: `types/index.ts`（`isShared`/`sharedBy` dormant 註解）
- Modify: `libs/i18n/locales/en.json`、`libs/i18n/locales/zh-Hant.json`

**Interfaces:**
- Consumes: `CollectionFolder`（`isShared`/`sharedBy` 欄位保留）；`NewFolderData`（`isShared` 欄位保留、恆 `false`）。
- Produces: `CreateFolderModal` 的 `editing` prop 型別縮成 `{ id: string; name: string; icon: string; isR18: boolean }`（移除 `isShared`）。

- [ ] **Step 1: `FolderGrid` — 刪 badge、item count 過 t()**

metaRow（`:84-113`）：

```tsx
        <View style={styles.metaRow}>
          <ThemedText variant="captionSmall" tone="secondary">
            {folder.animeCount === 1
              ? t('collectionUi.folderItemCount.one', { count: String(folder.animeCount) })
              : t('collectionUi.folderItemCount.other', { count: String(folder.animeCount) })}
          </ThemedText>
          <View style={styles.metaIcons}>
            {folder.isR18 ? (
              <View style={[styles.r18Pill, { backgroundColor: theme.accent }]}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: theme.background.primary }}>
                  18+
                </ThemedText>
              </View>
            ) : null}
            <MaterialIcons name="chevron-right" size={14} color={theme.text.tertiary} />
          </View>
        </View>
```

`FolderGrid` 目前沒 import `useT` → 在 `FolderCard` 內加 `const t = useT();`（`const { theme } = useTheme();` 同一行下方），並在檔頭 import：`import { useT } from '../../libs/i18n';`。`MaterialIcons` 仍用（chevron），保留 import。

- [ ] **Step 2: `CreateFolderModal` — 移除 share 開關**

`editing` prop 型別（`:34`）去 `isShared`：

```ts
  editing?: { id: string; name: string; icon: string; isR18: boolean };
```

刪 `isShared` state（`:63`）。effect（`:69-82`）去 `setIsShared` 兩處：

```ts
  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setIcon(editing.icon || 'folder');
      setIsR18(!!editing.isR18);
    } else {
      setName('');
      setIcon('folder');
      setIsR18(false);
    }
  }, [visible, editing]);
```

`data` 物件（`:89-94`）`isShared` 恆 `false`（schema dormant，欄位保留）：

```ts
      const data: NewFolderData = {
        name: name.trim(),
        icon,
        isShared: false, // dormant: folder sharing has no backend yet.
        isR18,
      };
```

刪「Share with friends」switchRow（`:165-173`）整段。`Switch` import 保留（R18 那顆仍用）。`collectionUi.shareWithFriends` i18n key 留 catalog 不刪。

- [ ] **Step 3: `index.tsx` — CreateFolderModal editing prop 去 isShared**

`:798-808`：

```tsx
          editing={
            editingFolder
              ? {
                  id: editingFolder.id,
                  name: editingFolder.name,
                  icon: editingFolder.icon,
                  isR18: editingFolder.isR18,
                }
              : undefined
          }
```

（`sameCollections` 的 `folder.isShared`/`folder.sharedBy`（`:139-140`）保留 — 非顯示、非排序，只是等值比較 key。）

- [ ] **Step 4: dormant 註解**

`types/index.ts`（`CollectionFolder`）在 `isShared`/`sharedBy` 兩行加註解：

```ts
  /** Dormant: folder sharing has no backend. Persisted but never surfaced in UI. */
  isShared: boolean;
```
```ts
  /** Dormant: always 0 (no share backend). Kept for schema/backup parity. */
  sharedBy: number;
```

`collection-service.ts`：在 `SYSTEM_FOLDERS` 上方或 `sharedBy: 0` 附近加一行註解，說明 `is_shared`/`sharedBy` 為 dormant scaffold（無 backend、不做 migration）。

- [ ] **Step 5: 加 i18n key**（先 en 再 zh-Hant）

`libs/i18n/locales/en.json` 的 `collectionUi` 內新增：

```json
    "folderItemCount": {
      "one": "{count} item",
      "other": "{count} items"
    },
```

`libs/i18n/locales/zh-Hant.json` 同位置：

```json
    "folderItemCount": {
      "one": "{count} 部",
      "other": "{count} 部"
    },
```

- [ ] **Step 6: 型別 + 全套測試 + parity**

Run: `bunx tsc --noEmit`
Expected: 無新 error（`editing.isShared` 已無 consumer；`CreateFolderModal` 內 `isShared` 變數已清）。
Run: `bun test --preload ./test-setup.ts __tests__/unit/i18n.test.ts`
Expected: 綠。
Run: `bun run test:unit`
Expected: 全套綠、無回歸（`backup/*` 測試仍用 `isShared` 欄位 → 因 schema/type 保留而不受影響）。

- [ ] **Step 7: commit**

```
git add components/collection/FolderGrid.tsx components/collection/CreateFolderModal.tsx "app/(tabs)/collection/index.tsx" types/index.ts libs/services/collection/collection-service.ts libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json
git commit -m "chore(collection): remove dormant share UI (folder badge + create-modal toggle), keep schema"
```

---

## Self-review

**Spec 覆蓋（Phase 5 表 → task）:**
- 5.1 單一分類體系 → Task 3（拆狀態 tabs＋三張 map＋`selectedCategory`；`system_all.folderType` 修 `'all'`；`CollectionHeader` 拆 tab strip）。
- 5.2 資料夾內排序＋搜尋 → Task 2（`getFolderItems` 預設 ORDER BY；`folder-sort.ts`；`[id].tsx` sort chips＋inline 搜尋；新 MMKV key 持久化）。
- 5.3 刪壞排序 → Task 1（`CollectionSortMode` 縮 `newest/oldest/count`；`sortOptions` 對齊；殘值 fallback；死分支刪）。
- 5.4 主頁預覽上限 → Task 3（保留 6 張預覽；「查看全部」恆達 `system_all`，全清單排序由 5.2 供給）。
- 5.5 分享鷹架 → Task 4（刪 `FolderGrid` badge＋`CreateFolderModal` 開關；schema／type 保留標 dormant）。

**「每個 commit 讓 tab 可用」核對:** Task 1（不動導覽）、Task 2（獨立於 tabs）、Task 3（唯一同時拆 tabs＋立資料夾主導覽）、Task 4（純 UI 刪除）。狀態 tabs 僅在 Task 3 消失。✓

**移除 `CollectionSortMode` 變體的受影響 callsite（全枚舉）:**
- `libs/services/collection-prefs.ts:5`（type 定義）、`:7-14`（`VALID_SORT_MODES`）— Task 1 縮減。
- `app/(tabs)/collection/index.tsx:33`（type import，仍存在 = 縮減後的 type，無需改）、`:50`（`type SortMode = CollectionSortMode`，仍有效）、`:172`（`useState<SortMode>(loadCollectionSortModeSync)`，不變）、`:289`（`saveCollectionSortMode(sortMode)`，不變）、`:497-500`（`rarity`/`popularity`/`id` 死分支 — Task 1 刪）、`:534`（`sortOptions` 的 `rarity` — Task 1 刪）。
- `types/index.ts:11`（`sharedBy`）— `popularity` 排序（`index.tsx:498`）是唯一 UI 讀取點，Task 1 刪後 `sharedBy` 僅剩 `sameCollections`（保留）與 service `sharedBy: 0`（保留、Task 4 標 dormant）。
- 無其他檔案 import `CollectionSortMode`（grep 全庫僅 `collection-prefs.ts` 與 `index.tsx`）。MMKV 舊存的 `rarity/popularity/id` 由 `loadCollectionSortModeSync` fallback 治理（Task 1 測試覆蓋）。

**Placeholder 掃描:** 無 TBD／「類似 Task N」；每個 code step 都給實際碼。

**型別一致性:** `FolderSortMode`（Task 2）與 `CollectionSortMode`（Task 1）是**兩套獨立** sort 概念（資料夾內 vs 主頁資料夾格子），各自 MMKV key，不混用（符合 outline 決定 2 的「別跟資料夾格子排序混用」）。`folderType` 加 `'all'` 為 additive union，`cloudkit-converter.ts`／`legacy-aniseeker.ts` 用 loose `string` 不受影響。

**未修範圍（誠實記錄，非本 phase）:** `CollectionSearchModal.tsx` 尚有 raw English（`:451` `Nothing in your collection for "…"`、`:504-506` `item/items`／`System folder`）— 屬主頁全域搜尋 Modal，非 Phase 5 表列項；歸 Phase 6.5 i18n 清單。`components/collection/FolderList.tsx` 為死碼（零 import）不動。

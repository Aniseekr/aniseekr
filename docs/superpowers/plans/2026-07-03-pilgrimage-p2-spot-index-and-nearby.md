# Pilgrimage Phase 2（景點級全球索引 + Nearby 復活 + 點資料快照）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓「離我最近的聖地」在世界任何地方都能離線顯示（含我追的動漫），做法是新增一條 pipeline 產出景點級全球索引 + 熱門動漫點資料快照，app 端把索引灌進 SQLite、復活死碼 `NearbySpotsSheet`、把 hub 假網格 hero 換成真的最近聖地照片卡，並拆掉不再需要的 4° bounds 保護。

**Architecture:** 跨兩個 repo。Pipeline（`Aniseekr-source`）複製 `build-anitabi-index` 的模式：一支新 script 讀 L2 `anitabi-index.json`，對每個 Bangumi id 抓 `/bangumi/{id}/points`，一次迴圈輸出兩個 artifact（`anitabi-spots-index.json` 全球扁平點索引 + `anitabi-points-top.json` 前 100 名原始點快照），各自走 dated+alias GitHub Release。App（`aniseekr`）沿用 `anitabi-data-service` 的下載→FileSystem 快取→hydrate 節奏：把景點索引灌進新 SQLite 表 `anitabi_spots`（lat BETWEEN 粗篩 + JS haversine 精算），景點查詢餵給復活的 `nearby-spots` 純函式、hub hero、以及地圖 sheet 的「附近景點」段。所有新機制都是「接線」——純函式先寫先測，I/O glue 隨後，UI 最後接。

**Tech Stack:** Pipeline：Bun（`bun test`，無 preload）、bun scripts、JSON Schema（Draft 2020-12）、GitHub Actions + `gh release`。App：Bun test（`--preload ./test-setup.ts`）、expo-sqlite（`libs/db.ts` LocalDB）、`CacheService`、expo-file-system/legacy、expo-image、MapLibre RN、`@gorhom/bottom-sheet`。

**Spec:** `docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md`（Phase 2 表 2.1–2.6 + Phase 0 表 0.5「點資料快照」併入本 plan 的 pipeline 部分）。

---

## Deltas — 實際程式碼與 outline 假設不符處（動工前必讀）

寫作時針對 `/Users/kidney/Workspace/Work/ani/aniseekr`（main）與 `/Users/kidney/Workspace/Work/ani/Aniseekr-source` 逐一驗證，以下與 outline 有出入：

1. **P0/P1 尚未落地（重大前置條件）。** outline 寫「P0/P1 plan 已落地（SpotImage、anitabiImageSource、stale-if-error 已存在）」，但 main 上 **`components/pilgrimage/SpotImage.tsx` 不存在**、`libs/services/pilgrimage/anitabi-image.ts` **無 `anitabiImageSource`**、`anitabi-service.ts` **無 stale-if-error（`staleRow`/`readStaleDetail`）**、`locate-fab-state.ts` **無 `shouldAutoEngageFollow`**。
   → **本 plan 假設 P0/P1 已先行合併**（依 spec §4 順序 0→1→2）。Task 8/9 的 `SpotImage` 與 Task 6 依賴的 detail cache 90d grace 都來自 P0。**執行本 plan 前，先確認 P0/P1 已 merge**；否則 `import { SpotImage }` 會編不過。若要在 P0/P1 之前先做 pipeline，Task 1–3（純 pipeline repo）無此依賴，可獨立先跑。

2. **SQLite 已有一張 `pilgrimage_spots` 表**（`libs/db.ts:351-368`，是 AnitabiService 的**動漫中心點 lite 快取**，bangumi_id PRIMARY KEY）。景點級新表**不可**沿用這個名字——本 plan 用 outline 指定的 **`anitabi_spots`**（point_id PRIMARY KEY）。

3. **`/points` 抓取的 raw 圖片是相對路徑**（`normalizeRawPoints` 靠 `normalizeAnitabiImageUrl(p.image, bangumiId)` 轉絕對，`anitabi-points.ts:48`）。`normalizeAnitabiImageUrl` 依賴 app 端 `bangumi-client`，**pipeline 無法共用**。決定：**spots-index artifact 存 anitabi 原樣的相對 `img`**（保持 artifact 小、DRY），**app 在 `buildNearbySpotsFromIndex` 讀出時才呼叫 `normalizeAnitabiImageUrl`**（`SpotImage` 只接受絕對 http(s)，所以一定要在餵給它之前正規化）。

4. **hero 點擊路由已是景點需要的形狀**：`index.tsx:516-526` `handleHeroPress` 已 `router.push('/pilgrimage/map', { mode:'map', focus:String(bangumiId) })`。Task 8 只需把 `focus` 來源從 `nearestAnime.anime.id` 換成 `nearestSpot.bangumiId`。

5. **2.6 的四個 quick actions 不能全掛在 anime 中心點 marker 上（Rule 8）。** `spot-intents`（saved/planned）與 `visited-prefs` 都是 **point-id keyed**（`spot-intents.ts:45-59`、`VISITED_SPOTS_STORAGE_KEY`）；hub 地圖的 marker 是**動漫中心點**（`bgm:<id>`），沒有 point id。把「收藏/計畫/打卡」硬掛到中心點會產生沒人讀的 write-only 假狀態。**決定：** Task 11 只做引擎 `onMarkerLongPress` 的乾淨接線 + hub 地圖 anime marker 的兩個**誠實**動作（**導航** `buildMapsURL`＋**查看聖地** `navigateToDetail`）。四動作的完整版屬於 point-level spot marker（要等把 spot 畫成 marker，超出本 phase）——記錄為 delta，不假裝實作。

6. **地圖 sheet 接法選擇（2.3）。** hub 地圖已有一張常駐 `@gorhom/bottom-sheet`（`PilgrimageHubSheet`，`map.tsx:902-919`）。**再疊第二張 bottom sheet 會與它搶同一個底部錨點與 snap 手勢。** 決定：**不疊新 sheet**，改在 `PilgrimageHubSheet` 的 `BottomSheetFlatList` 加一個 `ListHeaderComponent`「附近景點」水平 strip（outline 允許「現有 PilgrimageHubSheet 加 section」）。死碼 `NearbySpotsSheet.tsx` 藉由**匯出並複用它的 `NearbySpotRow` + `formatKm`（順手改用 `SpotImage`）**而復活；其 default-export 整張 sheet 不再掛載但保留檔案（row 元件已被 import → 不再是死碼）。

7. **pipeline 無 checksum/manifest/coverage-gate 慣例**（僅 refuse-empty guard，`build-anitabi-index.ts:364-366`）。本 plan 兩個新 script 沿用同一個 refuse-empty 慣例，不引入新 gate（YAGNI）。

---

## Global Constraints

- **App 測試**一律 `bun run test:unit` 或 `bun test --preload ./test-setup.ts <file>` — 裸 `bun test` 會炸（CLAUDE.md Workflow，跳過 native-module mock）。**Pipeline 測試**用該 repo 慣例 `bun test`（`Aniseekr-source/package.json` 的 `"test": "bun test"`，測試放 `tests/`，helper 放 `scripts/lib/`）。
- App 型別檢查 `bunx tsc --noEmit`；baseline 有 2 個既存 TS2882（`global.css`）——不得新增其他錯誤。
- UI 字串一律 `useT()`；新 key **先加 `libs/i18n/locales/en.json`**（TypeScript 從 `en.json` 推 `TranslationKey`），再補 `zh-Hant.json`（Rule 11）。i18n parity 測試會擋漏改的 locale。
- 顏色一律 `useTheme()` token（Rule 4）；錯誤態要誠實（Rule 8——景點圖失敗顯示 `SpotImage` 的錯誤 tile，不是靜默空白；無定位/無資料顯示既有誠實空態，不編假資料）。
- 高頻 sensor / 地圖手勢值不進 React render path（Rule 9）——景點查詢是低頻（location fix / 手動開 sheet 時觸發），不在每個 tick 跑 SQLite。
- App 端「下載未上線 release」的程式碼**必須容忍 404**：沿用 `anitabi-data-service.ts:91-104` 的 `res.status !== 200 → return null` 慣例；pipeline artifact 尚未發佈時，app **維持現狀不 crash**（fallback = 動漫中心點索引照舊、hero 走誠實空態）。
- 每個 task 結尾各自 commit（訊息已給）。**不要 push。**Pipeline 與 app 是兩個 git repo，各自在自己的 repo 裡 commit。
- **順序**：Task 1–3（pipeline，可本地 `bun test` + 本地跑 script 驗證產出）**先於** Task 4–11（app 消費）。App 端即使 release 還沒上線也要能編譯、能綠燈（404 容忍）。

---

# 第一部分：Pipeline（`/Users/kidney/Workspace/Work/ani/Aniseekr-source`）

> 這三個 task 在 **Aniseekr-source** repo 內，用 `bun test`（無 preload）。範本是 `scripts/build-anitabi-index.ts` + `scripts/build-anitabi-cross-index.ts`（讀 alias release 當 seed 的 `fetchJson` 404 容忍寫法）+ `.github/workflows/build-anitabi-index.yml` + `schemas/anitabi-index.schema.json` + `scripts/lib/bangumi-dump.ts`（純 helper + `tests/*.test.ts`）。

---

### Task 1: pipeline 純 build helpers + bun test（先寫可測的核心）

**Files:**
- Create: `scripts/lib/anitabi-points-build.ts`
- Test: `tests/anitabi-points-build.test.ts`

**Interfaces:**
- Produces:
  - `interface RawPoint { id?: unknown; name?: unknown; cn?: unknown; image?: unknown; ep?: unknown; s?: unknown; geo?: unknown; }`
  - `interface SpotEntry { id: string; b: number; lat: number; lng: number; n: string; c: string; img: string; }`
  - `spotEntryFromRawPoint(raw: RawPoint, bangumiId: number): SpotEntry | null` — 只收有效 geo 且有非空 image 的點（比照 app `normalizeRawPoints` 的 drop 原則 + index `hasValidGeo`）。
  - `topBangumiIdsByPoints(entries: readonly { id: number; pointsLength?: number | null }[], limit: number): number[]` — 依 `pointsLength` 降冪取前 `limit` 個 id（tie-break：id 升冪，穩定）。
  - `round6(n: number): number`

- [ ] **Step 1: 寫 failing tests**（`tests/anitabi-points-build.test.ts`）

```ts
import { describe, expect, it } from 'bun:test';
import {
  spotEntryFromRawPoint,
  topBangumiIdsByPoints,
  round6,
} from '../scripts/lib/anitabi-points-build';

describe('spotEntryFromRawPoint', () => {
  it('keeps a point with valid geo + image, rounding coords to 6dp', () => {
    const out = spotEntryFromRawPoint(
      {
        id: 'pt1',
        name: '宇治橋',
        cn: '宇治桥',
        image: '/images/points/115908/pt1.jpg',
        geo: [34.8912345678, 135.8012345678],
      },
      115908
    );
    expect(out).toEqual({
      id: 'pt1',
      b: 115908,
      lat: 34.891235,
      lng: 135.801235,
      n: '宇治橋',
      c: '宇治桥',
      img: '/images/points/115908/pt1.jpg',
    });
  });

  it('drops points with no image, no id, no name, or invalid geo', () => {
    expect(spotEntryFromRawPoint({ id: 'a', name: 'x', geo: [35, 139] }, 1)).toBeNull(); // no image
    expect(
      spotEntryFromRawPoint({ id: '', name: 'x', image: '/i.jpg', geo: [35, 139] }, 1)
    ).toBeNull(); // no id
    expect(
      spotEntryFromRawPoint({ id: 'a', name: '', image: '/i.jpg', geo: [35, 139] }, 1)
    ).toBeNull(); // no name
    expect(
      spotEntryFromRawPoint({ id: 'a', name: 'x', image: '/i.jpg', geo: [0, 0] }, 1)
    ).toBeNull(); // 0,0 geo
    expect(
      spotEntryFromRawPoint({ id: 'a', name: 'x', image: '/i.jpg', geo: [200, 0] }, 1)
    ).toBeNull(); // out of range
    expect(
      spotEntryFromRawPoint({ id: 'a', name: 'x', image: '/i.jpg' }, 1)
    ).toBeNull(); // no geo
  });

  it('defaults cn to empty string and trims strings', () => {
    const out = spotEntryFromRawPoint(
      { id: ' pt2 ', name: ' 駅前 ', image: ' /i.jpg ', geo: [35.1, 139.2] },
      42
    );
    expect(out).toEqual({ id: 'pt2', b: 42, lat: 35.1, lng: 139.2, n: '駅前', c: '', img: '/i.jpg' });
  });
});

describe('topBangumiIdsByPoints', () => {
  it('returns the highest-pointsLength ids, capped at limit, id-stable on ties', () => {
    const entries = [
      { id: 10, pointsLength: 5 },
      { id: 20, pointsLength: 100 },
      { id: 30, pointsLength: 100 },
      { id: 40, pointsLength: null },
      { id: 50, pointsLength: 7 },
    ];
    expect(topBangumiIdsByPoints(entries, 3)).toEqual([20, 30, 50]);
  });

  it('treats missing pointsLength as 0 and never exceeds available entries', () => {
    expect(topBangumiIdsByPoints([{ id: 1 }], 10)).toEqual([1]);
  });
});

describe('round6', () => {
  it('rounds to 6 decimal places', () => {
    expect(round6(34.123456789)).toBe(34.123457);
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run（在 `Aniseekr-source` repo）：`bun test tests/anitabi-points-build.test.ts`
Expected: FAIL — `Cannot find module '../scripts/lib/anitabi-points-build'`。

- [ ] **Step 3: 實作 `scripts/lib/anitabi-points-build.ts`**

```ts
// Pure build helpers for scripts/build-anitabi-points.ts. Kept here (not in the
// script) so they are unit-testable with `bun test` without hitting the network.
//
// Filtering mirrors the app's normalizeRawPoints (drop points with no id/name/
// image) plus the anitabi-index hasValidGeo rule (finite, in-range, non-(0,0)).

/** Loosely-typed point exactly as GET /bangumi/{id}/points returns each element. */
export interface RawPoint {
  id?: unknown;
  name?: unknown;
  cn?: unknown;
  image?: unknown;
  ep?: unknown;
  s?: unknown;
  geo?: unknown;
}

/** One row in anitabi-spots-index.json. Minified keys to keep the artifact small. */
export interface SpotEntry {
  /** anitabi point id (stable within an anime). */
  id: string;
  /** Bangumi subject id this point belongs to. */
  b: number;
  lat: number;
  lng: number;
  /** Japanese/original name. */
  n: string;
  /** Chinese name, '' when anitabi has none. */
  c: string;
  /** Scene image, exactly as anitabi returns it (usually a host-relative
   *  `/images/points/...` path). The app normalizes it to an absolute CDN
   *  thumbnail on read via normalizeAnitabiImageUrl. */
  img: string;
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function hasValidGeo(geo: unknown): geo is [number, number] {
  if (!Array.isArray(geo) || geo.length < 2) return false;
  const lat = Number(geo[0]);
  const lng = Number(geo[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function spotEntryFromRawPoint(raw: RawPoint, bangumiId: number): SpotEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id);
  if (!id) return null;
  const n = str(raw.name);
  if (!n) return null;
  const img = str(raw.image);
  if (!img) return null; // no reference frame ⇒ useless for the compare feature
  if (!hasValidGeo(raw.geo)) return null;
  const [lat, lng] = raw.geo as [number, number];
  return {
    id,
    b: bangumiId,
    lat: round6(Number(lat)),
    lng: round6(Number(lng)),
    n,
    c: str(raw.cn),
    img,
  };
}

export function topBangumiIdsByPoints(
  entries: readonly { id: number; pointsLength?: number | null }[],
  limit: number
): number[] {
  return [...entries]
    .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0) || a.id - b.id)
    .slice(0, Math.max(0, limit))
    .map((e) => e.id);
}
```

- [ ] **Step 4: 跑測試確認 pass** → Run: `bun test tests/anitabi-points-build.test.ts` Expected: 全 PASS。

- [ ] **Step 5: Commit**（在 `Aniseekr-source` repo）

```bash
git add scripts/lib/anitabi-points-build.ts tests/anitabi-points-build.test.ts
git commit -m "feat(anitabi-points): pure build helpers for the point-level index + top snapshot"
```

---

### Task 2: pipeline build script + 兩個 JSON Schema + package script + README

**Files:**
- Create: `scripts/build-anitabi-points.ts`
- Create: `schemas/anitabi-spots-index.schema.json`
- Create: `schemas/anitabi-points-top.schema.json`
- Modify: `package.json`（加 `build:anitabi-points` script）
- Modify: `README.md`（加一節，比照現有「Anitabi Index」節）

**Interfaces:**
- Consumes: `spotEntryFromRawPoint`、`topBangumiIdsByPoints`（Task 1）。
- Produces（穩定 URL，供 app 端 Task 5/6 消費）：
  - `https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-spots-index/anitabi-spots-index.json`
  - `https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-points-top/anitabi-points-top.json`
- 輸出文件形狀（見下方 schema）：
  - spots-index root: `{ $schema, generatedAt, source, count, spots: SpotEntry[] }`
  - points-top root: `{ $schema, generatedAt, source, topN, byBangumiId: { [id: string]: RawPoint[] } }`

- [ ] **Step 1: 建兩個 schema**

`schemas/anitabi-spots-index.schema.json`：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/Aniseekr/Aniseekr-source/raw/main/schemas/anitabi-spots-index.schema.json",
  "title": "Anitabi Spots Index",
  "description": "Flat global index of individual anitabi.cn pilgrimage scene points (one row per real-world location cut that has both valid coordinates and a scene image), built by enumerating GET /bangumi/{id}/points over every id in anitabi-index.json.",
  "type": "object",
  "required": ["generatedAt", "source", "count", "spots"],
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string", "format": "uri" },
    "generatedAt": { "type": "integer", "description": "Unix epoch ms when produced." },
    "source": { "type": "string", "description": "Build provenance, e.g. 'scripts/build-anitabi-points.ts'." },
    "count": { "type": "integer", "minimum": 0, "description": "spots.length, for a cheap sanity check." },
    "spots": {
      "type": "array",
      "description": "All scene points with valid geo + image. Not sorted (the client indexes by lat).",
      "items": { "$ref": "#/$defs/SpotEntry" }
    }
  },
  "$defs": {
    "SpotEntry": {
      "type": "object",
      "required": ["id", "b", "lat", "lng", "n", "c", "img"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "minLength": 1, "description": "anitabi point id (stable within an anime)." },
        "b": { "type": "integer", "minimum": 1, "description": "Bangumi subject id." },
        "lat": { "type": "number", "minimum": -90, "maximum": 90 },
        "lng": { "type": "number", "minimum": -180, "maximum": 180 },
        "n": { "type": "string", "description": "Original-language name." },
        "c": { "type": "string", "description": "Chinese name; '' when absent." },
        "img": { "type": "string", "minLength": 1, "description": "Scene image as anitabi returns it (host-relative path); the client normalizes to an absolute CDN thumbnail on read." }
      }
    }
  }
}
```

`schemas/anitabi-points-top.schema.json`：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/Aniseekr/Aniseekr-source/raw/main/schemas/anitabi-points-top.schema.json",
  "title": "Anitabi Points Top Snapshot",
  "description": "Raw GET /bangumi/{id}/points payloads for the top-N anime by pointsLength, so the app can seed complete offline point data for the most-visited anime without per-anime round trips. Keyed by Bangumi subject id (string). Each value is the raw points array, fed unchanged into the app's normalizeRawPoints.",
  "type": "object",
  "required": ["generatedAt", "source", "topN", "byBangumiId"],
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string", "format": "uri" },
    "generatedAt": { "type": "integer" },
    "source": { "type": "string" },
    "topN": { "type": "integer", "minimum": 0, "description": "Requested cap on the number of anime included." },
    "byBangumiId": {
      "type": "object",
      "description": "Map of Bangumi subject id (as a string key) to that anime's raw /points array. Point objects are passed through as-is; only their presence + shape is contractual.",
      "additionalProperties": {
        "type": "array",
        "items": { "type": "object" }
      }
    }
  }
}
```

- [ ] **Step 2: 建 `scripts/build-anitabi-points.ts`**

```ts
#!/usr/bin/env bun
/**
 * Build the two anitabi point-level artifacts from the L2 anitabi-index.
 *
 * For every Bangumi subject id in the L2 index, fetch the complete
 * GET https://api.anitabi.cn/bangumi/{id}/points payload once, and in a single
 * pass emit BOTH:
 *
 *   1. anitabi-spots-index.json — a flat, global, point-level index. One row
 *      per scene point that has valid geo AND a scene image. This is what the
 *      app queries for "sacred sites near me". (~40-80k rows, minified.)
 *   2. anitabi-points-top.json — the raw /points payload for the top-100 anime
 *      by pointsLength, so the app can seed complete offline point data for the
 *      most-visited anime. (Fed straight into the app's normalizeRawPoints.)
 *
 * L2 index input (mirrors build-anitabi-cross-index.ts):
 *   - Local ./anitabi-index.json when present (dev loop / CI checkout), else
 *   - the stable alias release asset (downloaded, 404-tolerant).
 *   Override the local path with ANITABI_INDEX_PATH.
 *
 * WAF probe (spec 2026-07-03 §5 spike 1): api.anitabi.cn sits behind a
 * Cloudflare WAF. A 403 means the pipeline's egress is now blocked; rather than
 * write a half-empty index the script ABORTS the whole run and exits 1, so a
 * failed workflow is a visible signal. (404 = "this anime has no points" and is
 * skipped; other transient errors get 3 retries then skip that id.)
 *
 * Usage:
 *   bun scripts/build-anitabi-points.ts
 *   ANITABI_INDEX_PATH=./anitabi-index.json bun scripts/build-anitabi-points.ts
 *   ANITABI_DELAY_MS=200 bun scripts/build-anitabi-points.ts
 *
 * @see schemas/anitabi-spots-index.schema.json, schemas/anitabi-points-top.schema.json
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  spotEntryFromRawPoint,
  topBangumiIdsByPoints,
  type RawPoint,
  type SpotEntry,
} from './lib/anitabi-points-build';

// ---------- constants ----------

const POINTS_URL = (id: number) => `https://api.anitabi.cn/bangumi/${id}/points`;

const L2_LOCAL_DEFAULT = 'anitabi-index.json';
const L2_ALIAS_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-index/anitabi-index.json';

const SPOTS_OUTPUT = 'anitabi-spots-index.json';
const TOP_OUTPUT = 'anitabi-points-top.json';

const SPOTS_SCHEMA_URL =
  'https://github.com/Aniseekr/Aniseekr-source/raw/main/schemas/anitabi-spots-index.schema.json';
const TOP_SCHEMA_URL =
  'https://github.com/Aniseekr/Aniseekr-source/raw/main/schemas/anitabi-points-top.schema.json';

const USER_AGENT = 'Aniseekr-source/1.0 (+https://github.com/Aniseekr/Aniseekr-source)';
const DELAY_MS = Number(process.env.ANITABI_DELAY_MS ?? '120');
const TOP_N = 100;

// ---------- types ----------

interface L2Entry {
  id: number;
  pointsLength?: number | null;
}
interface L2File {
  generatedAt: number;
  source: string;
  entries: L2Entry[];
}
interface RawPointsResponse {
  points?: RawPoint[];
}

/** Thrown when anitabi returns HTTP 403 — treated as a hard, run-aborting WAF block. */
class WafBlockedError extends Error {}

// ---------- helpers ----------

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

/** Load L2 from a local file (dev/CI checkout) or the alias release (404-tolerant). */
async function loadL2(): Promise<L2File | null> {
  const localPath = process.env.ANITABI_INDEX_PATH ?? L2_LOCAL_DEFAULT;
  const abs = resolve(process.cwd(), localPath);
  if (existsSync(abs)) {
    console.log(`[anitabi-points] reading local L2 index: ${abs}`);
    return JSON.parse(readFileSync(abs, 'utf8')) as L2File;
  }
  console.log(`[anitabi-points] no local index, downloading alias: ${L2_ALIAS_URL}`);
  try {
    const res = await fetch(L2_ALIAS_URL, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (res.status === 404) {
      console.warn('[anitabi-points] L2 alias 404 (index not published yet)');
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as L2File;
  } catch (err) {
    console.warn('[anitabi-points] L2 download failed:', (err as Error).message);
    return null;
  }
}

/** Fetch /points for one id: 404→null(skip), 403→WafBlockedError, else 3 retries then null. */
async function fetchPoints(id: number): Promise<RawPoint[] | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(POINTS_URL(id), {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
      if (res.status === 403) throw new WafBlockedError(`HTTP 403 on bgm#${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as RawPointsResponse;
      return Array.isArray(json.points) ? json.points : [];
    } catch (err) {
      if (err instanceof WafBlockedError) throw err; // never retry a WAF block
      if (attempt === 3) {
        console.warn(`[anitabi-points] points ${id} failed:`, (err as Error).message);
        return null;
      }
      await delay(500 * attempt);
    }
  }
  return null;
}

// ---------- main ----------

async function main(): Promise<void> {
  const l2 = await loadL2();
  if (!l2 || !Array.isArray(l2.entries) || l2.entries.length === 0) {
    throw new Error('L2 anitabi-index unavailable or empty — refusing to build points over zero seeds');
  }

  const seeds = l2.entries;
  const topIds = new Set(topBangumiIdsByPoints(seeds, TOP_N));
  console.log(`[anitabi-points] ${seeds.length} seeds, top-${TOP_N} snapshot targets: ${topIds.size}`);

  const spots: SpotEntry[] = [];
  const byBangumiId: Record<string, RawPoint[]> = {};
  let fetched = 0;
  let skipped = 0;

  for (let i = 0; i < seeds.length; i++) {
    const id = seeds[i].id;
    const raw = await fetchPoints(id); // throws WafBlockedError → aborts main()
    if (raw === null) {
      skipped++;
    } else {
      fetched++;
      for (const p of raw) {
        const entry = spotEntryFromRawPoint(p, id);
        if (entry) spots.push(entry);
      }
      if (topIds.has(id)) byBangumiId[String(id)] = raw;
    }
    if ((i + 1) % 50 === 0) {
      console.log(`[anitabi-points] ${i + 1}/${seeds.length} (spots so far: ${spots.length})`);
    }
    await delay(DELAY_MS);
  }

  if (spots.length === 0) {
    throw new Error('Produced 0 spots — refusing to write an empty spots index');
  }

  const now = Date.now();
  const spotsDoc = {
    $schema: SPOTS_SCHEMA_URL,
    generatedAt: now,
    source: 'scripts/build-anitabi-points.ts',
    count: spots.length,
    spots,
  };
  const topDoc = {
    $schema: TOP_SCHEMA_URL,
    generatedAt: now,
    source: 'scripts/build-anitabi-points.ts',
    topN: TOP_N,
    byBangumiId,
  };

  writeFileSync(resolve(process.cwd(), SPOTS_OUTPUT), JSON.stringify(spotsDoc), 'utf8');
  writeFileSync(resolve(process.cwd(), TOP_OUTPUT), JSON.stringify(topDoc), 'utf8');

  console.log(
    `[anitabi-points] wrote ${spots.length} spots → ${SPOTS_OUTPUT}\n` +
      `[anitabi-points] wrote ${Object.keys(byBangumiId).length} anime snapshots → ${TOP_OUTPUT}\n` +
      `  fetched: ${fetched}  skipped(404/err): ${skipped}`
  );
}

main().catch((err: unknown) => {
  if (err instanceof WafBlockedError) {
    console.error('[anitabi-points] ABORT: anitabi WAF returned 403 — pipeline egress blocked.', err.message);
    process.exit(1);
  }
  console.error('[anitabi-points] FATAL', err);
  process.exit(1);
});
```

- [ ] **Step 3: package.json 加 script**（在 `scripts` 物件內，接在 `build:anitabi-cross-index` 之後）

```json
    "build:anitabi-points": "bun scripts/build-anitabi-points.ts",
```

- [ ] **Step 4: README.md 加一節**（放在「Anitabi Index」節之後，比照其格式）

```md
## Anitabi Spots Index + Points Top Snapshot

Point-level companions to the Anitabi Index, built by enumerating
`GET /bangumi/{id}/points` over every id in the index.

**Stable consumption URLs**:

```
https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-spots-index/anitabi-spots-index.json
https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-points-top/anitabi-points-top.json
```

- `anitabi-spots-index.json` — flat global index of individual scene points
  (`{ id, b, lat, lng, n, c, img }`), one row per real-world cut with valid geo
  and a scene image. Schema: [`schemas/anitabi-spots-index.schema.json`](./schemas/anitabi-spots-index.schema.json).
- `anitabi-points-top.json` — raw `/points` payloads for the top-100 anime by
  point count, for offline seeding. Schema: [`schemas/anitabi-points-top.schema.json`](./schemas/anitabi-points-top.schema.json).

Dated snapshots: `anitabi-spots-index-YYYY-WW` / `anitabi-points-top-YYYY-WW`.
The 8 most recent of each are retained. Built daily at 03:50 UTC (20 min after
the index) by `build-anitabi-points`.

If `api.anitabi.cn` starts returning HTTP 403 (Cloudflare WAF), the build aborts
and the workflow fails on purpose — a visible signal that pipeline egress is
blocked (see the UX-overhaul spec §5).
```

- [ ] **Step 5: 本地跑一次驗證產出**（不需上線 release，用一個小 L2 子集）

Run（在 `Aniseekr-source`，若本地有 `anitabi-index.json` 就直接用；否則從 alias 抓一份小的或手造一個 2-id 的假 index）：

```bash
# 用既有 alias 的完整 index 太久，可手造一個 2-id 測試 index：
printf '%s' '{"generatedAt":0,"source":"test","entries":[{"id":115908,"pointsLength":577},{"id":927,"pointsLength":300}]}' > anitabi-index.json
ANITABI_INDEX_PATH=./anitabi-index.json bun scripts/build-anitabi-points.ts
node -e "const s=require('./anitabi-spots-index.json'),t=require('./anitabi-points-top.json'); console.log('spots:', s.count, 'topAnime:', Object.keys(t.byBangumiId).length)"
```

Expected: 產出 `anitabi-spots-index.json`（`count` > 0）與 `anitabi-points-top.json`（`byBangumiId` 有 1-2 個 key）。**若 anitabi 回 403 → script exit 1**（這就是探測器，記錄到 spec §5）。若成功，`git checkout -- anitabi-index.json` 或刪掉這些本地產物（它們是 workflow artifact，不進 git；確認 `.gitignore` 已排除 `*.json` 產物或手動不 add）。

- [ ] **Step 6: Commit**

```bash
git add scripts/build-anitabi-points.ts schemas/anitabi-spots-index.schema.json schemas/anitabi-points-top.schema.json package.json README.md
git commit -m "feat(anitabi-points): build script emitting flat spots index + top-100 points snapshot"
```

---

### Task 3: pipeline GitHub Actions workflow

**Files:**
- Create: `.github/workflows/build-anitabi-points.yml`

**Interfaces:**
- Consumes: L2 `anitabi-index` alias release（script 內部下載）。
- Produces: 兩組 release（`anitabi-spots-index` + dated、`anitabi-points-top` + dated），alias `--clobber` 每日更新，prune 留 8 份。

- [ ] **Step 1: 建 workflow**（複製 `build-anitabi-index.yml` 的模式，改成一個 job 產兩檔、傳兩組 release，cron 03:50）

```yaml
name: Build Anitabi Points

# Builds the point-level artifacts (anitabi-spots-index.json + anitabi-points-top.json)
# by enumerating GET /bangumi/{id}/points over the anitabi-index. Publishes each
# artifact via a dated weekly snapshot release + a fixed alias release
# (--clobber'd every run so the client URLs stay stable). Latest 8 dated
# snapshots of each are retained.
#
# Runs 20 minutes after build-anitabi-index (which the script downloads as its
# L2 seed), so the index is fresh before the points crawl starts.

on:
  schedule:
    - cron: '50 3 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v5

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Build anitabi points artifacts
        env:
          ANITABI_DELAY_MS: '120'
        timeout-minutes: 30
        run: bun scripts/build-anitabi-points.ts

      - name: Verify outputs exist
        run: |
          test -s anitabi-spots-index.json
          test -s anitabi-points-top.json
          node -e "const s=require('./anitabi-spots-index.json'); console.log('spots:', s.count);"
          node -e "const t=require('./anitabi-points-top.json'); console.log('topAnime:', Object.keys(t.byBangumiId).length);"

      - name: Publish spots index (weekly + alias)
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          DATED_TAG="anitabi-spots-index-$(date -u +%Y-%V)"
          ALIAS_TAG="anitabi-spots-index"
          if ! gh release view "$DATED_TAG" >/dev/null 2>&1; then
            gh release create "$DATED_TAG" \
              --title "Anitabi Spots Index ($DATED_TAG)" \
              --notes "Weekly snapshot of the flat point-level pilgrimage index. Auto-published by build-anitabi-points." \
              --target main
          fi
          gh release upload "$DATED_TAG" anitabi-spots-index.json --clobber
          if ! gh release view "$ALIAS_TAG" >/dev/null 2>&1; then
            gh release create "$ALIAS_TAG" \
              --title "Anitabi Spots Index (latest)" \
              --notes "Always points to the most recent weekly build. Client URL is stable." \
              --target main
          fi
          gh release upload "$ALIAS_TAG" anitabi-spots-index.json --clobber

      - name: Publish points-top snapshot (weekly + alias)
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          DATED_TAG="anitabi-points-top-$(date -u +%Y-%V)"
          ALIAS_TAG="anitabi-points-top"
          if ! gh release view "$DATED_TAG" >/dev/null 2>&1; then
            gh release create "$DATED_TAG" \
              --title "Anitabi Points Top ($DATED_TAG)" \
              --notes "Weekly raw /points snapshot for the top-100 anime by point count. Auto-published by build-anitabi-points." \
              --target main
          fi
          gh release upload "$DATED_TAG" anitabi-points-top.json --clobber
          if ! gh release view "$ALIAS_TAG" >/dev/null 2>&1; then
            gh release create "$ALIAS_TAG" \
              --title "Anitabi Points Top (latest)" \
              --notes "Always points to the most recent weekly build. Client URL is stable." \
              --target main
          fi
          gh release upload "$ALIAS_TAG" anitabi-points-top.json --clobber

      - name: Prune old weekly releases (keep last 8 of each)
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          for PREFIX in anitabi-spots-index anitabi-points-top; do
            mapfile -t OLD < <(
              gh release list --limit 200 --json tagName --jq '.[].tagName' \
                | grep -E "^${PREFIX}-[0-9]{4}-[0-9]{2}$" \
                | sort -r \
                | tail -n +9
            )
            for TAG in "${OLD[@]}"; do
              echo "Pruning $TAG"
              gh release delete "$TAG" --yes --cleanup-tag
            done
          done
```

- [ ] **Step 2: 靜態檢查**（本地無法跑 Actions；確認 YAML 合法 + tag/prefix 一致）

Run: `bun -e "const y=require('fs').readFileSync('.github/workflows/build-anitabi-points.yml','utf8'); if(!y.includes('anitabi-spots-index')||!y.includes('anitabi-points-top')) throw new Error('missing tags'); console.log('ok')"`
Expected: `ok`。（真正驗收是首次 `workflow_dispatch` 手動觸發後兩組 release 出現——記錄在 PR 描述，不阻塞本 plan。）

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-anitabi-points.yml
git commit -m "ci(anitabi-points): daily workflow publishing spots-index + points-top releases"
```

---

# 第二部分：App（`/Users/kidney/Workspace/Work/ani/aniseekr`）

> 這些 task 在 **aniseekr** repo，用 `bun run test:unit` / `bun test --preload ./test-setup.ts <file>`。**先確認 P0/P1 已合併**（Deltas #1）。App 端所有 release 下載都容忍 404（release 尚未上線時維持現狀）。

---

### Task 4: SQLite `anitabi_spots` 表 + 純空間 helpers（先寫可測的核心）

**Files:**
- Create: `libs/services/pilgrimage/spot-index.ts`（純 helpers + 型別）
- Modify: `libs/db.ts`（DDL 加表 + `LocalDB` 加 4 個方法）
- Test: `__tests__/unit/pilgrimage/spot-index.test.ts`

**Interfaces:**
- Produces（`spot-index.ts`）：
  - `interface SpotIndexRow { pointId: string; bangumiId: number; lat: number; lng: number; name: string; cn: string; image: string; }`
  - `interface NearbySpotHit extends SpotIndexRow { distanceKm: number }`
  - `interface LatLngBox { minLat: number; maxLat: number; minLng: number; maxLng: number }`
  - `boundsForRadius(lat: number, lng: number, radiusKm: number): LatLngBox`
  - `haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number`
  - `rankSpotsByDistance(candidates: readonly SpotIndexRow[], userLat: number, userLng: number, radiusKm: number, limit: number): NearbySpotHit[]`
- Produces（`libs/db.ts` `LocalDB`）：
  - `hydrateAnitabiSpots(rows: readonly SpotIndexRow[]): Promise<number>` — 整表換新（DELETE + 分批 INSERT）。
  - `queryAnitabiSpotsByBox(box: LatLngBox): Promise<SpotIndexRow[]>` — lat/lng BETWEEN 粗篩。
  - `queryAnitabiSpotsInBounds(bbox: { north: number; south: number; east: number; west: number }, limit: number): Promise<SpotIndexRow[]>`
  - `getAnitabiSpotCount(): Promise<number>`

- [ ] **Step 1: 寫 failing tests**（`spot-index.test.ts`，純函式）

```ts
import { describe, expect, test } from 'bun:test';
import {
  boundsForRadius,
  haversineKm,
  rankSpotsByDistance,
  type SpotIndexRow,
} from '../../../libs/services/pilgrimage/spot-index';

function row(pointId: string, lat: number, lng: number, bangumiId = 1): SpotIndexRow {
  return { pointId, bangumiId, lat, lng, name: pointId, cn: '', image: `/i/${pointId}.jpg` };
}

describe('boundsForRadius', () => {
  test('a 111km radius is ~1° of latitude', () => {
    const box = boundsForRadius(35, 139, 111);
    expect(box.maxLat - 35).toBeCloseTo(1, 1);
    expect(35 - box.minLat).toBeCloseTo(1, 1);
  });
  test('longitude degrees widen with latitude (÷cos lat)', () => {
    const box = boundsForRadius(60, 0, 111);
    // cos(60°)=0.5 ⇒ ~2° of longitude per 111km.
    expect(box.maxLng - 0).toBeCloseTo(2, 0);
  });
});

describe('haversineKm', () => {
  test('one degree of latitude is ~111km', () => {
    expect(haversineKm(35, 139, 36, 139)).toBeCloseTo(111, 0);
  });
});

describe('rankSpotsByDistance', () => {
  test('filters beyond the radius, sorts nearest-first, caps at limit', () => {
    const candidates = [
      row('far', 36, 139), // ~111km away
      row('near', 35.01, 139), // ~1.1km
      row('mid', 35.1, 139), // ~11km
    ];
    const out = rankSpotsByDistance(candidates, 35, 139, 30, 10);
    expect(out.map((s) => s.pointId)).toEqual(['near', 'mid']); // 'far' dropped
    expect(out[0].distanceKm).toBeLessThan(out[1].distanceKm);
    expect(out[0]).toHaveProperty('distanceKm');
  });
  test('respects the limit', () => {
    const candidates = [row('a', 35.001, 139), row('b', 35.002, 139), row('c', 35.003, 139)];
    expect(rankSpotsByDistance(candidates, 35, 139, 30, 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-index.test.ts` Expected: FAIL — Cannot find module。

- [ ] **Step 3: 實作 `libs/services/pilgrimage/spot-index.ts`**

```ts
// Pure spatial helpers for the point-level anitabi spots index. The SQLite lat/
// lng BETWEEN prefilter (in libs/db.ts) is a coarse box; this module turns a
// (lat,lng,radiusKm) into that box and does the exact haversine ranking in JS.
// Kept pure + separate so the distance math is unit-tested without SQLite.

export interface SpotIndexRow {
  /** anitabi point id (PRIMARY KEY in the anitabi_spots table). */
  pointId: string;
  bangumiId: number;
  lat: number;
  lng: number;
  /** Original-language name. */
  name: string;
  /** Chinese name; '' when absent. */
  cn: string;
  /** Scene image exactly as anitabi stores it (host-relative); normalized on read. */
  image: string;
}

export interface NearbySpotHit extends SpotIndexRow {
  /** Great-circle distance from the query point, kilometres. */
  distanceKm: number;
}

export interface LatLngBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const KM_PER_DEG_LAT = 111;
const EARTH_RADIUS_KM = 6371;

/**
 * Bounding box that fully contains a `radiusKm` circle around (lat,lng). Used as
 * the SQLite prefilter; the caller then filters exactly by haversine. Longitude
 * degrees are divided by cos(lat) because meridians converge toward the poles.
 */
export function boundsForRadius(lat: number, lng: number, radiusKm: number): LatLngBox {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const dLng = radiusKm / (KM_PER_DEG_LAT * cos);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rankSpotsByDistance(
  candidates: readonly SpotIndexRow[],
  userLat: number,
  userLng: number,
  radiusKm: number,
  limit: number
): NearbySpotHit[] {
  const hits: NearbySpotHit[] = [];
  for (const c of candidates) {
    const distanceKm = haversineKm(userLat, userLng, c.lat, c.lng);
    if (distanceKm > radiusKm) continue;
    hits.push({ ...c, distanceKm });
  }
  hits.sort((a, b) => a.distanceKm - b.distanceKm);
  return limit > 0 ? hits.slice(0, limit) : hits;
}
```

- [ ] **Step 4: `libs/db.ts` DDL 加表**（在 `DDL` 模板字串內，接在 `genre_cover_overrides` 表之後、`` ` `` 結尾之前）

```sql
      CREATE TABLE IF NOT EXISTS anitabi_spots (
        point_id TEXT PRIMARY KEY NOT NULL,
        bangumi_id INTEGER NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        name TEXT,
        cn TEXT,
        image TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_anitabi_spots_lat ON anitabi_spots(lat);
```

- [ ] **Step 5: `libs/db.ts` 加 import + 4 個方法**

檔頭 import 區加：

```ts
import type { SpotIndexRow, LatLngBox } from './services/pilgrimage/spot-index';
```

`LocalDB` 物件內（接在 `cleanExpiredPilgrimage` 之後、結尾 `};` 之前）加：

```ts
  /**
   * Replace the entire anitabi_spots table with a fresh hydration payload.
   * One transaction, chunked multi-row INSERTs (500 rows/statement) so a ~50k
   * row swap doesn't trip expo-sqlite's variable limit or the "database is
   * locked" path. Returns the number of rows written.
   */
  async hydrateAnitabiSpots(rows: readonly SpotIndexRow[]): Promise<number> {
    const db = await openDb();
    const CHUNK = 500;
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM anitabi_spots');
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        if (chunk.length === 0) continue;
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
        const args: unknown[] = [];
        for (const r of chunk) {
          args.push(r.pointId, r.bangumiId, r.lat, r.lng, r.name, r.cn, r.image);
        }
        await db.runAsync(
          `INSERT OR REPLACE INTO anitabi_spots
             (point_id, bangumi_id, lat, lng, name, cn, image) VALUES ${placeholders}`,
          ...args
        );
      }
    });
    return rows.length;
  },

  /** Coarse box prefilter (lat + lng BETWEEN). Caller ranks exactly by haversine. */
  async queryAnitabiSpotsByBox(box: LatLngBox): Promise<SpotIndexRow[]> {
    const db = await openDb();
    const rows = await db.getAllAsync<{
      point_id: string;
      bangumi_id: number;
      lat: number;
      lng: number;
      name: string | null;
      cn: string | null;
      image: string | null;
    }>(
      `SELECT point_id, bangumi_id, lat, lng, name, cn, image FROM anitabi_spots
        WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
      box.minLat,
      box.maxLat,
      box.minLng,
      box.maxLng
    );
    return (rows ?? []).map((r) => ({
      pointId: r.point_id,
      bangumiId: r.bangumi_id,
      lat: r.lat,
      lng: r.lng,
      name: r.name ?? '',
      cn: r.cn ?? '',
      image: r.image ?? '',
    }));
  },

  /** Spots inside a map bounding box, capped. Antimeridian-crossing boxes are
   *  rare for pilgrimage data (all in one hemisphere) — not handled. */
  async queryAnitabiSpotsInBounds(
    bbox: { north: number; south: number; east: number; west: number },
    limit: number
  ): Promise<SpotIndexRow[]> {
    return this.queryAnitabiSpotsByBox({
      minLat: bbox.south,
      maxLat: bbox.north,
      minLng: bbox.west,
      maxLng: bbox.east,
    }).then((rows) => (limit > 0 ? rows.slice(0, limit) : rows));
  },

  async getAnitabiSpotCount(): Promise<number> {
    const db = await openDb();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM anitabi_spots'
    );
    return row?.count ?? 0;
  },
```

- [ ] **Step 6: 確認 pass + 型別**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-index.test.ts && bunx tsc --noEmit`
Expected: 純函式 test 全 PASS；tsc 僅剩 2 個既存 `global.css` 錯。（LocalDB 的 SQL 方法是 thin glue，隨 Task 7 的 `getSpotsNear` 整合驗證，此處只保證編譯。）

- [ ] **Step 7: Commit**

```bash
git add libs/services/pilgrimage/spot-index.ts libs/db.ts __tests__/unit/pilgrimage/spot-index.test.ts
git commit -m "feat(pilgrimage): anitabi_spots SQLite table + pure radius/haversine spot helpers"
```

---

### Task 5: 景點索引下載 + hydrate service（404 容忍）+ 開機接線

**Files:**
- Create: `libs/services/pilgrimage/spot-index-data-service.ts`
- Modify: `app/_layout.tsx`（開機背景 hydrate）

**Interfaces:**
- Consumes: `LocalDB.hydrateAnitabiSpots`、`LocalDB.getAnitabiSpotCount`（Task 4）；`SpotIndexRow`（Task 4）。
- Produces: `hydrateSpotIndex(): Promise<void>` — 下載 alias release（404→跳過不 crash）、7 天新鮮度、灌進 SQLite。

- [ ] **Step 1: 實作 `spot-index-data-service.ts`**（複製 `anitabi-data-service.ts:22-124` 的 FsLike/loadFile 404 容忍模式；這是 I/O glue，比照既有 `anitabi-data-service`（該檔無單元測試）——本 task 的驗收是 `tsc` + Task 7/8 的整合走查，不寫脆弱的 FS-mock 測試）

```ts
// Runtime hydration for the point-level anitabi spots index (Aniseekr-source
// `anitabi-spots-index` release). Mirrors anitabi-data-service.ts: read the
// cached file if fresh (7d), else download the alias asset, then swap the
// SQLite anitabi_spots table. 404-tolerant — when the release isn't published
// yet the download returns null and the app keeps working off the anime-centre
// index (no spot-level nearby, honest empty states) instead of crashing.

import * as FileSystem from 'expo-file-system/legacy';
import { LocalDB } from '../../db';
import type { SpotIndexRow } from './spot-index';

interface SpotEntry {
  id: string;
  b: number;
  lat: number;
  lng: number;
  n: string;
  c: string;
  img: string;
}
interface SpotsIndexFile {
  generatedAt: number;
  source: string;
  count?: number;
  spots: SpotEntry[];
}

const SPOTS_INDEX_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-spots-index/anitabi-spots-index.json';
const SPOTS_INDEX_FILENAME = 'anitabi-spots-index.runtime.json';
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
  return dir ? dir + filename : null;
}

async function isFresh(path: string): Promise<boolean> {
  try {
    const info = await fs.getInfoAsync(path);
    if (!info.exists) return false;
    const mtimeSec = info.modificationTime ?? 0;
    if (mtimeSec <= 0) return false;
    return Date.now() - mtimeSec * 1000 < FRESHNESS_WINDOW_MS;
  } catch {
    return false;
  }
}

async function loadFile(): Promise<SpotsIndexFile | null> {
  const path = cachePath(SPOTS_INDEX_FILENAME);
  if (!path) return null;
  if (await isFresh(path)) {
    try {
      return JSON.parse(await fs.readAsStringAsync(path)) as SpotsIndexFile;
    } catch {
      // fall through to a fresh download
    }
  }
  try {
    const res = await fs.downloadAsync(SPOTS_INDEX_URL, path);
    if (res.status !== 200) {
      // 404 = release not published yet; anything else = transient. Either way
      // keep the current SQLite table and skip this cycle.
      console.warn(`[spot-index] download → ${res.status} (keeping existing spots)`);
      return null;
    }
    return JSON.parse(await fs.readAsStringAsync(path)) as SpotsIndexFile;
  } catch (err) {
    console.warn('[spot-index] fetch failed:', err);
    return null;
  }
}

/**
 * Download + hydrate the spots index into SQLite. Safe to call on every cold
 * launch; short-circuits when the device copy is still fresh AND already
 * hydrated. Failures are swallowed — the anime-centre index remains the
 * fallback for nearby.
 */
export async function hydrateSpotIndex(): Promise<void> {
  const file = await loadFile();
  if (!file || !Array.isArray(file.spots) || file.spots.length === 0) return;
  const rows: SpotIndexRow[] = file.spots.map((s) => ({
    pointId: s.id,
    bangumiId: s.b,
    lat: s.lat,
    lng: s.lng,
    name: s.n,
    cn: s.c,
    image: s.img,
  }));
  try {
    const written = await LocalDB.hydrateAnitabiSpots(rows);
    console.log(`[spot-index] hydrated ${written} spots into SQLite`);
  } catch (err) {
    console.warn('[spot-index] SQLite hydrate failed:', err);
  }
}
```

- [ ] **Step 2: `app/_layout.tsx` 開機背景 hydrate**

檔頭 import 區（接在 `hydrateAllPilgrimageData` import 之後）：

```ts
import { hydrateSpotIndex } from '../libs/services/pilgrimage/spot-index-data-service';
```

`:104` `void hydrateAllPilgrimageData()...` 那行**之後**加：

```ts
      void hydrateSpotIndex().catch((e) => console.warn('[hydrateSpotIndex]', e));
```

- [ ] **Step 3: 驗證** → Run: `bun run test:unit && bunx tsc --noEmit` Expected: 全綠（無新 tsc 錯）。

- [ ] **Step 4: Commit**

```bash
git add libs/services/pilgrimage/spot-index-data-service.ts 'app/_layout.tsx'
git commit -m "feat(pilgrimage): download + hydrate the point-level spots index into SQLite (404-tolerant)"
```

---

### Task 6: 熱門動漫點資料快照 hydration（spec 0.5）+ 開機接線

**Files:**
- Modify: `libs/services/pilgrimage/anitabi-service.ts`（export `DETAIL_CACHE_KEY_PREFIX`）
- Modify: `libs/services/pilgrimage/spot-index-data-service.ts`（加 `hydratePointsTop`）
- Modify: `app/_layout.tsx`（開機背景第二段 hydrate）
- Test: `__tests__/unit/pilgrimage/points-top-seed.test.ts`（純決策函式）

**Interfaces:**
- Consumes: `normalizeRawPoints(raw, bangumiId)`（`anitabi-points.ts:29`）；`CacheService.get`/`.set`（`cache-service.ts:112,179`）；`PILGRIMAGE_TTL_MS`（`anitabi-service.ts:16`，已 export）；`DETAIL_CACHE_KEY_PREFIX`（本 task 新 export，值 `'anitabi_points_v2_'`）。
- Produces:
  - `spotsToSeed(byBangumiId: Record<string, unknown[]>, isCached: (bangumiId: number) => boolean): number[]`（純；回傳「快取尚無、需要 seed」的 bangumiId 清單）。
  - `hydratePointsTop(): Promise<void>`（I/O glue）。

- [ ] **Step 1: 寫 failing test**（`points-top-seed.test.ts`）

```ts
import { describe, expect, test } from 'bun:test';
import { spotsToSeed } from '../../../libs/services/pilgrimage/spot-index-data-service';

describe('spotsToSeed', () => {
  test('returns only ids that are not already cached and have a non-empty array', () => {
    const byBangumiId = {
      '10': [{ id: 'a' }],
      '20': [], // empty payload → skip
      '30': [{ id: 'b' }],
    };
    const cached = new Set([10]);
    expect(spotsToSeed(byBangumiId, (id) => cached.has(id))).toEqual([30]);
  });
  test('ignores non-numeric keys', () => {
    expect(spotsToSeed({ x: [{ id: 'a' }] }, () => false)).toEqual([]);
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/points-top-seed.test.ts` Expected: FAIL — export 不存在。

- [ ] **Step 3: export cache key prefix**（`anitabi-service.ts:32`）

把 `const DETAIL_CACHE_KEY_PREFIX = 'anitabi_points_v2_';` 改成：

```ts
export const DETAIL_CACHE_KEY_PREFIX = 'anitabi_points_v2_';
```

- [ ] **Step 4: `spot-index-data-service.ts` 加快照 hydration**

檔頭 import 加：

```ts
import { CacheService } from '../cache-service';
import { normalizeRawPoints } from './anitabi-points';
import { DETAIL_CACHE_KEY_PREFIX, PILGRIMAGE_TTL_MS } from './anitabi-service';
import type { RawAnitabiPoint } from './types';
```

檔案底部加：

```ts
interface PointsTopFile {
  generatedAt: number;
  source: string;
  topN?: number;
  byBangumiId: Record<string, RawAnitabiPoint[]>;
}

const POINTS_TOP_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-points-top/anitabi-points-top.json';
const POINTS_TOP_FILENAME = 'anitabi-points-top.runtime.json';

/** Pure: which top-snapshot ids still need seeding (not cached, non-empty payload). */
export function spotsToSeed(
  byBangumiId: Record<string, readonly unknown[]>,
  isCached: (bangumiId: number) => boolean
): number[] {
  const out: number[] = [];
  for (const [key, arr] of Object.entries(byBangumiId)) {
    const id = Number(key);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!Array.isArray(arr) || arr.length === 0) continue;
    if (isCached(id)) continue;
    out.push(id);
  }
  return out;
}

async function loadPointsTopFile(): Promise<PointsTopFile | null> {
  const path = cachePath(POINTS_TOP_FILENAME);
  if (!path) return null;
  if (await isFresh(path)) {
    try {
      return JSON.parse(await fs.readAsStringAsync(path)) as PointsTopFile;
    } catch {
      // fall through
    }
  }
  try {
    const res = await fs.downloadAsync(POINTS_TOP_URL, path);
    if (res.status !== 200) {
      console.warn(`[points-top] download → ${res.status} (skipping seed)`);
      return null;
    }
    return JSON.parse(await fs.readAsStringAsync(path)) as PointsTopFile;
  } catch (err) {
    console.warn('[points-top] fetch failed:', err);
    return null;
  }
}

/**
 * Seed the per-anime detail cache for the top-100 anime from the offline
 * snapshot, so opening a popular anime works offline on first launch. Runs in
 * the background after hydration and never overwrites a cache entry the device
 * already has (that one is at least as fresh). Normalizes with the SAME
 * normalizeRawPoints the live /points path uses, and writes under the SAME
 * DETAIL_CACHE_KEY_PREFIX + TTL, so P0's stale-if-error grace applies.
 */
export async function hydratePointsTop(): Promise<void> {
  const file = await loadPointsTopFile();
  if (!file || !file.byBangumiId) return;

  // Decide which ids to seed by probing the cache (miss ⇒ seed).
  const cachedIds = new Set<number>();
  await Promise.all(
    Object.keys(file.byBangumiId).map(async (key) => {
      const id = Number(key);
      if (!Number.isFinite(id) || id <= 0) return;
      const hit = await CacheService.get(DETAIL_CACHE_KEY_PREFIX + id);
      if (hit) cachedIds.add(id);
    })
  );

  const ids = spotsToSeed(file.byBangumiId, (id) => cachedIds.has(id));
  let seeded = 0;
  for (const id of ids) {
    const points = normalizeRawPoints(file.byBangumiId[String(id)], id);
    if (points.length === 0) continue;
    try {
      await CacheService.set(DETAIL_CACHE_KEY_PREFIX + id, points, PILGRIMAGE_TTL_MS);
      seeded++;
    } catch (err) {
      console.warn('[points-top] seed write failed for', id, err);
    }
  }
  if (seeded > 0) console.log(`[points-top] seeded ${seeded} anime detail caches offline`);
}
```

- [ ] **Step 5: `app/_layout.tsx` 開機接線**（接在 Task 5 的 `hydrateSpotIndex` 那行之後；points-top 依賴網路但獨立，背景跑不阻塞）

檔頭 import 改為同時引入：

```ts
import { hydrateSpotIndex, hydratePointsTop } from '../libs/services/pilgrimage/spot-index-data-service';
```

`hydrateSpotIndex(...)` 那行之後加：

```ts
      void hydratePointsTop().catch((e) => console.warn('[hydratePointsTop]', e));
```

- [ ] **Step 6: 確認 pass** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/points-top-seed.test.ts && bunx tsc --noEmit` Expected: PASS + 無新 tsc 錯。

- [ ] **Step 7: Commit**

```bash
git add libs/services/pilgrimage/anitabi-service.ts libs/services/pilgrimage/spot-index-data-service.ts 'app/_layout.tsx' __tests__/unit/pilgrimage/points-top-seed.test.ts
git commit -m "feat(pilgrimage): seed top-100 anime detail cache offline from the points-top snapshot"
```

---

### Task 7: `getSpotsNear` service + 復活 `nearby-spots` 純建構（景點級 nearby）

**Files:**
- Create: `libs/services/pilgrimage/spot-index-service.ts`
- Modify: `libs/services/pilgrimage/nearby-spots.ts`（新增 `buildNearbySpotsFromIndex`，不動既有 `buildNearbySpots`）
- Test: `__tests__/unit/pilgrimage/spot-index-service.test.ts`、追加到 `__tests__/unit/pilgrimage/nearby-spots.test.ts`

**Interfaces:**
- Consumes: `boundsForRadius`/`rankSpotsByDistance`/`SpotIndexRow`/`NearbySpotHit`（Task 4）；`LocalDB.queryAnitabiSpotsByBox`/`queryAnitabiSpotsInBounds`（Task 4）；`normalizeAnitabiImageUrl(url, bangumiId)`（`anitabi-image.ts:16`）；`NearbySpot`（`nearby-spots.ts:13`）；`LatLng`（`location-service`，`{latitude, longitude}`）。
- Produces:
  - `getSpotsNear(userLocation, radiusKm, limit, deps?): Promise<NearbySpotHit[]>` — deps 有 `queryBox?` 供測試注入。
  - `getSpotsInBounds(bbox, limit, deps?): Promise<SpotIndexRow[]>`
  - `buildNearbySpotsFromIndex(hits, lookup, collectionIds): NearbySpot[]` — 收藏優先、否則距離；圖片正規化為絕對 URL。

- [ ] **Step 1: 寫 failing tests**

`spot-index-service.test.ts`：

```ts
import { describe, expect, test } from 'bun:test';
import { getSpotsNear } from '../../../libs/services/pilgrimage/spot-index-service';
import type { SpotIndexRow } from '../../../libs/services/pilgrimage/spot-index';

const rows: SpotIndexRow[] = [
  { pointId: 'near', bangumiId: 1, lat: 35.01, lng: 139, name: 'A', cn: '', image: '/a.jpg' },
  { pointId: 'far', bangumiId: 2, lat: 36, lng: 139, name: 'B', cn: '', image: '/b.jpg' },
];

test('getSpotsNear prefilters via queryBox then ranks by haversine', async () => {
  const out = await getSpotsNear(
    { latitude: 35, longitude: 139 },
    30,
    10,
    { queryBox: async () => rows }
  );
  expect(out.map((s) => s.pointId)).toEqual(['near']); // 'far' ~111km dropped
  expect(out[0].distanceKm).toBeGreaterThan(0);
});
```

追加到 `nearby-spots.test.ts`（沿用檔內既有 import 風格）：

```ts
import { buildNearbySpotsFromIndex } from '../../../libs/services/pilgrimage/nearby-spots';
import type { NearbySpotHit } from '../../../libs/services/pilgrimage/spot-index';

describe('buildNearbySpotsFromIndex', () => {
  const hits: NearbySpotHit[] = [
    { pointId: 'p1', bangumiId: 1, lat: 35, lng: 139, name: '駅前', cn: '车站前', image: '/images/points/1/p1.jpg', distanceKm: 5 },
    { pointId: 'p2', bangumiId: 2, lat: 35, lng: 139, name: 'Shrine', cn: '', image: '/images/points/2/p2.jpg', distanceKm: 1 },
  ];
  const lookup = (id: number) =>
    id === 1
      ? { title: 'Anime One', cn: '动画一', color: '#111111' }
      : id === 2
        ? { title: 'Anime Two', cn: '', color: '' }
        : null;

  it('normalizes image to an absolute CDN url and prefers cn name', () => {
    const out = buildNearbySpotsFromIndex(hits, lookup, new Set());
    const p1 = out.find((s) => s.id === 'p1')!;
    expect(p1.image).toBe('https://image.anitabi.cn/points/1/p1.jpg?plan=h160');
    expect(p1.name).toBe('车站前');
    expect(p1.animeTitle).toBe('动画一');
    expect(p1.markerId).toBe('1:p1');
  });

  it('sorts collection anime first, then by distance', () => {
    const out = buildNearbySpotsFromIndex(hits, lookup, new Set([1]));
    // bangumi 1 is in the collection so it leads despite being farther (5km > 1km).
    expect(out.map((s) => s.id)).toEqual(['p1', 'p2']);
  });

  it('without collection, sorts purely by distance', () => {
    const out = buildNearbySpotsFromIndex(hits, lookup, new Set());
    expect(out.map((s) => s.id)).toEqual(['p2', 'p1']);
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-index-service.test.ts __tests__/unit/pilgrimage/nearby-spots.test.ts` Expected: 新 test FAIL（export 不存在）。

- [ ] **Step 3: 實作 `spot-index-service.ts`**

```ts
// Thin service over the anitabi_spots SQLite table: turns a user location +
// radius into a distance-ranked list of point-level spots. The db access is
// injectable (deps.queryBox) so getSpotsNear is unit-testable without SQLite.

import { LocalDB } from '../../db';
import type { LatLng } from './location-service';
import {
  boundsForRadius,
  rankSpotsByDistance,
  type LatLngBox,
  type NearbySpotHit,
  type SpotIndexRow,
} from './spot-index';
import type { BoundingBox } from './anitabi-index';

export async function getSpotsNear(
  userLocation: LatLng,
  radiusKm: number,
  limit: number,
  deps: { queryBox?: (box: LatLngBox) => Promise<SpotIndexRow[]> } = {}
): Promise<NearbySpotHit[]> {
  const queryBox = deps.queryBox ?? ((box: LatLngBox) => LocalDB.queryAnitabiSpotsByBox(box));
  const box = boundsForRadius(userLocation.latitude, userLocation.longitude, radiusKm);
  const candidates = await queryBox(box);
  return rankSpotsByDistance(
    candidates,
    userLocation.latitude,
    userLocation.longitude,
    radiusKm,
    limit
  );
}

export async function getSpotsInBounds(
  bbox: BoundingBox,
  limit: number,
  deps: {
    queryBounds?: (b: BoundingBox, l: number) => Promise<SpotIndexRow[]>;
  } = {}
): Promise<SpotIndexRow[]> {
  const queryBounds =
    deps.queryBounds ?? ((b: BoundingBox, l: number) => LocalDB.queryAnitabiSpotsInBounds(b, l));
  return queryBounds(bbox, limit);
}

export async function getSpotIndexCount(): Promise<number> {
  return LocalDB.getAnitabiSpotCount();
}
```

- [ ] **Step 4: `nearby-spots.ts` 加 `buildNearbySpotsFromIndex`**

檔頭 import 加：

```ts
import { normalizeAnitabiImageUrl } from './anitabi-image';
import type { NearbySpotHit } from './spot-index';
```

檔案底部（`buildNearbySpots` 之後）加：

```ts
/**
 * Build {@link NearbySpot}s directly from point-level index hits (the SQLite
 * anitabi_spots query result), used by the global "sacred sites near me"
 * surfaces. Collection anime float to the top, then by distance. The stored
 * `image` is a host-relative anitabi path, so it is normalized to an absolute
 * CDN thumbnail here — SpotImage only renders absolute http(s) URLs.
 *
 * `ep`/`sceneCount` are not carried by the flat index (it's one row per point,
 * not grouped), so they are 0/1 — honest placeholders that render as
 * "no episode badge / single scene", never fabricated counts (Rule 8).
 */
export function buildNearbySpotsFromIndex(
  hits: readonly NearbySpotHit[],
  lookup: (bangumiId: number) => { title: string; cn: string; color: string } | null,
  collectionIds: ReadonlySet<number>
): NearbySpot[] {
  const out: NearbySpot[] = hits.map((h) => {
    const anime = lookup(h.bangumiId);
    return {
      id: h.pointId,
      markerId: `${h.bangumiId}:${h.pointId}`,
      name: h.cn || h.name,
      lat: h.lat,
      lng: h.lng,
      image: normalizeAnitabiImageUrl(h.image, h.bangumiId),
      ep: 0,
      sceneCount: 1,
      distanceKm: h.distanceKm,
      animeId: h.bangumiId,
      animeTitle: anime?.cn || anime?.title || '',
      ringColor: anime?.color || '',
    };
  });
  out.sort((a, b) => {
    const aCol = collectionIds.has(a.animeId) ? 0 : 1;
    const bCol = collectionIds.has(b.animeId) ? 0 : 1;
    if (aCol !== bCol) return aCol - bCol;
    return a.distanceKm - b.distanceKm;
  });
  return out;
}
```

- [ ] **Step 5: 確認 pass + 全綠**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-index-service.test.ts __tests__/unit/pilgrimage/nearby-spots.test.ts && bunx tsc --noEmit`
Expected: 全 PASS（既有 `buildNearbySpots` test 不受影響）。

- [ ] **Step 6: Commit**

```bash
git add libs/services/pilgrimage/spot-index-service.ts libs/services/pilgrimage/nearby-spots.ts __tests__/unit/pilgrimage/spot-index-service.test.ts __tests__/unit/pilgrimage/nearby-spots.test.ts
git commit -m "feat(pilgrimage): getSpotsNear service + collection-first nearby spot builder from the index"
```

---

### Task 8: hub「最近聖地」照片卡 hero（spec 2.4）

**Files:**
- Modify: `app/(tabs)/pilgrimage/index.tsx`（新增 nearest-spot 狀態 + 改寫 `NearbyHero` 807-856 假網格；`handleHeroPress` 516-526 focus 來源）
- Modify: `libs/i18n/locales/en.json`、`zh-Hant.json`（1 個 caps 標籤 key）
- （無新單元測試——純 UI/render glue；測過的單元是 Task 7 的 `getSpotsNear`/`buildNearbySpotsFromIndex`。驗收走模擬器 + `tsc`。）

**Interfaces:**
- Consumes: `getSpotsNear`（Task 7）；`getIndexedById`（`anitabi-index.ts:165`，同步）；`SpotImage`（P0，`components/pilgrimage/SpotImage`）；`formatKm`（index.tsx 內既有 helper）；`NearbySpotHit`（Task 4）。

- [ ] **Step 1: index.tsx 加 nearest-spot 載入**（在 `nearby` memo `:443-457` 之後、`featuredSpots` memo 之前）

檔頭 import 區加：

```ts
import { getSpotsNear } from '../../../libs/services/pilgrimage/spot-index-service';
import { getIndexedById } from '../../../libs/services/pilgrimage/anitabi-index';
import { SpotImage } from '../../../components/pilgrimage/SpotImage';
import type { NearbySpotHit } from '../../../libs/services/pilgrimage/spot-index';
```

`nearestAnime` 之後加狀態 + 載入（Rule 10：不阻塞首幀；location fix 後才查 SQLite）：

```ts
  // Nearest single point-level spot for the hero card (spec 2.4). Loaded lazily
  // off the SQLite spots index when a location fix lands; null when we have no
  // location or the index has nothing within 50km (honest empty state).
  const [nearestSpot, setNearestSpot] = useState<NearbySpotHit | null>(null);
  useEffect(() => {
    if (!userLocation) {
      setNearestSpot(null);
      return;
    }
    let active = true;
    getSpotsNear(userLocation, 50, 1)
      .then((hits) => {
        if (active) setNearestSpot(hits[0] ?? null);
      })
      .catch(() => {
        if (active) setNearestSpot(null);
      });
    return () => {
      active = false;
    };
  }, [userLocation]);

  const nearestSpotAnime = nearestSpot ? getIndexedById(nearestSpot.bangumiId) : null;
```

- [ ] **Step 2: 改 `handleHeroPress` focus 來源**（`:516-526`）

`const focus = nearestAnime?.anime.id ?? null;` 改成（優先景點所屬動漫）：

```ts
    const focus = nearestSpot?.bangumiId ?? nearestAnime?.anime.id ?? null;
```

依賴陣列 `[nearestAnime, router]` → `[nearestSpot, nearestAnime, router]`。

- [ ] **Step 3: 傳新 props 給 `NearbyHero`**（`:630-637`）

```tsx
          <NearbyHero
            theme={theme}
            nearestSpot={nearestSpot}
            nearestSpotAnimeName={
              nearestSpotAnime ? (nearestSpotAnime.cn || nearestSpotAnime.title) : null
            }
            nearestAnime={nearestAnime}
            nearbyCount={nearbyAnime.length}
            tierLabel={nearby.tierLabel}
            hasLocation={!!userLocation}
            onPress={handleHeroPress}
          />
```

- [ ] **Step 4: 改寫 `NearbyHero`**（`:765-898`）——用真的場景照片卡取代假網格 + 假衛星 pin

簽名（`:765-778`）改為：

```tsx
function NearbyHero({
  theme,
  nearestSpot,
  nearestSpotAnimeName,
  nearestAnime,
  nearbyCount,
  tierLabel,
  hasLocation,
  onPress,
}: {
  theme: ThemePalette;
  nearestSpot: NearbySpotHit | null;
  nearestSpotAnimeName: string | null;
  nearestAnime: AnimeCard | null;
  nearbyCount: number;
  tierLabel: string | null;
  hasLocation: boolean;
  onPress: () => void;
}) {
```

body（`:780-897` 整段）改為——景點圖走 `SpotImage`（誠實錯誤 tile）、正規化 URL 由 `buildNearbySpotsFromIndex`? 不需要：hero 直接對 `nearestSpot.image` 正規化。加 import `normalizeAnitabiImageUrl`（index.tsx 頂部）並改用它：

```tsx
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useT();
  const nearestTitles = nearestAnime ? getPilgrimageAnimeTitles(nearestAnime.anime) : null;
  const spotImageUri = nearestSpot
    ? normalizeAnitabiImageUrl(nearestSpot.image, nearestSpot.bangumiId)
    : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('tabs.pilgrimageScreen.hero.labelAccessibility')}
      style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.92 }]}>
      {spotImageUri ? (
        <SpotImage uri={spotImageUri} style={styles.heroCoverArt} contentFit="cover" />
      ) : (
        <View style={[styles.heroCoverArt, { backgroundColor: theme.background.tertiary }]} />
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
        style={styles.heroOverlay}
        pointerEvents="none"
      />
      <View style={styles.heroBody}>
        <View style={styles.heroLabelRow}>
          <View style={[styles.heroPinBadge, { backgroundColor: theme.background.tertiary }]}>
            <Ionicons name="location" size={11} color={theme.text.primary} />
          </View>
          <ThemedText variant="bodySmall" weight="700">
            {t('tabs.pilgrimageScreen.hero.nearestSpotCaps')}
          </ThemedText>
        </View>
        <ThemedText variant="captionSmall" tone="secondary" style={{ marginTop: 4 }}>
          {hasLocation
            ? nearestSpot
              ? t('tabs.pilgrimageScreen.hero.closestWithDistance', {
                  title: nearestSpot.cn || nearestSpot.name,
                  distance: formatKm(nearestSpot.distanceKm),
                })
              : nearestAnime
                ? t('tabs.pilgrimageScreen.hero.closest', { title: nearestTitles?.primary ?? '—' })
                : t('tabs.pilgrimageScreen.hero.noMappedAnime')
            : t('tabs.pilgrimageScreen.hero.withoutLocation')}
        </ThemedText>
        {hasLocation && nearestSpot && nearestSpotAnimeName ? (
          <ThemedText variant="captionSmall" tone="tertiary" style={{ marginTop: 2 }} numberOfLines={1}>
            {nearestSpotAnimeName}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
```

> 註：`heroGrid` / `gridLineV` / `gridLineH` / `roadPath` / `satPin` / `primaryPin` 這些**假網格 + 假衛星 pin** 樣式（`makeStyles` 內）連同上面刪掉的 JSX 一併移除（spec 2.4 明確要求取代假網格；它們純裝飾，非誠實資料，移除即可）。若移除樣式牽動其他呼叫點，`grep -n "gridLineV\|satPin\|primaryPin\|roadPath\|heroGrid" 'app/(tabs)/pilgrimage/index.tsx'` 確認只有 `NearbyHero` 用到再刪。頂部原本 `import { Image } from 'expo-image';` 若 hero 是唯一用到 `Image` 的地方（`:807` 是），改 import `SpotImage` 後 `Image` 變 unused → 一併刪掉那個 import（tsc 會抓 unused 若開啟；否則手動確認）。

- [ ] **Step 5: i18n**

`en.json` 的 `tabs.pilgrimageScreen.hero` 物件內加：

```json
"nearestSpotCaps": "Nearest sacred site"
```

`zh-Hant.json` 對應加：

```json
"nearestSpotCaps": "最近的聖地"
```

- [ ] **Step 6: 驗證** → Run: `bun run test:unit && bunx tsc --noEmit` Expected: PASS（i18n parity 含新 key）。模擬器（設定一個有 anitabi 海外/日本點的位置，Features > Location）：hero 顯示真實場景照片 + 景點名 + 距離 + 動漫名；無定位 → 顯示 `withoutLocation` 文案的純色卡（無假網格）；點擊 → 開地圖並 focus 該點所屬動漫。

- [ ] **Step 7: Commit**

```bash
git add 'app/(tabs)/pilgrimage/index.tsx' libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json
git commit -m "feat(pilgrimage): hub hero shows the nearest real spot photo + distance, not a fake map grid"
```

---

### Task 9: 地圖「附近景點」strip（spec 2.3，復活 NearbySpotsSheet row）

**Files:**
- Modify: `components/pilgrimage/NearbySpotsSheet.tsx`（export `NearbySpotRow` + `formatKm`；`NearbySpotRow` 內 `<Image>` 換 `SpotImage`；硬字串走 t()）
- Modify: `components/pilgrimage/PilgrimageHubSheet.tsx`（新增 `nearbySpots`/`onPickNearbySpot` props + `ListHeaderComponent` strip + `areEqual` 同步）
- Modify: `app/(tabs)/pilgrimage/map.tsx`（算 nearbySpots + 傳入 + onPick）
- Modify: `libs/i18n/locales/en.json`、`zh-Hant.json`（strip 標題 + row 空態）
- （UI/render glue；測過的單元是 Task 7 的 builder。驗收走模擬器 + `tsc`。）

**Interfaces:**
- Consumes: `getSpotsNear`（Task 7）、`buildNearbySpotsFromIndex`（Task 7）、`getIndexedById`（anitabi-index）、`NearbySpot`（nearby-spots）、`SpotImage`（P0）、`MAP_LOCATE_RADIUS_KM`（`map-nearby.ts:4`，值 30）。
- Produces: `NearbySpotRow`（export）、`formatKm`（export）；`PilgrimageHubSheetProps` 增 `nearbySpots?: readonly NearbySpot[]`、`onPickNearbySpot?: (spot: NearbySpot) => void`。

- [ ] **Step 1: `NearbySpotsSheet.tsx` — export row + formatKm、圖片換 SpotImage、i18n**

- `import { Image } from 'expo-image';` 刪，改 `import { SpotImage } from './SpotImage';`
- `function formatKm` → `export function formatKm`
- `function NearbySpotRow(...)` → `export function NearbySpotRow(...)`；內部 `<Image source={{ uri: spot.image }} style={styles.thumb} contentFit="cover" transition={120} />`（`:129-134`）換成：

```tsx
      <SpotImage uri={spot.image} style={styles.thumb} contentFit="cover" recyclingKey={spot.markerId} />
```

- 元件內硬英文（default-export sheet 用的 `'Finding nearby scenes'`/`'Zoom map to load spots'`/`'Hide/Show nearby spots'`/`` `${count} spot(s)` ``、`:81,82,68`）——因為 default-export sheet 不再掛載（Delta #6），這些字串走不到 render path。但為讓檔案本身合規，把它們也換成既有 key（`t('pilgrimageUi.spotsNearYou')` 已在用）或 `t('pilgrimage.map.nearbySpotsTitle')`；最小做法：只確保 **export 出去、會被 render 的 `NearbySpotRow`** 無硬英文（它本來就只用 `spot.name`/`spot.animeTitle`/`formatKm`，無英文字串——`subtitle` 用 `EP ${spot.ep}` 但 `ep=0` 時走 `spot.animeTitle` 分支，故不顯示 "EP"）。default-export sheet 的英文字串留著不動（該元件已無呼叫點；若要徹底，改 t() 亦可，但非本 task 必須）。

- [ ] **Step 2: `PilgrimageHubSheet.tsx` — 加 props + strip**

props interface（`:59-92` `PilgrimageHubSheetProps`）加兩欄：

```ts
  /** Point-level nearby spots (spec 2.3). Rendered as a horizontal strip above
   *  the anime list. Empty/undefined ⇒ no strip. */
  nearbySpots?: readonly import('../../libs/services/pilgrimage/nearby-spots').NearbySpot[];
  onPickNearbySpot?: (spot: import('../../libs/services/pilgrimage/nearby-spots').NearbySpot) => void;
```

檔頭 import 加：

```ts
import { NearbySpotRow } from './NearbySpotsSheet';
import { useT } from '../../libs/i18n';
import type { NearbySpot } from '../../libs/services/pilgrimage/nearby-spots';
```

（若 `useT` 已 import 就不重複；`View`/`ThemedText` 多半已在 scope，確認後不重複 import。strip 用 `.map` 渲染前 6 筆，不需 `FlatList`——避免與外層 `BottomSheetFlatList` 巢狀滾動衝突。）

解構 props（`:93-115` 附近）加 `nearbySpots, onPickNearbySpot`。在 `BottomSheetFlatList`（`:285-297`）加 `ListHeaderComponent`：

```tsx
      <BottomSheetFlatList
        // …既有 props 不動…
        ListHeaderComponent={
          nearbySpots && nearbySpots.length > 0 ? (
            <NearbySpotsStrip
              spots={nearbySpots}
              theme={theme}
              onPick={onPickNearbySpot}
            />
          ) : null
        }
      />
```

檔案 subcomponents 區（`:325` 之後）加 file-local strip（水平清單，複用 `NearbySpotRow` 太寬——strip 用精簡的縮圖卡；但為復活 `NearbySpotRow` 且保持一致，strip 直接用垂直 `NearbySpotRow` 前 6 筆亦可。最小、無巢狀水平滾動衝突的做法：strip 用**標題 + 前 6 個 `NearbySpotRow`**）：

```tsx
function NearbySpotsStrip({
  spots,
  theme,
  onPick,
}: {
  spots: readonly NearbySpot[];
  theme: ThemePalette;
  onPick?: (spot: NearbySpot) => void;
}) {
  const t = useT();
  return (
    <View style={{ paddingBottom: 8, gap: 6 }}>
      <ThemedText variant="captionSmall" weight="800" tone="secondary" style={{ paddingHorizontal: 4 }}>
        {t('pilgrimage.map.nearbySpotsTitle')}
      </ThemedText>
      {spots.slice(0, 6).map((spot) => (
        <NearbySpotRow key={spot.markerId} spot={spot} theme={theme} onPress={() => onPick?.(spot)} />
      ))}
    </View>
  );
}
```

`areEqual`（`:301-323`）加兩行比較（否則 strip 不更新）：

```ts
    prev.nearbySpots === next.nearbySpots &&
    prev.onPickNearbySpot === next.onPickNearbySpot &&
```

- [ ] **Step 3: `map.tsx` — 算 nearbySpots + 傳入**

檔頭 import 加：

```ts
import { getSpotsNear } from '../../../libs/services/pilgrimage/spot-index-service';
import { buildNearbySpotsFromIndex } from '../../../libs/services/pilgrimage/nearby-spots';
import { getIndexedById } from '../../../libs/services/pilgrimage/anitabi-index';
import { MAP_LOCATE_RADIUS_KM } from '../../../libs/services/pilgrimage/map-nearby';
import type { NearbySpot } from '../../../libs/services/pilgrimage/nearby-spots';
```

在 `stats` memo（`:495-508`）之後加狀態 + 載入（低頻：location fix 或 collection 改變時；Rule 9）：

```ts
  const [nearbySpots, setNearbySpots] = useState<readonly NearbySpot[]>([]);
  useEffect(() => {
    if (!userLocation) {
      setNearbySpots([]);
      return;
    }
    let active = true;
    getSpotsNear(userLocation, MAP_LOCATE_RADIUS_KM, 40)
      .then((hits) => {
        if (!active) return;
        setNearbySpots(
          buildNearbySpotsFromIndex(
            hits,
            (id) => {
              const e = getIndexedById(id);
              return e ? { title: e.title, cn: e.cn, color: e.color } : null;
            },
            collectionIds
          )
        );
      })
      .catch(() => {
        if (active) setNearbySpots([]);
      });
    return () => {
      active = false;
    };
  }, [userLocation, collectionIds]);

  const handlePickNearbySpot = useCallback(
    (spot: NearbySpot) => {
      setFocusedAnimeId(spot.animeId);
      mapRef.current?.recenter(spot.lat, spot.lng, 15, { animate: true });
    },
    []
  );
```

`<PilgrimageHubSheet ... />`（`:902-919`）加兩個 prop：

```tsx
              nearbySpots={nearbySpots}
              onPickNearbySpot={handlePickNearbySpot}
```

- [ ] **Step 4: i18n**

`en.json` `pilgrimage.map` 內加：

```json
"nearbySpotsTitle": "Sacred sites near you"
```

`zh-Hant.json` `pilgrimage.map` 內加：

```json
"nearbySpotsTitle": "你附近的聖地"
```

- [ ] **Step 5: 驗證** → Run: `bun run test:unit && bunx tsc --noEmit` Expected: PASS。模擬器（設一個近日本聖地的位置）開地圖：sheet 頂端出現「你附近的聖地」+ 幾個景點列（縮圖 = SpotImage，收藏動漫的點在前）；點一列 → 地圖飛到該點；無定位/無索引 → strip 不出現（無空白假料）。

- [ ] **Step 6: Commit**

```bash
git add components/pilgrimage/NearbySpotsSheet.tsx components/pilgrimage/PilgrimageHubSheet.tsx 'app/(tabs)/pilgrimage/map.tsx' libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json
git commit -m "feat(pilgrimage): revive nearby spots as a point-level strip in the hub sheet (SpotImage rows)"
```

---

### Task 10: 移除 4° bounds gate（spec 2.5）

**Files:**
- Modify: `libs/services/pilgrimage/pilgrimage-design-flow.ts`（`shouldLoadPilgrimageMapBounds` 放寬）
- Test: `__tests__/unit/pilgrimage/pilgrimage-design-flow.test.ts`（翻轉「拒絕全日本視圖」的既有斷言）

**Interfaces:**
- Produces: `shouldLoadPilgrimageMapBounds(bounds)` — 只在**無效 box**（NaN / north<south）回 false；不再有 4°/5° span cap（bounds 查詢打的是本地 index/SQLite，不需保護 API）。

- [ ] **Step 1: 改測試**（`pilgrimage-design-flow.test.ts:17-35` 那個 it 改成放寬後的預期）

```ts
  it('loads map bounds for any valid box (queries are local now, no API to protect)', () => {
    // Whole-Japan view — previously rejected by the 4° gate, now allowed.
    expect(
      shouldLoadPilgrimageMapBounds({ south: 24, west: 122.9, north: 45.6, east: 146 })
    ).toBe(true);
    // A local view stays allowed.
    expect(
      shouldLoadPilgrimageMapBounds({ south: 35.5, west: 139.3, north: 35.9, east: 140 })
    ).toBe(true);
    // Invalid boxes are still rejected.
    expect(
      shouldLoadPilgrimageMapBounds({ south: 45, west: 139, north: 35, east: 140 })
    ).toBe(false);
    expect(
      shouldLoadPilgrimageMapBounds({ south: NaN, west: 139, north: 35, east: 140 })
    ).toBe(false);
  });
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/pilgrimage-design-flow.test.ts` Expected: 全日本視圖那條 FAIL（現在回 false）。

- [ ] **Step 3: 實作**（`pilgrimage-design-flow.ts:16-32`）——只留有效性檢查，刪 span cap

```ts
export function shouldLoadPilgrimageMapBounds(bounds: PilgrimageMapBounds): boolean {
  // Bounds queries hit the local offline index (getAnimeInBounds) / local
  // SQLite spot index — there's no third-party API to rate-limit, so the old
  // 4°×5° span gate (which permanently blocked the whole-Japan default view,
  // see spec 2026-07-03 §1.3) is gone. Only reject a malformed box.
  return (
    Number.isFinite(bounds.north) &&
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.east) &&
    Number.isFinite(bounds.west) &&
    bounds.north >= bounds.south
  );
}
```

> 註：`getAnimeInBounds` 已有 `limit: 40`（`usePilgrimageHubData.ts:323`），所以放寬 gate 後全日本視圖只會拉回最近 40 筆本地 index 條目，無效能疑慮。

- [ ] **Step 4: 確認 pass + 全綠** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/pilgrimage-design-flow.test.ts && bun run test:unit && bunx tsc --noEmit` Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/pilgrimage-design-flow.ts __tests__/unit/pilgrimage/pilgrimage-design-flow.test.ts
git commit -m "fix(pilgrimage): drop the 4° bounds gate — local index needs no API protection"
```

---

### Task 11: 長按 marker → quick actions（spec 2.6，引擎接線 + 誠實動作）

> **Scope（Delta #5）：** 引擎加乾淨的 `onMarkerLongPress` 接線；hub 地圖 anime 中心點 marker 長按開一個小 action sheet，只放兩個**誠實**動作（**導航** / **查看聖地**）。收藏/計畫/打卡是 point-id keyed，掛到動漫中心點會是沒人讀的假狀態（Rule 8），留待 spot-level marker 出現後（後續 phase）。

**Files:**
- Modify: `components/pilgrimage/map/engines/markers/NativeMapMarker.tsx`（`Pressable` 加 `onLongPress`）
- Modify: `components/pilgrimage/map/engines/MapLibreEngine.tsx`（`onMarkerLongPress` 透傳）
- Modify: `libs/services/pilgrimage/map-engine/types.ts`（`MapSurfaceProps.onMarkerLongPress`）
- Modify: `app/(tabs)/pilgrimage/map.tsx`（長按 → 小 action sheet；導航 = buildMapsURL；查看 = navigateToDetail）
- Modify: `libs/i18n/locales/en.json`、`zh-Hant.json`（3 個 key）
- （UI/render glue；驗收走 `tsc` + 模擬器長按。引擎 prop 透傳無新單元測試——marker 視覺已有 `resolveMarkerVisual` 測試。）

**Interfaces:**
- Consumes: `buildMapsURL(lat, lng, name?)`（`components/pilgrimage/detail/_helpers.ts:35`，經 `components/pilgrimage/detail` re-export）；`navigateToDetail`（map.tsx 內既有）；`MapMarker`（map-engine types）。
- Produces: `MapSurfaceProps.onMarkerLongPress?: (marker: MapMarker) => void`；`NativeMapMarkerProps.onLongPress?`；engine `onMarkerLongPress` prop。

- [ ] **Step 1: `NativeMapMarker.tsx` — Pressable 加 onLongPress**

`NativeMapMarkerProps`（`:23-28`）加：

```ts
  onLongPress?: (marker: MapMarker) => void;
```

`NativeMapMarkerImpl`（`:91-104`）解構加 `onLongPress`，`Pressable`（`:94`）加：

```tsx
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress?.(marker)}
      onLongPress={onLongPress ? () => onLongPress(marker) : undefined}>
```

- [ ] **Step 2: `MapLibreEngine.tsx` — 透傳**

engine props（`:70` 附近解構）加 `onMarkerLongPress`，`<NativeMapMarker ... />`（`:213`）加：

```tsx
              <NativeMapMarker
                marker={m}
                defaultMode={markerMode}
                onPress={onMarkerPress}
                onLongPress={onMarkerLongPress}
              />
```

（engine 的 props 型別即 `MapSurfaceProps`——Step 3 加欄位後這裡自動有型別。）

- [ ] **Step 3: `map-engine/types.ts` — 加 prop**（`MapSurfaceProps`，`:121` `onMarkerPress` 之後）

```ts
  /** Long-press on a marker → contextual quick actions. */
  onMarkerLongPress?: (marker: MapMarker) => void;
```

- [ ] **Step 4: `map.tsx` — 長按 handler + action sheet**

檔頭 import 加：

```ts
import { Linking } from 'react-native';
import { buildMapsURL } from '../../../components/pilgrimage/detail';
import type { MapMarker } from '../../../libs/services/pilgrimage/map-engine/types';
```

（`Linking` 若 `react-native` 既有 import 行未含，補進去；`MapMarker` 型別若已 import 則不重複。）

在 `handleMarkerPress`（`:549-558`）之後加狀態 + handlers：

```ts
  const [quickActionMarker, setQuickActionMarker] = useState<MapMarker | null>(null);
  const handleMarkerLongPress = useCallback((m: MapMarker) => {
    Haptics.selectionAsync().catch(() => undefined);
    setQuickActionMarker(m);
  }, []);
  const closeQuickActions = useCallback(() => setQuickActionMarker(null), []);
  const handleQuickNavigate = useCallback(() => {
    const m = quickActionMarker;
    if (!m) return;
    Linking.openURL(buildMapsURL(m.lat, m.lng, m.title)).catch(() => undefined);
    setQuickActionMarker(null);
  }, [quickActionMarker]);
  const handleQuickOpen = useCallback(() => {
    const m = quickActionMarker;
    if (!m || m.bangumiId == null) return;
    setQuickActionMarker(null);
    handleMarkerPress(m.bangumiId);
  }, [quickActionMarker, handleMarkerPress]);
```

`<MapSurface ... />`（`:729-745`）加：

```tsx
            onMarkerLongPress={handleMarkerLongPress}
```

在 `<PilgrimageHubSheet ... />` 之後、`</>` 之前（`:919-920` 附近）加 action sheet（小型置底浮層，themed，Rule 4）：

```tsx
            {quickActionMarker ? (
              <Pressable style={styles.quickActionBackdrop} onPress={closeQuickActions}>
                <Pressable
                  style={[
                    styles.quickActionSheet,
                    { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
                  ]}
                  onPress={() => undefined}>
                  <ThemedText variant="titleSmall" weight="800" numberOfLines={1}>
                    {quickActionMarker.title}
                  </ThemedText>
                  <Pressable
                    onPress={handleQuickNavigate}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.quickActionRow, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="navigate-outline" size={18} color={theme.text.primary} />
                    <ThemedText variant="bodyMedium">{t('pilgrimage.map.quickAction.navigate')}</ThemedText>
                  </Pressable>
                  {quickActionMarker.bangumiId != null ? (
                    <Pressable
                      onPress={handleQuickOpen}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.quickActionRow, pressed && { opacity: 0.7 }]}>
                      <Ionicons name="information-circle-outline" size={18} color={theme.text.primary} />
                      <ThemedText variant="bodyMedium">{t('pilgrimage.map.quickAction.openDetail')}</ThemedText>
                    </Pressable>
                  ) : null}
                </Pressable>
              </Pressable>
            ) : null}
```

`makeStyles`（該檔 style factory）加：

```ts
    quickActionBackdrop: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.35)',
      padding: 16,
    },
    quickActionSheet: {
      borderRadius: Radius.lg,
      borderWidth: 1,
      padding: 16,
      gap: 8,
    },
    quickActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 44,
    },
```

- [ ] **Step 5: i18n**

`en.json` `pilgrimage.map` 內加：

```json
"quickAction": { "navigate": "Navigate here", "openDetail": "View sacred site" }
```

`zh-Hant.json` `pilgrimage.map` 內加：

```json
"quickAction": { "navigate": "導航到這裡", "openDetail": "查看聖地" }
```

- [ ] **Step 6: 驗證** → Run: `bun run test:unit && bunx tsc --noEmit` Expected: PASS（`native-map-markers` 既有測試照常過——只加了 optional prop）。模擬器：長按一個動漫 marker → 出現含「導航到這裡 / 查看聖地」的置底面板；點導航 → 開系統地圖 app；點查看 → 進 detail；點背景 → 關閉。

- [ ] **Step 7: Commit**

```bash
git add components/pilgrimage/map/engines/markers/NativeMapMarker.tsx components/pilgrimage/map/engines/MapLibreEngine.tsx libs/services/pilgrimage/map-engine/types.ts 'app/(tabs)/pilgrimage/map.tsx' libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json
git commit -m "feat(pilgrimage): long-press marker → navigate / open quick actions (honest anime-level actions)"
```

---

## 完成後整體驗收（對照 spec Phase 2 驗收）

- [ ] **Pipeline**（Aniseekr-source）：`bun test` 全綠；本地 `ANITABI_INDEX_PATH=... bun scripts/build-anitabi-points.ts` 產出 `anitabi-spots-index.json`（count>0）+ `anitabi-points-top.json`。首次 `workflow_dispatch` 後 `anitabi-spots-index` / `anitabi-points-top` 兩組 release 出現。若 anitabi 回 403 → workflow 失敗（探測器，記錄 spec §5）。
- [ ] **App**：`bun run test:unit` 全綠、`bunx tsc --noEmit` 僅 2 個既存 `global.css` 錯。
- [ ] 台北 / 上海 / 首爾（或任一有 anitabi 海外點的位置）打開 hub → hero 顯示真實「最近的聖地」場景照 + 距離 + 動漫名；地圖 sheet 出現「你附近的聖地」景點列。
- [ ] 飛航模式（索引已 hydrate）→ nearby 景點照常出（查的是本地 SQLite）。
- [ ] 收藏的動漫的點在 nearby 清單優先浮出。
- [ ] 全日本視圖平移地圖 → bounds 查詢會觸發（4° gate 已除），marker 隨視圖增長。
- [ ] 熱門動漫首開離線即有完整點位（points-top 快照已 seed 進 detail cache）。
- [ ] 長按動漫 marker → 導航 / 查看聖地 quick actions 可用。
- [ ] Release 尚未上線時：app 不 crash（下載 404 → 維持動漫中心點 fallback + 誠實空態）。
</content>
</invoke>

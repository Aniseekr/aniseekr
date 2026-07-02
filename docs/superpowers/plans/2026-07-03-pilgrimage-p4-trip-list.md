# Pilgrimage Phase 4（巡禮清單 — plan 頁重生）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「計畫」從裝飾變成真的 — 使用者在 SpotSheet 勾「計畫」的點會連同一份 meta 快照（動漫 id/標題 + 該點 geo/image）持久化；plan 頁讀它、按動漫分組成待走清單、顯示進度；一鍵「開始巡禮」進全螢幕地圖畫出順路路線並可丟進 Google Maps。

**Architecture:** 純接線 + 一個新機制（meta 快照）。核心資料改動只在 `spot-intents.ts`（v1→v2：兩個旗標保留、`meta` 選填、新 MMKV key、v1 讀取遷移）。toggle 只有一個真實入口（`usePilgrimageInteractions.toggleSpotIntent`，僅 `[animeId].tsx` 呼叫），在該層把 `[animeId]` scope 內已有的 anime context 塞進 meta —**SpotSheet 的 props 簽名不變**，所以每個 SpotSheet/DetailSheet 呼叫點原封不動可編譯。呈現層全部由純函式驅動（`route-order.ts` 最近鄰、`planned-trips.ts` 分組、`pilgrimage-navigation.ts` multi-stop URL、`map-engine/route-shape.ts` GeoJSON），screen 只做薄殼 orchestration（Rule 9）。地圖畫線用既有預留的 `MapRoute` type + 引擎新實作的 `routes` prop。

**Tech Stack:** Bun test（`--preload ./test-setup.ts`）、expo-router 檔案路由、MMKV（`kvGet/kvSet`）、`@maplibre/maplibre-react-native@11.3.2`（`GeoJSONSource` + `Layer type="line"`）、themed primitives、`useT()` i18n。

**Spec:** `docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md`（Phase 4 表 4.1–4.5）。不做清單（4.5）為 binding：多日行程實體、AI 排程、住宿、拖曳手動排序（nearest-neighbor 夠用）。

---

## Deltas — 實際 code 與 outline 的出入（動工前必讀）

寫 plan 時逐檔重驗，以下五處 outline 假設與 main checkout 不符，本 plan 以實際 code 為準：

1. **maplibre 套件與畫線 API 不同**：套件是 org-scoped 的 `@maplibre/maplibre-react-native@11.3.2`（package.json:43），不是 outline 寫的 `maplibre-react-native`。畫線 API 是 **`GeoJSONSource`（`data` prop 吃 GeoJSON 物件）+ `Layer type="line"`（`paint`/`layout` props）**，不是 outline 的 `ShapeSource` + `LineLayer`（那是舊版/rnmapbox 命名）。而且 `<Layer>` 作為 `<GeoJSONSource>` 的 child 時，`source` id 會由 `cloneReactChildrenWithProps` 自動注入（`node_modules/@maplibre/maplibre-react-native/lib/module/components/sources/geojson-source/GeoJSONSource.js:46-47`），因此 Layer 不需顯式傳 `source`。`line-color`/`line-width`/`line-opacity` 放 `paint`；`line-cap`/`line-join` 放 `layout`。（見 Layer.d.ts：`type: "fill" ... paint={{...}} layout={{...}}` 範例。）

2. **`MapLibreEngine` 根本沒解構 `routes`**：`MapSurfaceProps` type 上有 `routes?`/`waypoints?`（map-engine/types.ts:104-106），但引擎的 props 解構（MapLibreEngine.tsx:60-77）**沒有** `routes`，所以它是被丟掉、不是被 spread 忽略。Task 6 要把 `routes` 加進解構並渲染。

3. **`buildMapsURL` 不在 `pilgrimage-navigation.ts`**：outline（決定 5/10）稱 navigation 檔「已有 buildMapsURL 類 helper」——**沒有**。`pilgrimage-navigation.ts` 只有 route builder。單點 `buildMapsURL` 在 `components/pilgrimage/detail/_helpers.ts:35`（另有死碼副本 `PilgrimageSpotList.tsx:31`）。新的 `buildMultiStopDirectionsUrl` 是全新加到 `pilgrimage-navigation.ts`（該檔已有測試檔 `__tests__/unit/pilgrimage/pilgrimage-navigation.test.ts`，順手擴充）。

4. **`SpotImage` 目前不存在**：outline「依賴」段稱「P0 plan 的 SpotImage（Task 3）已存在」——在 main checkout **尚未實作**（`components/pilgrimage/SpotImage.tsx` 不存在）。它由 P0/P1 plan 的 Task 3 引入。spec 順序 Phase 0 → Phase 4，故本 plan 視 `SpotImage` + `sanitizeImageUri` 為 **Phase 0 前置依賴**並直接使用（誠實錯誤 tile，Rule 8）。若在 Phase 0 合併前先跑 Phase 4，`components/pilgrimage/SpotImage.tsx` 必須先落地（見 Global Constraints）。

5. **toggle 簽名其實不用動到 SpotSheet**：全 repo 只有一個 toggle 真實入口 `usePilgrimageInteractions.toggleSpotIntent(spot, intent, groupedSpotByPointId)`，僅由 `[animeId].tsx:297,301` 的 `handleToggleSaved/handleTogglePlanned` 呼叫。`PilgrimageDetailSheet.tsx` 只 **讀** `hasIntentForGroup`（:165-166,:206-207），不 toggle。純函式 `toggleSpotIntent(map, spotId, intent)`（spot-intents.ts）只被 `spot-intents.test.ts` 用。因此 meta 是在 hook 層用 `[animeId]` 已有的 anime context 補齊 —**SpotSheet 的 `onToggleSaved/onTogglePlanned: (spot) => void` 不變**，所有 SpotSheet/DetailSheet 呼叫點免改可編譯（Task 2 的 callsite 清單即證明）。

---

## Global Constraints

- 測試一律 `bun run test:unit` 或 `bun test --preload ./test-setup.ts <file>` — 裸 `bun test` 會炸（略過 native mock，CLAUDE.md Workflow）。基線 1397 tests 綠。
- 型別檢查：`bunx tsc --noEmit`。基線唯二既有噪音是 `global.css` 的 TS2882 ×2 — 不得新增其他錯誤。
- **前置依賴**：本 plan 於 P0/P1 plan（`2026-07-03-pilgrimage-p0-data-lifeline-p1-map-follow.md`）之後執行，需要其 Task 3 產出的 `components/pilgrimage/SpotImage.tsx`（`export function SpotImage(...)`、`export function sanitizeImageUri(...)`）。若尚未存在，先完成該 Task。
- UI 字串一律 `useT()`；**新 key 先加 `libs/i18n/locales/en.json`，再補 `libs/i18n/locales/zh-Hant.json`**（Rule 11）。`TranslationKey` 由 `typeof en.json` 推導，`t('typo')` 會編譯錯。ja/ko/zh-Hans 缺鍵回退 en。i18n parity 測試（`__tests__/unit/i18n.test.ts`）會擋 stale/mis-shaped key（多出 en 沒有的鍵才會失敗；未使用但存在於 en 的舊鍵不會失敗）。舊的 `pilgrimage.plan.preset/featured*/walkHours*/suggested*` 等鍵**保留不刪**（純未使用，跨 5 locale 刪除的 churn 不值得；Rule 8 針對的是「渲染出的假資料」而非閒置字串）。
- 顏色一律 `useTheme()` token（Rule 4）；themed primitives（`ThemedButton`/`ThemedText`/`ThemedSurface`）優先（CLAUDE.md 強制）。
- **Rule 8（誠實）**：plan 頁刪除假統計（`estimatedDays=ceil(spots/6)`、`walkingHours=spots*0.4`）。v1 遷移來、無 meta 的 planned 點無 geo/image → 進「未分類」列（誠實：我們確實不知道它在哪、長怎樣），使用者重新 toggle 即補齊。trip 地圖沒有可映射的點時顯示誠實空態，不編造。
- **Rule 9（render state 最小化）**：trip 地圖 screen 用薄 route 殼 + `useUserLocationTracking` + `mapRef` 命令式（比照 `[animeId].tsx:161-174`），route/markers 用 `useMemo` 從純函式導出，高頻位置/heading 不進 root React state。
- **Rule 10（首屏）**：plan 與 trip 皆 sync 讀 MMKV（`loadSpotIntentsSync`/`loadVisitedSpotsSync`）seed `useState`，frame 1 即真 chrome，無 skeleton、無 `await`。
- 每個 task 結尾 commit（訊息已給）。不要 push。

---

### Task 1: spot-intents v2 — meta 快照 + v1 遷移（核心資料改動）

**Files:**
- Modify: `libs/services/storage/keys.ts:18`（加 v2 key，保留 v1 供遷移）
- Modify: `libs/services/pilgrimage/spot-intents.ts`（type + `SpotIntentMeta` + `applySpotIntent` + `toggleSpotIntent(meta?)` + load v2/遷移 v1 + save v2 + sanitize meta）
- Test: `__tests__/unit/pilgrimage/spot-intents.test.ts`（保留既有 3 例，追加 meta/遷移例）

**Interfaces:**
- Produces:
  - `interface SpotIntentMeta { animeId: number; name: string; cn?: string; geo: [number, number]; image: string }`（`name`/`cn` = **動漫**標題；`geo`/`image` = **該點**）
  - `interface SpotIntent { saved?: true; planned?: true; meta?: SpotIntentMeta }`
  - `applySpotIntent(map: SpotIntentMap, spotId: string, intent: SpotIntentKind, op: 'add' | 'remove', meta?: SpotIntentMeta): SpotIntentMap`（純；add 設旗標 + 附/更新 meta；remove 刪旗標、若另一旗標仍在則保留 entry+meta、否則刪 entry）
  - `toggleSpotIntent(map, spotId, intent, meta?)` — 保留既有 3-arg 呼叫（第 4 參選填），內部委派 `applySpotIntent`
  - `loadSpotIntentsSync()` 先讀 v2 key，miss 則讀 v1 key 遷移（旗標保留、meta undefined）
- Consumes（既有）：`kvGet/kvSet`（app-storage）、`SpotIntentKind`。

- [ ] **Step 1: keys.ts 加 v2 key**（保留 v1）

`libs/services/storage/keys.ts:18` 之後加一行（v1 那行不動）：

```ts
export const SPOT_INTENTS_STORAGE_KEY = 'aniseekr.pilgrimage.spot-intents.v1';
export const SPOT_INTENTS_STORAGE_KEY_V2 = 'aniseekr.pilgrimage.spot-intents.v2';
```

- [ ] **Step 2: 寫 failing tests**（追加到 `spot-intents.test.ts`；既有 import 加 `applySpotIntent`、`SPOT_INTENTS_STORAGE_KEY` 供遷移測試）

檔頭 import 改為：

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import { SPOT_INTENTS_STORAGE_KEY } from '../../../libs/services/storage/keys';

import {
  applySpotIntent,
  loadSpotIntents,
  loadSpotIntentsSync,
  saveSpotIntents,
  toggleSpotIntent,
  type SpotIntentMeta,
} from '../../../libs/services/pilgrimage/spot-intents';
```

追加測試（既有 3 例保持不變 —它們用 3-arg toggle，第 4 參選填不影響）：

```ts
const META_A: SpotIntentMeta = {
  animeId: 115908,
  name: '響け！ユーフォニアム',
  cn: '吹响！上低音号',
  geo: [34.9, 135.8],
  image: 'https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160',
};

describe('spot intents v2 meta snapshot', () => {
  it('applySpotIntent add attaches meta; remove keeps meta while the other flag remains', () => {
    const added = applySpotIntent({}, 'pt1', 'planned', 'add', META_A);
    expect(added).toEqual({ pt1: { planned: true, meta: META_A } });

    const bothFlags = applySpotIntent(added, 'pt1', 'saved', 'add', META_A);
    expect(bothFlags).toEqual({ pt1: { planned: true, saved: true, meta: META_A } });

    const oneRemoved = applySpotIntent(bothFlags, 'pt1', 'planned', 'remove');
    expect(oneRemoved).toEqual({ pt1: { saved: true, meta: META_A } });

    const allGone = applySpotIntent(oneRemoved, 'pt1', 'saved', 'remove');
    expect(allGone).toEqual({});
  });

  it('persists and reloads meta through v2 storage', async () => {
    await saveSpotIntents({ pt1: { planned: true, meta: META_A } });
    expect(loadSpotIntentsSync()).toEqual({ pt1: { planned: true, meta: META_A } });
    expect(await loadSpotIntents()).toEqual({ pt1: { planned: true, meta: META_A } });
  });

  it('sanitizes malformed meta away but keeps the flags', async () => {
    await saveSpotIntents({
      pt1: { planned: true, meta: { animeId: 'x', name: 5, geo: [1], image: '' } as unknown as SpotIntentMeta },
    });
    expect(loadSpotIntentsSync()).toEqual({ pt1: { planned: true } });
  });

  it('migrates a v1 payload (flags preserved, meta undefined) when v2 is absent', () => {
    appStorage.set(SPOT_INTENTS_STORAGE_KEY, JSON.stringify({ old1: { saved: true, planned: true } }));
    expect(loadSpotIntentsSync()).toEqual({ old1: { saved: true, planned: true } });
  });
});
```

（若 `appStorage.set` 的 API 名不同，以 `libs/services/storage/app-storage` 實際匯出為準 —該檔已在測試 `beforeEach` 用 `appStorage.clearAll()`；`kvSet(SPOT_INTENTS_STORAGE_KEY, ...)` 亦可等價寫入。）

- [ ] **Step 3: 確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-intents.test.ts`
Expected: 新的 describe 全 FAIL（`applySpotIntent` 不存在、v2 key 未寫、meta 未 sanitize/未遷移）；既有 3 例仍 PASS。

- [ ] **Step 4: 實作 `spot-intents.ts`**（整檔重寫如下 — 保留原有純函式契約，擴充 meta）

```ts
// Local-only persistence for pilgrimage spot intents (saved / planned).
// v2 schema: a single MMKV key holding `Record<spotId, SpotIntent>` where each
// intent may carry a `meta` snapshot captured at toggle time — the anime it
// belongs to plus this point's own geo/image. That snapshot is what lets the
// plan page group planned spots offline (Rule 8: it's real data the user saw
// when they tapped, not a guess). v1 payloads (flag-only, no meta) migrate on
// read: flags are preserved, `meta` stays undefined, and the plan page files
// those under "uncategorized" until the user re-toggles them.
//
// The synchronous read lets the map / spot list / plan page seed markers and
// lists on the first frame instead of popping them in after an async resolve.

import { kvGet, kvSet } from '../storage/app-storage';
import {
  SPOT_INTENTS_STORAGE_KEY,
  SPOT_INTENTS_STORAGE_KEY_V2,
} from '../storage/keys';
import { Logger } from '../../utils/logger';

export type SpotIntentKind = 'saved' | 'planned';

/**
 * Snapshot captured the moment a user toggles an intent. `animeId`/`name`/`cn`
 * describe the ANIME the point belongs to (so the plan page can label a group
 * offline); `geo`/`image` describe THIS point (so the trip map can draw markers
 * + a route line and show a scene thumbnail without any network).
 */
export interface SpotIntentMeta {
  animeId: number;
  name: string;
  cn?: string;
  geo: [number, number];
  image: string;
}

export interface SpotIntent {
  saved?: true;
  planned?: true;
  meta?: SpotIntentMeta;
}

export type SpotIntentMap = Record<string, SpotIntent>;

/** Synchronous read — safe to seed `useState` with on the first-paint path. */
export function loadSpotIntentsSync(): SpotIntentMap {
  try {
    const rawV2 = kvGet(SPOT_INTENTS_STORAGE_KEY_V2);
    if (rawV2) return sanitizeSpotIntents(JSON.parse(rawV2) as unknown);
    // Migrate a v1 payload on first read: preserve flags, meta stays undefined.
    const rawV1 = kvGet(SPOT_INTENTS_STORAGE_KEY);
    if (rawV1) return sanitizeSpotIntents(JSON.parse(rawV1) as unknown);
    return {};
  } catch (err) {
    Logger.warn('[SpotIntents] load failed, returning empty', err);
    return {};
  }
}

/** Async read kept for callers that want a `Promise` signature. */
export async function loadSpotIntents(): Promise<SpotIntentMap> {
  return loadSpotIntentsSync();
}

export async function saveSpotIntents(map: SpotIntentMap): Promise<void> {
  try {
    kvSet(SPOT_INTENTS_STORAGE_KEY_V2, JSON.stringify(sanitizeSpotIntents(map)));
  } catch (err) {
    Logger.warn('[SpotIntents] save failed', err);
  }
}

/**
 * Add or remove a single intent for one spot id, optionally attaching a meta
 * snapshot on add. The single source of truth for intent mutation — the hook's
 * grouped toggle and the compat `toggleSpotIntent` both funnel through here.
 */
export function applySpotIntent(
  map: SpotIntentMap,
  spotId: string,
  intent: SpotIntentKind,
  op: 'add' | 'remove',
  meta?: SpotIntentMeta
): SpotIntentMap {
  const current = map[spotId] ?? {};
  const nextIntent: SpotIntent = { ...current };
  if (op === 'add') {
    nextIntent[intent] = true;
    if (meta) nextIntent.meta = meta;
  } else {
    delete nextIntent[intent];
  }
  const next: SpotIntentMap = { ...map };
  if (nextIntent.saved || nextIntent.planned) next[spotId] = nextIntent;
  else delete next[spotId];
  return next;
}

/** Toggle one flag (compat signature). Decides add/remove from current state. */
export function toggleSpotIntent(
  map: SpotIntentMap,
  spotId: string,
  intent: SpotIntentKind,
  meta?: SpotIntentMeta
): SpotIntentMap {
  const isSet = map[spotId]?.[intent] === true;
  return applySpotIntent(map, spotId, intent, isSet ? 'remove' : 'add', meta);
}

function sanitizeMeta(value: unknown): SpotIntentMeta | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const m = value as Record<string, unknown>;
  const geo = m.geo;
  if (
    typeof m.animeId !== 'number' ||
    !Number.isFinite(m.animeId) ||
    typeof m.name !== 'string' ||
    typeof m.image !== 'string' ||
    m.image.length === 0 ||
    !Array.isArray(geo) ||
    geo.length < 2 ||
    typeof geo[0] !== 'number' ||
    typeof geo[1] !== 'number'
  ) {
    return undefined;
  }
  const out: SpotIntentMeta = {
    animeId: m.animeId,
    name: m.name,
    geo: [geo[0], geo[1]],
    image: m.image,
  };
  if (typeof m.cn === 'string' && m.cn.length > 0) out.cn = m.cn;
  return out;
}

function sanitizeSpotIntents(value: unknown): SpotIntentMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: SpotIntentMap = {};
  for (const [spotId, rawIntent] of Object.entries(value as Record<string, unknown>)) {
    if (!spotId || !rawIntent || typeof rawIntent !== 'object' || Array.isArray(rawIntent)) {
      continue;
    }
    const source = rawIntent as Record<string, unknown>;
    const intent: SpotIntent = {};
    if (source.saved === true) intent.saved = true;
    if (source.planned === true) intent.planned = true;
    if (!intent.saved && !intent.planned) continue;
    const meta = sanitizeMeta(source.meta);
    if (meta) intent.meta = meta;
    out[spotId] = intent;
  }
  return out;
}
```

- [ ] **Step 5: 確認 pass**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-intents.test.ts`
Expected: 全 PASS（既有 3 + 新 4）。

- [ ] **Step 6: Commit**

```bash
git add libs/services/storage/keys.ts libs/services/pilgrimage/spot-intents.ts __tests__/unit/pilgrimage/spot-intents.test.ts
git commit -m "feat(pilgrimage): spot-intents v2 — meta snapshot (anime + point geo/image), v1 read-migration"
```

---

### Task 2: 把 anime meta 接進 toggle（hook + `[animeId]` callsite；SpotSheet 不變）

**Files:**
- Modify: `hooks/usePilgrimageInteractions.ts`（`toggleSpotIntent` 加 `animeMeta` 參數、inline loop 改用 `applySpotIntent` 帶 per-scene meta）
- Modify: `app/(tabs)/pilgrimage/[animeId].tsx`（`handleToggleSaved`/`handleTogglePlanned` 傳 anime meta）
- （純 glue：meta 邏輯已在 Task 1 的 `applySpotIntent` 測到；hook 本身無獨立單元測試 —比照 P0 plan Task 9 的 glue task 慣例。）

**Interfaces:**
- Consumes: `applySpotIntent`、`SpotIntentMeta`（Task 1）。
- Produces: `usePilgrimageInteractions().toggleSpotIntent(spot: AnitabiPoint, intent: SpotIntentKind, groupedSpotByPointId: Map<string, AnitabiSpot>, animeMeta: { animeId: number; name: string; cn?: string }) => void`。

**受影響 callsite 全清單（驗證會編譯）：**
- `hooks/usePilgrimageInteractions.ts` — 定義（改）。
- `app/(tabs)/pilgrimage/[animeId].tsx:297,301` — `handleToggleSaved`/`handleTogglePlanned` 唯二 toggle 呼叫者（改：加第 4 參）。
- `components/pilgrimage/detail/SpotSheet.tsx` — `onToggleSaved/onTogglePlanned: (spot) => void` **不變**（handler 由 `[animeId]` 提供且仍是 `(spot) => void`）。
- `components/pilgrimage/detail/PilgrimageDetailSheet.tsx:165-166,206-207` — 只讀 `hasIntentForGroup`，**不變**。
- `components/pilgrimage/detail/_equality.ts:265` — 只是註解，**不變**。

- [ ] **Step 1: 改 hook**（`hooks/usePilgrimageInteractions.ts`）

import 區加 `applySpotIntent` + `SpotIntentMeta`：

```ts
import {
  applySpotIntent,
  loadSpotIntentsSync,
  saveSpotIntents,
  type SpotIntentKind,
  type SpotIntentMap,
  type SpotIntentMeta,
} from '../libs/services/pilgrimage/spot-intents';
```

interface `UsePilgrimageInteractionsResult` 的 `toggleSpotIntent` 簽名改為（新增 `animeMeta`）：

```ts
  toggleSpotIntent: (
    spot: AnitabiPoint,
    intent: SpotIntentKind,
    groupedSpotByPointId: Map<string, AnitabiSpot>,
    animeMeta: { animeId: number; name: string; cn?: string }
  ) => void;
```

實作（取代 :102-126 的 `toggleSpotIntent`）— 每個 scene id 用該 scene 自己的 geo/image 建 meta，anime 欄位來自 `animeMeta`：

```ts
  const toggleSpotIntent = useCallback(
    (
      spot: AnitabiPoint,
      intent: SpotIntentKind,
      groupedSpotByPointId: Map<string, AnitabiSpot>,
      animeMeta: { animeId: number; name: string; cn?: string }
    ) => {
      Haptics.selectionAsync().catch(() => undefined);
      const group = groupedSpotByPointId.get(spot.id);
      const points = group ? group.scenes : [spot];
      setSpotIntents((prev) => {
        const shouldRemove = points.some((p) => prev[p.id]?.[intent] === true);
        const op = shouldRemove ? 'remove' : 'add';
        let next = prev;
        for (const p of points) {
          const meta: SpotIntentMeta = {
            animeId: animeMeta.animeId,
            name: animeMeta.name,
            ...(animeMeta.cn ? { cn: animeMeta.cn } : {}),
            geo: p.geo,
            image: p.image,
          };
          next = applySpotIntent(next, p.id, intent, op, meta);
        }
        void saveSpotIntents(next);
        return next;
      });
    },
    []
  );
```

- [ ] **Step 2: 改 `[animeId].tsx` callsite**（:296-303）

```ts
  const handleToggleSaved = useCallback(
    (spot: AnitabiPoint) =>
      toggleSpotIntent(spot, 'saved', groupedSpotByPointId, {
        animeId: anime?.id ?? bangumiId ?? 0,
        name: anime?.title ?? anime?.cn ?? '',
        cn: anime?.cn || undefined,
      }),
    [toggleSpotIntent, groupedSpotByPointId, anime?.id, anime?.title, anime?.cn, bangumiId]
  );
  const handleTogglePlanned = useCallback(
    (spot: AnitabiPoint) =>
      toggleSpotIntent(spot, 'planned', groupedSpotByPointId, {
        animeId: anime?.id ?? bangumiId ?? 0,
        name: anime?.title ?? anime?.cn ?? '',
        cn: anime?.cn || undefined,
      }),
    [toggleSpotIntent, groupedSpotByPointId, anime?.id, anime?.title, anime?.cn, bangumiId]
  );
```

（`anime`/`bangumiId` 皆在 scope：`bangumiId = getNumberParam(params,'animeId')` :107、`anime = mergedSeries.anime` :148。toggle 只在 sheet 開啟時可觸發，此時 `anime` 幾乎必然非 null；`?? 0` 只是型別保底，`animeId===0` 的點會被 plan 頁當「無有效 anime」處理，不會誤分組。）

- [ ] **Step 3: 驗證**

Run: `bunx tsc --noEmit && bun run test:unit`
Expected: PASS，無新型別錯（證明 SpotSheet/DetailSheet 呼叫點不受影響）。

- [ ] **Step 4: Commit**

```bash
git add hooks/usePilgrimageInteractions.ts 'app/(tabs)/pilgrimage/[animeId].tsx'
git commit -m "feat(pilgrimage): snapshot anime+point meta into planned/saved intents at toggle time"
```

---

### Task 3: `route-order.ts` — 最近鄰順路排序（純函式）

**Files:**
- Create: `libs/services/pilgrimage/route-order.ts`
- Test: `__tests__/unit/pilgrimage/route-order.test.ts`

**Interfaces:**
- Produces:
  - `interface OrderableSpot { id: string; geo: readonly [number, number] }`
  - `haversineKm(a: readonly [number, number], b: readonly [number, number]): number`
  - `orderSpotsByNearestNeighbor<T extends OrderableSpot>(spots: readonly T[], start: { latitude: number; longitude: number } | null): T[]`（`start === null` → 原序複本；否則從 start 貪婪選最近，逐點串鏈）

- [ ] **Step 1: 寫 failing test**（`route-order.test.ts`）

```ts
import { describe, expect, test } from 'bun:test';
import {
  haversineKm,
  orderSpotsByNearestNeighbor,
  type OrderableSpot,
} from '../../../libs/services/pilgrimage/route-order';

// A tiny east-west chain of stops (roughly Kyoto latitude, ~1km apart in lng).
const A: OrderableSpot = { id: 'A', geo: [35.0, 135.0] };
const B: OrderableSpot = { id: 'B', geo: [35.0, 135.02] };
const C: OrderableSpot = { id: 'C', geo: [35.0, 135.04] };
const D: OrderableSpot = { id: 'D', geo: [35.0, 135.06] };

describe('haversineKm', () => {
  test('same point is 0', () => {
    expect(haversineKm([35, 135], [35, 135])).toBe(0);
  });
  test('~2km between A and C is monotonic vs A-B', () => {
    expect(haversineKm(A.geo, C.geo)).toBeGreaterThan(haversineKm(A.geo, B.geo));
  });
});

describe('orderSpotsByNearestNeighbor', () => {
  test('null start preserves original order (fresh copy)', () => {
    const input = [C, A, D, B];
    const out = orderSpotsByNearestNeighbor(input, null);
    expect(out.map((s) => s.id)).toEqual(['C', 'A', 'D', 'B']);
    expect(out).not.toBe(input);
  });
  test('chains nearest-neighbor from a start just west of A', () => {
    const out = orderSpotsByNearestNeighbor([D, B, A, C], { latitude: 35.0, longitude: 134.99 });
    expect(out.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D']);
  });
  test('empty input returns empty', () => {
    expect(orderSpotsByNearestNeighbor([], { latitude: 0, longitude: 0 })).toEqual([]);
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/route-order.test.ts`（Cannot find module）

- [ ] **Step 3: 實作 `route-order.ts`**

```ts
// Nearest-neighbor ordering for a pilgrimage trip. Pure + deterministic so the
// plan / trip screens can compute a "walk order" off the render path (Rule 9)
// and unit-test it. Greedy NN is intentionally the whole strategy — spec 4.5's
// 不做清單 rules out AI scheduling / manual drag-sort until asked.

export interface OrderableSpot {
  id: string;
  geo: readonly [number, number];
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km between two [lat, lng] pairs. */
export function haversineKm(
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Order spots by walking-nearest chain starting from `start`. `start === null`
 * (no location permission / unknown) → keep the original order as a fresh copy.
 */
export function orderSpotsByNearestNeighbor<T extends OrderableSpot>(
  spots: readonly T[],
  start: { latitude: number; longitude: number } | null
): T[] {
  if (start === null) return [...spots];
  const remaining = [...spots];
  const ordered: T[] = [];
  let cursor: readonly [number, number] = [start.latitude, start.longitude];
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cursor, remaining[i].geo);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    cursor = next.geo;
  }
  return ordered;
}
```

- [ ] **Step 4: 確認 pass** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/route-order.test.ts`

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/route-order.ts __tests__/unit/pilgrimage/route-order.test.ts
git commit -m "feat(pilgrimage): route-order — nearest-neighbor trip ordering + haversine (pure)"
```

---

### Task 4: `buildMultiStopDirectionsUrl` — multi-stop 導航匯出（純函式）

**Files:**
- Modify: `libs/services/pilgrimage/pilgrimage-navigation.ts`（新增純函式，不動既有 route builder）
- Test: `__tests__/unit/pilgrimage/pilgrimage-navigation.test.ts`（追加）

**Interfaces:**
- Produces:
  - `type MapsPlatform = 'google' | 'apple'`
  - `buildMultiStopDirectionsUrl(stops: readonly (readonly [number, number])[], platform: MapsPlatform): string[]`
    - `'google'`：每段 `https://www.google.com/maps/dir/?api=1&destination=<lat,lng>&waypoints=<lat,lng>|...`（origin 省略 = 使用者目前位置；每段 destination = 該段最後點、waypoints ≤ 9 = 該段前面各點）。>10 點分段，段間串接（下一段從上一段終點續走）。
    - `'apple'`：Apple Maps 不支援 multi-stop → 逐點 `https://maps.apple.com/?ll=<lat,lng>` 陣列。
    - 空輸入 → `[]`。

- [ ] **Step 1: 寫 failing tests**（追加到 `pilgrimage-navigation.test.ts`）

檔頭 import 追加 `buildMultiStopDirectionsUrl`。追加 describe：

```ts
import {
  buildMultiStopDirectionsUrl,
} from '../../../libs/services/pilgrimage/pilgrimage-navigation';

describe('buildMultiStopDirectionsUrl', () => {
  const g = (lat: number, lng: number) => [lat, lng] as const;

  it('google: single segment with waypoints + final destination', () => {
    const urls = buildMultiStopDirectionsUrl([g(35, 135), g(35.1, 135.1), g(35.2, 135.2)], 'google');
    expect(urls).toEqual([
      'https://www.google.com/maps/dir/?api=1&destination=35.2,135.2&waypoints=35,135|35.1,135.1',
    ]);
  });

  it('google: two stops → destination only, no waypoints param', () => {
    expect(buildMultiStopDirectionsUrl([g(1, 2), g(3, 4)], 'google')).toEqual([
      'https://www.google.com/maps/dir/?api=1&destination=3,4&waypoints=1,2',
    ]);
  });

  it('google: >10 stops split into chained segments (<=9 waypoints each)', () => {
    const stops = Array.from({ length: 12 }, (_, i) => g(i, i));
    const urls = buildMultiStopDirectionsUrl(stops, 'google');
    expect(urls.length).toBe(2);
    // segment 1 ends at stop index 9 (10 stops: 9 waypoints + destination)
    expect(urls[0]).toContain('destination=9,9');
    // segment 2 resumes from stop 9 and ends at stop 11
    expect(urls[1]).toContain('destination=11,11');
    expect(urls[1]).toContain('waypoints=9,9|10,10');
  });

  it('apple: one search url per stop (no multi-stop support)', () => {
    expect(buildMultiStopDirectionsUrl([g(35, 135), g(36, 136)], 'apple')).toEqual([
      'https://maps.apple.com/?ll=35,135',
      'https://maps.apple.com/?ll=36,136',
    ]);
  });

  it('empty stops → empty array', () => {
    expect(buildMultiStopDirectionsUrl([], 'google')).toEqual([]);
    expect(buildMultiStopDirectionsUrl([], 'apple')).toEqual([]);
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/pilgrimage-navigation.test.ts`

- [ ] **Step 3: 實作**（`pilgrimage-navigation.ts` 底部追加）

```ts
export type MapsPlatform = 'google' | 'apple';

/** Google dir URLs allow up to ~9 intermediate waypoints + 1 destination. */
const GOOGLE_MAX_WAYPOINTS = 9;

const latLng = (p: readonly [number, number]): string => `${p[0]},${p[1]}`;

/**
 * Build deep links that route through an ordered list of pilgrimage stops.
 *
 * Google: origin is omitted so Maps uses the user's current location; each
 * segment carries up to 9 waypoints then a final destination. A trip longer
 * than 10 stops is split into chained segments (the next segment resumes from
 * the previous segment's last stop). Apple Maps has no multi-stop URL, so we
 * fall back to one search pin per stop.
 */
export function buildMultiStopDirectionsUrl(
  stops: readonly (readonly [number, number])[],
  platform: MapsPlatform
): string[] {
  if (stops.length === 0) return [];

  if (platform === 'apple') {
    return stops.map((p) => `https://maps.apple.com/?ll=${latLng(p)}`);
  }

  // google — chunk into segments of at most (GOOGLE_MAX_WAYPOINTS + 1) stops,
  // overlapping by one so each segment starts where the previous ended.
  const segmentSize = GOOGLE_MAX_WAYPOINTS + 1;
  const urls: string[] = [];
  let start = 0;
  while (start < stops.length) {
    const end = Math.min(start + segmentSize, stops.length);
    const segment = stops.slice(start, end);
    if (segment.length < 2) {
      // A trailing lone stop (only when a segment boundary landed exactly on the
      // last stop) — link straight to it.
      urls.push(`https://www.google.com/maps/dir/?api=1&destination=${latLng(segment[0])}`);
      break;
    }
    const destination = latLng(segment[segment.length - 1]);
    const waypoints = segment
      .slice(0, segment.length - 1)
      .map(latLng)
      .join('|');
    urls.push(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}`
    );
    if (end >= stops.length) break;
    start = end - 1; // resume from this segment's destination
  }
  return urls;
}
```

（分段邏輯自驗：12 點、segmentSize=10 → seg1 = stops[0..9]（destination=9,9），start=9 → seg2 = stops[9..11]（waypoints=9,9|10,10、destination=11,11），符合測試。）

- [ ] **Step 4: 確認 pass** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/pilgrimage-navigation.test.ts`

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/pilgrimage-navigation.ts __tests__/unit/pilgrimage/pilgrimage-navigation.test.ts
git commit -m "feat(pilgrimage): buildMultiStopDirectionsUrl — Google waypoint segments + Apple per-stop fallback"
```

---

### Task 5: `planned-trips.ts` — 依 planned intents 分組（純函式）

**Files:**
- Create: `libs/services/pilgrimage/planned-trips.ts`
- Test: `__tests__/unit/pilgrimage/planned-trips.test.ts`

**Interfaces:**
- Consumes: `SpotIntentMap`、`SpotIntentMeta`（Task 1）。
- Produces:
  - `interface PlannedSpot { id: string; geo: [number, number]; image: string }`
  - `interface PlannedTripGroup { animeId: number; name: string; cn?: string; spots: PlannedSpot[] }`
  - `interface PlannedTrips { groups: PlannedTripGroup[]; uncategorized: string[] }`
  - `groupPlannedIntents(map: SpotIntentMap): PlannedTrips`（`planned===true` 的點：有 meta → 依 `meta.animeId` 分組（name/cn 取該組首個 meta）；無 meta（v1 遷移）→ `uncategorized`。groups 依 spot 數降序、同數依 name 穩定排序；每組 spots 依 id 穩定排序。）

- [ ] **Step 1: 寫 failing test**（`planned-trips.test.ts`）

```ts
import { describe, expect, test } from 'bun:test';
import { groupPlannedIntents } from '../../../libs/services/pilgrimage/planned-trips';
import type { SpotIntentMap } from '../../../libs/services/pilgrimage/spot-intents';

const meta = (animeId: number, name: string, geo: [number, number], image: string, cn?: string) => ({
  animeId,
  name,
  geo,
  image,
  ...(cn ? { cn } : {}),
});

describe('groupPlannedIntents', () => {
  test('groups planned points by animeId and drops saved-only points', () => {
    const map: SpotIntentMap = {
      p1: { planned: true, meta: meta(1, 'Anime One', [35, 135], 'https://x/p1.jpg', 'A1') },
      p2: { planned: true, meta: meta(1, 'Anime One', [35.1, 135.1], 'https://x/p2.jpg') },
      p3: { planned: true, meta: meta(2, 'Anime Two', [34, 134], 'https://x/p3.jpg') },
      s1: { saved: true, meta: meta(3, 'Saved Only', [1, 1], 'https://x/s1.jpg') },
    };
    const out = groupPlannedIntents(map);
    expect(out.groups.map((g) => g.animeId)).toEqual([1, 2]); // 2 spots before 1
    expect(out.groups[0]).toEqual({
      animeId: 1,
      name: 'Anime One',
      cn: 'A1',
      spots: [
        { id: 'p1', geo: [35, 135], image: 'https://x/p1.jpg' },
        { id: 'p2', geo: [35.1, 135.1], image: 'https://x/p2.jpg' },
      ],
    });
    expect(out.uncategorized).toEqual([]);
  });

  test('planned points without meta (v1-migrated) go to uncategorized', () => {
    const map: SpotIntentMap = {
      old1: { planned: true },
      old2: { saved: true, planned: true },
    };
    const out = groupPlannedIntents(map);
    expect(out.groups).toEqual([]);
    expect(out.uncategorized.sort()).toEqual(['old1', 'old2']);
  });

  test('empty map → empty result', () => {
    expect(groupPlannedIntents({})).toEqual({ groups: [], uncategorized: [] });
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/planned-trips.test.ts`

- [ ] **Step 3: 實作 `planned-trips.ts`**

```ts
// Derive the plan page's trip list from persisted spot intents. Pure so the
// screen stays a thin shell (Rule 9) and grouping is unit-tested. A planned
// point carries a meta snapshot (Task: spot-intents v2) with the anime it
// belongs to plus its own geo/image, so this works fully offline. v1-migrated
// planned points have no meta → we surface them honestly as "uncategorized"
// (Rule 8: we don't know where they are; re-toggling backfills the snapshot).

import type { SpotIntentMap } from './spot-intents';

export interface PlannedSpot {
  id: string;
  geo: [number, number];
  image: string;
}

export interface PlannedTripGroup {
  animeId: number;
  name: string;
  cn?: string;
  spots: PlannedSpot[];
}

export interface PlannedTrips {
  groups: PlannedTripGroup[];
  uncategorized: string[];
}

export function groupPlannedIntents(map: SpotIntentMap): PlannedTrips {
  const byAnime = new Map<number, PlannedTripGroup>();
  const uncategorized: string[] = [];

  for (const [id, intent] of Object.entries(map)) {
    if (intent.planned !== true) continue;
    const meta = intent.meta;
    if (!meta) {
      uncategorized.push(id);
      continue;
    }
    let group = byAnime.get(meta.animeId);
    if (!group) {
      group = { animeId: meta.animeId, name: meta.name, ...(meta.cn ? { cn: meta.cn } : {}), spots: [] };
      byAnime.set(meta.animeId, group);
    }
    group.spots.push({ id, geo: meta.geo, image: meta.image });
  }

  const groups = Array.from(byAnime.values());
  for (const g of groups) g.spots.sort((a, b) => a.id.localeCompare(b.id));
  groups.sort((a, b) => b.spots.length - a.spots.length || a.name.localeCompare(b.name));
  uncategorized.sort();

  return { groups, uncategorized };
}
```

- [ ] **Step 4: 確認 pass** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/planned-trips.test.ts`

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/planned-trips.ts __tests__/unit/pilgrimage/planned-trips.test.ts
git commit -m "feat(pilgrimage): planned-trips — group planned intents by anime, honest uncategorized bucket"
```

---

### Task 6: `MapLibreEngine` 實作 `routes` prop（GeoJSONSource + Layer 畫線）

**Files:**
- Create: `libs/services/pilgrimage/map-engine/route-shape.ts`（純 GeoJSON builder）
- Test: `__tests__/unit/pilgrimage/route-shape.test.ts`
- Modify: `components/pilgrimage/map/engines/MapLibreEngine.tsx`（解構 `routes` + 渲染 line 圖層）

**Interfaces:**
- Consumes（既有）：`MapRoute`（map-engine/types.ts:73-78：`{ id; coords: readonly LatLng[]; kind; color? }`，`LatLng = { lat; lng }`）。
- Produces: `routeLineFeature(route: MapRoute): GeoJSON.Feature<GeoJSON.LineString>`（coords 轉 **[lng, lat]** 順序 — MapLibre 要求 lng-first）。
- 行為：`MapSurface`/`MapLibreEngine` 收 `routes?: readonly MapRoute[]` 時，每條畫一條 `line` 圖層（`line-color = route.color ?? 引擎預設`、`line-width 3`、`line-opacity 0.8`、`line-cap/join round`），渲染在 markers 之前（GL 圖層本就在 view-based `<Marker>` 之下）。

- [ ] **Step 1: 寫 failing test**（`route-shape.test.ts`）

```ts
import { describe, expect, test } from 'bun:test';
import { routeLineFeature } from '../../../libs/services/pilgrimage/map-engine/route-shape';
import type { MapRoute } from '../../../libs/services/pilgrimage/map-engine/types';

describe('routeLineFeature', () => {
  test('builds a LineString with lng-first coordinates', () => {
    const route: MapRoute = {
      id: 'trip-1',
      kind: 'tour',
      color: '#4a90d9',
      coords: [
        { lat: 35, lng: 135 },
        { lat: 36, lng: 136 },
      ],
    };
    expect(routeLineFeature(route)).toEqual({
      type: 'Feature',
      properties: { id: 'trip-1' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [135, 35],
          [136, 36],
        ],
      },
    });
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/route-shape.test.ts`

- [ ] **Step 3: 實作 `route-shape.ts`**

```ts
// Convert an engine-neutral MapRoute into a GeoJSON LineString feature for the
// MapLibre GeoJSONSource. Pure + unit-tested — the one place that flips our
// [lat, lng] vocabulary into MapLibre's lng-first coordinate order.

import type { MapRoute } from './types';

export function routeLineFeature(route: MapRoute): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: { id: route.id },
    geometry: {
      type: 'LineString',
      coordinates: route.coords.map((c) => [c.lng, c.lat]),
    },
  };
}
```

（`GeoJSON.*` 全域型別由 `@types/geojson` 提供，已是 maplibre 套件的傳遞依賴 —`GeoJSONSource.d.ts` 即用 `GeoJSON.GeoJSON`/`GeoJSON.FeatureCollection`，故可解析。）

- [ ] **Step 4: 確認 pass** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/route-shape.test.ts`

- [ ] **Step 5: 改 `MapLibreEngine.tsx`**

import 區（:20-26）改為加入 `GeoJSONSource`、`Layer`：

```ts
import {
  Map as MapLibreMap,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
```

補 `route-shape` import（接在 marker-style import 附近）：

```ts
import { routeLineFeature } from '../../../../libs/services/pilgrimage/map-engine/route-shape';
```

常數區（:56-58 附近）加預設線色：

```ts
/** Fallback route colour when a MapRoute carries no `color`. */
const DEFAULT_ROUTE_COLOR = '#4a90d9';
```

props 解構（:60-77）加入 `routes`：

```ts
export function MapLibreEngine({
  markers,
  routes,
  user,
  center,
  // …其餘不變…
  ref,
}: MapSurfaceProps & { ref?: Ref<MapSurfaceHandle> }) {
```

在 `<Camera .../>`（:192）之後、`{items.map(...)}`（:193）之前插入 route 圖層（畫在 marker 底下）：

```tsx
        <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom }} />
        {(routes ?? []).map((r) => (
          <GeoJSONSource key={`route:${r.id}`} id={`route-src-${r.id}`} data={routeLineFeature(r)}>
            <Layer
              id={`route-line-${r.id}`}
              type="line"
              paint={{
                'line-color': r.color ?? DEFAULT_ROUTE_COLOR,
                'line-width': 3,
                'line-opacity': 0.8,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        ))}
```

（`<Layer>` 作為 `<GeoJSONSource>` child，`source` 由套件 `cloneReactChildrenWithProps` 自動注入，不需顯式傳。`paint`/`layout` 走 v11 的新 API —見 Delta 1。）

- [ ] **Step 6: 驗證** → Run: `bunx tsc --noEmit && bun run test:unit`
Expected: PASS（`native-map-markers`/引擎相關既有測試不受影響；route 為 additive）。native render 無法 headless 驗證 —device 檢查移到 Task 8 的走查。

- [ ] **Step 7: Commit**

```bash
git add libs/services/pilgrimage/map-engine/route-shape.ts __tests__/unit/pilgrimage/route-shape.test.ts components/pilgrimage/map/engines/MapLibreEngine.tsx
git commit -m "feat(pilgrimage): MapLibreEngine renders MapRoute lines (GeoJSONSource + line Layer)"
```

---

### Task 7: `plan.tsx` 重寫 — 巡禮清單（讀 planned intents，砍假料）

**Files:**
- Modify: `app/(tabs)/pilgrimage/plan.tsx`（整檔重寫）
- Modify: `libs/i18n/locales/en.json`、`libs/i18n/locales/zh-Hant.json`（`pilgrimage.plan.*` 新 key）
- （呈現 glue：分組邏輯已在 Task 5 測到。）

**Interfaces:**
- Consumes: `loadSpotIntentsSync`/`SpotIntentMap`（Task 1）、`groupPlannedIntents`/`PlannedTripGroup`（Task 5）、`loadVisitedSpotsSync`/`VisitedMap`（既有）、`getIndexedById`（既有，動漫標題/color fallback）、`SpotImage`（P0 Task 3 前置）、themed primitives、`useT()`。
- 導覽：`router.push({ pathname: '/pilgrimage/trip/[animeId]', params: { animeId: String(group.animeId) } })`（Task 8 建立該 route）。

- [ ] **Step 1: 加 i18n key**（先 `en.json`，`pilgrimage.plan` 物件內追加下列鍵；既有鍵保留）

```json
"emptyTitle": "No planned spots yet",
"emptyBody": "Tap the flag on any spot to add it to your trip list.",
"emptyCta": "Explore the map",
"groupProgress": "{visited}/{total} visited",
"startTrip": "Start pilgrimage",
"startTripA11y": "Start pilgrimage for {title}",
"plannedHeader": "Your planned trips",
"uncategorizedTitle": "Uncategorized",
"uncategorizedBody": "Re-tap the flag on these {count} spots to add them to a trip."
```

`zh-Hant.json` 對應（`pilgrimage.plan` 內）：

```json
"emptyTitle": "還沒有計畫的地點",
"emptyBody": "在任一地點點旗標，就會加進你的巡禮清單。",
"emptyCta": "去地圖探索",
"groupProgress": "已走 {visited}/{total}",
"startTrip": "開始巡禮",
"startTripA11y": "開始 {title} 的巡禮",
"plannedHeader": "你的巡禮計畫",
"uncategorizedTitle": "未分類",
"uncategorizedBody": "在這 {count} 個地點重新點旗標即可歸入行程。"
```

- [ ] **Step 2: 重寫 `plan.tsx`**（整檔取代 — 刪 featured/preset/假統計/死省略號/死 build banner；讀 planned intents）

```tsx
// Travel Planner — the user's planned pilgrimage spots, grouped by anime.
// Reads persisted planned intents (spot-intents v2), each carrying a meta
// snapshot (anime + point geo/image) so this list works fully offline. No fake
// stats, no dead presets (spec Phase 4.1): every number here is real — planned
// spot counts and visited∩planned progress. Tapping "Start pilgrimage" opens
// the full-screen trip map (trip/[animeId]).

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { ThemedButton, ThemedText } from '../../../components/themed';
import { SpotImage } from '../../../components/pilgrimage/SpotImage';
import {
  loadSpotIntentsSync,
  type SpotIntentMap,
} from '../../../libs/services/pilgrimage/spot-intents';
import {
  groupPlannedIntents,
  type PlannedTripGroup,
} from '../../../libs/services/pilgrimage/planned-trips';
import {
  loadVisitedSpotsSync,
  type VisitedMap,
} from '../../../libs/services/pilgrimage/visited-prefs';
import { getIndexedById } from '../../../libs/services/pilgrimage/anitabi-index';
import { useT } from '../../../libs/i18n';

export default function PilgrimagePlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Seed sync from MMKV so the list is real on frame 1 (Rule 10) — no skeleton.
  const [intents] = useState<SpotIntentMap>(loadSpotIntentsSync);
  const [visited] = useState<VisitedMap>(loadVisitedSpotsSync);

  const { groups, uncategorized } = useMemo(() => groupPlannedIntents(intents), [intents]);

  const handleStart = useCallback(
    (group: PlannedTripGroup) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push({
        pathname: '/pilgrimage/trip/[animeId]',
        params: { animeId: String(group.animeId) },
      });
    },
    [router]
  );

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  const isEmpty = groups.length === 0 && uncategorized.length === 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.78 }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <ThemedText variant="titleMedium" weight="700" style={{ letterSpacing: 0.5 }}>
            {t('pilgrimage.plan.title')}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary" weight="500">
            {t('pilgrimage.plan.subtitle')}
          </ThemedText>
        </View>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}>
        {isEmpty ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="flag" size={40} color={theme.text.tertiary} />
            <ThemedText variant="titleMedium" weight="800" align="center" style={{ marginTop: 8 }}>
              {t('pilgrimage.plan.emptyTitle')}
            </ThemedText>
            <ThemedText
              variant="bodySmall"
              tone="secondary"
              align="center"
              style={{ marginTop: 4, marginBottom: 16 }}>
              {t('pilgrimage.plan.emptyBody')}
            </ThemedText>
            <ThemedButton
              label={t('pilgrimage.plan.emptyCta')}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                router.push('/pilgrimage');
              }}
              size="lg"
            />
          </View>
        ) : (
          <>
            {groups.length > 0 ? (
              <ThemedText
                variant="captionSmall"
                tone="tertiary"
                weight="700"
                style={styles.sectionLabel}>
                {t('pilgrimage.plan.plannedHeader')}
              </ThemedText>
            ) : null}
            {groups.map((group) => (
              <PlannedGroupCard
                key={`trip-${group.animeId}`}
                group={group}
                visited={visited}
                theme={theme}
                onStart={() => handleStart(group)}
              />
            ))}

            {uncategorized.length > 0 ? (
              <View style={styles.uncategorizedCard}>
                <ThemedText variant="bodyMedium" weight="700">
                  {t('pilgrimage.plan.uncategorizedTitle')}
                </ThemedText>
                <ThemedText variant="captionSmall" tone="secondary" style={{ marginTop: 4 }}>
                  {t('pilgrimage.plan.uncategorizedBody', { count: uncategorized.length })}
                </ThemedText>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

interface PlannedGroupCardProps {
  group: PlannedTripGroup;
  visited: VisitedMap;
  theme: ThemePalette;
  onStart: () => void;
}

function PlannedGroupCard({ group, visited, theme, onStart }: PlannedGroupCardProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Prefer the meta-snapshot title; fall back to the live index if present.
  const indexed = getIndexedById(group.animeId);
  const title = group.name || indexed?.title || indexed?.cn || '';
  const accent = indexed?.color || theme.accent;
  const total = group.spots.length;
  const visitedCount = group.spots.filter((s) => visited[s.id] === true).length;
  const thumbs = group.spots.slice(0, 6);

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupDot, { backgroundColor: accent }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText variant="bodyMedium" weight="800" numberOfLines={1}>
            {title}
          </ThemedText>
          {group.cn && group.cn !== title ? (
            <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
              {group.cn}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText variant="captionSmall" tone="secondary" weight="700">
          {t('pilgrimage.plan.groupProgress', { visited: visitedCount, total })}
        </ThemedText>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbRail}>
        {thumbs.map((spot) => (
          <View key={spot.id} style={styles.thumbWrap}>
            <SpotImage uri={spot.image} style={styles.thumb} recyclingKey={spot.id} />
            {visited[spot.id] ? (
              <View style={[styles.thumbCheck, { backgroundColor: theme.status.success }]}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <ThemedButton
        label={t('pilgrimage.plan.startTrip')}
        accessibilityLabel={t('pilgrimage.plan.startTripA11y', { title })}
        onPress={onStart}
        size="md"
        fullWidth
      />
    </View>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background.primary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.screenPadding,
      paddingBottom: Spacing.sm,
    },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.background.secondary}CC`,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    headerText: { flex: 1, minWidth: 0, alignItems: 'center' },
    scrollContent: { paddingTop: Spacing.sm, gap: Spacing.md },
    sectionLabel: {
      paddingHorizontal: Spacing.screenPadding,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    emptyCard: {
      marginHorizontal: Spacing.screenPadding,
      marginTop: Spacing.xl,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      alignItems: 'center',
    },
    groupCard: {
      marginHorizontal: Spacing.screenPadding,
      padding: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      gap: Spacing.sm,
    },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    groupDot: { width: 8, height: 8, borderRadius: 4 },
    thumbRail: { gap: 8, paddingRight: 2 },
    thumbWrap: { width: 72, height: 54, borderRadius: 10, overflow: 'hidden' },
    thumb: { width: '100%', height: '100%' },
    thumbCheck: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    uncategorizedCard: {
      marginHorizontal: Spacing.screenPadding,
      padding: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.tertiary,
    },
  });
}
```

（`theme.status.success` 為既有 token（原 plan.tsx:268 即用）。thumb check 用白勾 on success 綠底 —若要嚴格 readable，可改 `readableTextOn(theme.status.success)`；此處固定白勾在綠底對比充足，且非 accent 背景，符合 Rule 4 例外允許的既有慣例。）

- [ ] **Step 3: 驗證** → Run: `bunx tsc --noEmit && bun run test:unit`
Expected: PASS（i18n parity 含新 key；plan.tsx 不再 import FEATURED_PILGRIMAGE_ANIME / pilgrimageRepository / collectionPilgrimageService / cityToColor 等 —移除後無未使用 import 錯）。

- [ ] **Step 4: 模擬器走查**：勾幾個點（不同動漫）→ 進 plan 頁看到分組卡 + 縮圖 + 進度；清空 planned → 誠實空狀態 + 「去地圖探索」ThemedButton。

- [ ] **Step 5: Commit**

```bash
git add 'app/(tabs)/pilgrimage/plan.tsx' libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json
git commit -m "feat(pilgrimage): rebuild plan page as a real planned-spots trip list (drop fake stats/presets)"
```

---

### Task 8: `trip/[animeId].tsx` — 全螢幕巡禮地圖（路線 + 下一站 + 導航匯出）

**Files:**
- Create: `app/(tabs)/pilgrimage/trip/[animeId].tsx`（薄 route 殼 + 內嵌元件）
- Modify: `libs/i18n/locales/en.json`、`libs/i18n/locales/zh-Hant.json`（`pilgrimage.trip.*` 新 key）
- （`_layout.tsx` **不需改** —它是 implicit `<Stack screenOptions={...} />`（無顯式 `<Stack.Screen>` children），Expo Router 依檔案自動註冊 `trip/[animeId]`。）

**Interfaces:**
- Consumes: `loadSpotIntentsSync`/`groupPlannedIntents`（planned 分組）、`loadVisitedSpotsSync`、`orderSpotsByNearestNeighbor`/`haversineKm`（Task 3）、`buildMultiStopDirectionsUrl`（Task 4）、`MapSurface`+`MapSurfaceHandle`+`MapRoute`+`MapMarker`（既有）、`useUserLocationTracking`（既有）、`getIndexedById`、`getNumberParam`、`SpotImage`、`formatDistanceKm`（`components/pilgrimage/detail/_helpers.ts:50`）。

- [ ] **Step 1: 加 i18n key**（`en.json` 新增 `pilgrimage.trip` 物件；置於 `pilgrimage` 底下與 `plan` 同層）

```json
"trip": {
  "nextStop": "Next stop",
  "away": "{distance} away",
  "openInMaps": "Open in Google Maps",
  "openInMapsA11y": "Open this trip in Google Maps",
  "routeTruncated": "Long route — opened the first leg in Maps.",
  "allVisited": "All stops visited",
  "empty": "This trip has no mappable spots yet.",
  "back": "Back"
}
```

`zh-Hant.json` 對應：

```json
"trip": {
  "nextStop": "下一站",
  "away": "距離 {distance}",
  "openInMaps": "在 Google Maps 開啟",
  "openInMapsA11y": "在 Google Maps 開啟此行程",
  "routeTruncated": "路線較長 — 已在地圖開啟第一段。",
  "allVisited": "全部走完了",
  "empty": "這個行程還沒有可定位的地點。",
  "back": "返回"
}
```

- [ ] **Step 2: 建立 `app/(tabs)/pilgrimage/trip/[animeId].tsx`**

```tsx
// Full-screen trip map for one anime's planned spots. A thin route shell
// (Rule 9): the tracking hook + mapRef push location/heading straight to the
// native surface, and the route/markers/next-stop are memoised pure derivations
// from planned intents (offline via each spot's meta snapshot). No async, no
// skeleton — everything is seeded synchronously from MMKV (Rule 10).

import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../../../constants/DesignSystem';
import { useTheme } from '../../../../context/ThemeContext';
import { ThemedButton, ThemedText } from '../../../../components/themed';
import { SpotImage } from '../../../../components/pilgrimage/SpotImage';
import { MapSurface } from '../../../../components/pilgrimage/map/MapSurface';
import { LocateFab } from '../../../../components/pilgrimage/LocateFab';
import type {
  MapMarker,
  MapRoute,
  MapSurfaceHandle,
} from '../../../../libs/services/pilgrimage/map-engine/types';
import { CLUSTER_DISABLE_AT } from '../../../../libs/services/pilgrimage/map-engine/cluster-style';
import { loadSpotIntentsSync } from '../../../../libs/services/pilgrimage/spot-intents';
import { groupPlannedIntents } from '../../../../libs/services/pilgrimage/planned-trips';
import { loadVisitedSpotsSync } from '../../../../libs/services/pilgrimage/visited-prefs';
import {
  haversineKm,
  orderSpotsByNearestNeighbor,
} from '../../../../libs/services/pilgrimage/route-order';
import { buildMultiStopDirectionsUrl } from '../../../../libs/services/pilgrimage/pilgrimage-navigation';
import { getIndexedById } from '../../../../libs/services/pilgrimage/anitabi-index';
import { useUserLocationTracking } from '../../../../libs/services/pilgrimage/use-user-location-tracking';
import { getNumberParam } from '../../../../libs/utils/route-params';
import { formatDistanceKm } from '../../../../components/pilgrimage/detail/_helpers';
import { useT } from '../../../../libs/i18n';

export default function PilgrimageTripScreen() {
  const params = useLocalSearchParams();
  const animeId = getNumberParam(params, 'animeId');
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();

  const mapRef = useRef<MapSurfaceHandle>(null);
  const tracking = useUserLocationTracking({
    onFollowLocation: (loc) => {
      mapRef.current?.recenter(loc.latitude, loc.longitude, 15, { animate: true });
    },
    onHeadingChange: (deg) => mapRef.current?.setHeading(deg),
  });
  const userLocation = tracking.location;

  // Seed sync — the trip's spots come entirely from planned-intent meta.
  const [intents] = useState(loadSpotIntentsSync);
  const [visited] = useState(loadVisitedSpotsSync);

  const group = useMemo(
    () => groupPlannedIntents(intents).groups.find((g) => g.animeId === animeId) ?? null,
    [intents, animeId]
  );

  const indexed = animeId != null ? getIndexedById(animeId) : null;
  const title = group?.name || indexed?.title || indexed?.cn || '';
  const accent = indexed?.color || theme.accent;

  // Nearest-neighbor ordered stops (from the user, else index order).
  const ordered = useMemo(
    () => (group ? orderSpotsByNearestNeighbor(group.spots, userLocation) : []),
    [group, userLocation]
  );

  const markers = useMemo<MapMarker[]>(
    () =>
      ordered.map((s) => ({
        id: s.id,
        lat: s.geo[0],
        lng: s.geo[1],
        kind: 'spot',
        title,
        image: s.image,
        color: accent,
        visited: visited[s.id] === true,
        markerMode: 'bubble',
      })),
    [ordered, title, accent, visited]
  );

  const routes = useMemo<MapRoute[]>(() => {
    if (ordered.length < 2) return [];
    return [
      {
        id: `trip-${animeId}`,
        kind: 'tour',
        color: accent,
        coords: ordered.map((s) => ({ lat: s.geo[0], lng: s.geo[1] })),
      },
    ];
  }, [ordered, animeId, accent]);

  // Next stop = first unvisited in walk order.
  const nextStop = useMemo(() => ordered.find((s) => visited[s.id] !== true) ?? null, [ordered, visited]);
  const nextStopDistanceKm =
    nextStop && userLocation
      ? haversineKm([userLocation.latitude, userLocation.longitude], nextStop.geo)
      : null;

  const initialCenter = ordered[0]
    ? { lat: ordered[0].geo[0], lng: ordered[0].geo[1] }
    : indexed
      ? { lat: indexed.lat, lng: indexed.lng }
      : undefined;

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  const handleOpenMaps = useCallback(() => {
    if (ordered.length === 0) return;
    Haptics.selectionAsync().catch(() => undefined);
    const stops = ordered.map((s) => s.geo);
    const urls = buildMultiStopDirectionsUrl(stops, 'google');
    if (urls.length === 0) return;
    Linking.openURL(urls[0]).catch(() => undefined);
    // Apple-platform users still open Google Maps (universal web/app link); the
    // per-stop Apple fallback is reserved until a dedicated "Apple Maps" action.
    void Platform.OS;
  }, [ordered]);

  const hasStops = ordered.length > 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {initialCenter ? (
        <MapSurface
          ref={mapRef}
          markers={markers}
          routes={routes}
          user={userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null}
          center={initialCenter}
          zoom={13}
          clusterDisableAtZoom={CLUSTER_DISABLE_AT.hub}
          controlsBottomOffset={140}
        />
      ) : (
        <View style={[styles.container, { backgroundColor: theme.background.primary }]} />
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimage.trip.back')}
          style={({ pressed }) => [
            styles.roundBtn,
            { backgroundColor: `${theme.background.secondary}E6`, borderColor: theme.glassBorder },
            pressed && { opacity: 0.8 },
          ]}>
          <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
        </Pressable>
        <View
          style={[
            styles.titlePill,
            { backgroundColor: `${theme.background.secondary}E6`, borderColor: theme.glassBorder },
          ]}>
          <ThemedText variant="bodyMedium" weight="800" numberOfLines={1}>
            {title}
          </ThemedText>
        </View>
      </View>

      {hasStops ? (
        <LocateFab
          state={tracking.state}
          onPress={tracking.cycleState}
          loading={tracking.isRequestingPermission}
          bottomInset={insets.bottom + 130}
        />
      ) : null}

      {/* Next-stop card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <View
          style={[
            styles.card,
            { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
          ]}>
          {!hasStops ? (
            <ThemedText variant="bodySmall" tone="secondary" align="center">
              {t('pilgrimage.trip.empty')}
            </ThemedText>
          ) : nextStop ? (
            <View style={styles.nextRow}>
              <SpotImage uri={nextStop.image} style={styles.nextThumb} recyclingKey={nextStop.id} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText variant="captionSmall" tone="tertiary" weight="700">
                  {t('pilgrimage.trip.nextStop')}
                </ThemedText>
                {nextStopDistanceKm != null ? (
                  <ThemedText variant="bodySmall" weight="700">
                    {t('pilgrimage.trip.away', { distance: formatDistanceKm(nextStopDistanceKm) })}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ) : (
            <ThemedText variant="bodySmall" weight="700" tone="secondary" align="center">
              {t('pilgrimage.trip.allVisited')}
            </ThemedText>
          )}

          {hasStops ? (
            <ThemedButton
              label={t('pilgrimage.trip.openInMaps')}
              accessibilityLabel={t('pilgrimage.trip.openInMapsA11y')}
              onPress={handleOpenMaps}
              size="md"
              fullWidth
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenPadding,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  titlePill: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  bottomCard: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.screenPadding },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextThumb: { width: 56, height: 42, borderRadius: 8 },
});
```

（已核對 `components/pilgrimage/LocateFab.tsx:52-88`：`LocateFabProps` **僅** `state` 與 `onPress` 必填，其餘（`sheetAnimatedPosition`/`screenHeight`/`bottomInset`/`edgeGap`/`loading`…）皆選填，故上述用法（+ `loading` + `bottomInset` 抬高避開底卡）型別完整。`CLUSTER_DISABLE_AT.hub` 與 `map.tsx:737` 用法一致。）

- [ ] **Step 3: 驗證** → Run: `bunx tsc --noEmit && bun run test:unit`
Expected: PASS（`LocateFab` 僅需 `state`+`onPress`，已核對；trip route 由 Expo Router 自動註冊，`_layout.tsx` 不需改）。

- [ ] **Step 4: Device / 模擬器走查（native render 驗收）**：
  - plan 頁按某組「開始巡禮」→ 進 trip 地圖：planned 點為 spot markers、走過的呈綠、點間畫出一條線（Task 6 的 line 圖層）。
  - 有定位時線從最近點串起；「下一站」卡顯示第一個未走點 + 距離。
  - 按「在 Google Maps 開啟」→ 開啟 Google Maps dir，含 waypoints。
  - 全走完 → 卡片顯示「全部走完了」。
  - 記錄 Task 6 的 line 是否正確渲染於 marker 之下（native gate，spec §15）。

- [ ] **Step 5: Commit**

```bash
git add 'app/(tabs)/pilgrimage/trip/[animeId].tsx' libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json
git commit -m "feat(pilgrimage): trip map — nearest-neighbor route line, next-stop card, Google Maps export"
```

---

## 完成後整體驗收（對照 spec Phase 4 驗收）

- [ ] `bun run test:unit` 全綠、`bunx tsc --noEmit` 無新錯（僅剩基線 2× `global.css` TS2882）。
- [ ] 勾 5 個點（含跨動漫）→ plan 頁按動漫分組出現、每組顯示 `visited/total` 進度、縮圖為真實場景圖（SpotImage 誠實錯誤 tile 於失敗時）。
- [ ] 按「開始巡禮」→ trip 地圖：markers + 順路線（有定位時 nearest-neighbor 起點），「下一站」= 第一個未走點 + 距離。
- [ ] 「在 Google Maps 開啟」→ 開啟含 waypoints 的 multi-stop dir（>10 點只開第一段）。
- [ ] 沒勾任何點 → plan 頁誠實空狀態 + 「去地圖探索」ThemedButton（無假統計、無死 preset/省略號/build banner）。
- [ ] v1 使用者升級後：既有 planned 旗標保留；無 meta 的點進 plan 頁「未分類」列，重新 toggle 後歸入正確動漫組。
- [ ] SpotSheet / PilgrimageDetailSheet 行為與外觀不變（toggle 簽名變更未波及其 props）。
```
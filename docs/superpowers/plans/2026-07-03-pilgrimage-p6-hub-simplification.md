# Pilgrimage Phase 6（Hub 簡化 + 清理）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 砍掉 hub 的死碼與假地圖 chrome、把英文/日文硬字串收進 i18n、把 hub 快照落地到 SQLite、把 `index.tsx`/`map.tsx` 的狀態瘦身進 feature hooks（對照 `[animeId].tsx` 模範）、detail 加距離分組 section，最後把 hub 資訊架構重排成「最近聖地 → 我的巡禮 → 附近 → 探索」。

**Architecture:** 這個 phase 幾乎沒有新機制，全是既有 seam 的縮減與接線。狀態瘦身沿用 `usePilgrimageHubData` 的模式（screen 當 view orchestrator，資料/effect 進 hook）；hub 快照沿用 `CacheService`（SQLite in-memory mirror + `getSyncWithMeta`）落地；區域分組是一支純函式 `groupSpotsIntoAreas` 進 detail sheet 的 list render；per-anime accent 沿用 `anime.color`（anitabi 真資料，已有先例 `map.tsx:469`）。IA 重排是最後一步，吃 Phase 2（最近聖地真資料）與 Phase 3（visited/captures v2）。

**Tech Stack:** Bun test（`--preload ./test-setup.ts`）、React（hooks/memo/deferred）、Reanimated `SharedValue`、`@gorhom/bottom-sheet`、`CacheService`（SQLite）、MapLibre RN（`MapSurfaceHandle.fitBounds`）、i18n（`useT()` + `en.json`/`zh-Hant.json`）。

**Spec:** `docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md`（Phase 6 表 6.1–6.5 + §1.8 hub 快照）。

---

## 重讀核實後的 delta（real code vs outline，開工前必讀）

1. **index.tsx 狀態計數修正**：實際是 10 useState（`:145,:149,:156,:161,:166,:167,:170,:171,:174,:175`）+ 4 useEffect（`:206,:241,:328,:335`）+ **1** useFocusEffect（`:225`），不是 outline 寫的「2 useFocusEffect」；另有 1 `useSyncExternalStore`（`:541`，anitabi index version）。另外 **`setVisited`（:167）與 `setSpotIntents`（:170）宣告後從未被呼叫** — 兩者是純 seed 常數，搬移時當唯讀值即可（不需搬 setter）。
2. **6.2 依賴函式名不符**：outline 說 hero 消費 Phase 2 的 `getSpotsNear`；real code **沒有 `getSpotsNear`**。Phase 2 要復活的是 `buildNearbySpots`（`libs/services/pilgrimage/nearby-spots.ts:58`）餵給 `NearbySpotsSheet.tsx`（兩者今日零 import，spec §1.8 / Phase 2.3）。Task 7 的 Interfaces 以這兩者標 blocked-on Phase 2。
3. **6.3 handle 不完整**：`MapSurfaceHandle.fitBounds?` 存在（`map-engine/types.ts:98`），但 detail 螢幕用的是 `SpotMapViewHandle`（`SpotMapView.tsx:25`），**只暴露 `recenter`+`setHeading`**。Task 6 必須把 `fitBounds` 透傳出來（forward 到內層 `maplibreRef.current?.fitBounds?.`）。
4. **map.tsx 第三份 region 標籤**：`map.tsx` 也有一份英文 `REGION_88_LABELS`（`:91-99`）渲染在 region chip strip（`:1063`），§1.8 沒列。Task 2 順手把它換成共享的 `pilgrimage.regions.*` keys（成本近零、移除重複表）。**這是超出 outline 清單的加碼，已在此標明。**
5. **死碼細節**：`PilgrimageSpotList.tsx` 無孤兒測試（grep 乾淨），沒有額外測試要刪。`applyPilgrimageCollectionEntries` 只被 `__tests__/unit/pilgrimage/pilgrimage-hub-collection-state.test.ts` 的**第一個 `it` block** 引用 — Task 1 一併刪該 test case + `PilgrimageCollectionRefresh` 型別 + 因而變孤兒的 `anime`/`entry` helper 與 import。
6. **快照落地的 frame-1 限制**：`CacheService.getSync/getSyncWithMeta` 只讀 in-memory mirror（冷啟動時是空的）。純靠 `getSync` **無法**在冷啟動 frame-1 播種持久化快照。Task 3 因此用「`_layout` mount 時 async `hydratePilgrimageHubSnapshotFromCache()` 預熱 module snapshot + debounced write」；`getSyncWithMeta` 只是溫啟動（同 session 已寫過）的快路徑。這不違反 Rule 10 — hub frame-1 本來就有 bundled offline-index seed（`buildSeededFeatured`）撐著，快照只是把使用者收藏/位置在重啟後補回，屬 silent upgrade，不是 skeleton。
7. **超出範圍的 i18n 觀察（不做）**：`PilgrimageDetailSheet.tsx` 也有硬編英文（`'Visited'`/`'Photos'`/`{n} scenes`/`radius`/`{n} places`，`:251-355`），**不在 §1.8 清單**，本 plan 不動它，留給後續。

---

## Global Constraints

- 測試一律 `bun run test:unit` 或 `bun test --preload ./test-setup.ts <file>` — 裸 `bun test` 會炸（CLAUDE.md Workflow / test-setup 的 native mock）。
- 型別檢查：`bunx tsc --noEmit`。baseline 有 2 個既存的 `global.css` TS2882 雜訊；**不得新增任何新錯誤**。
- UI 字串一律 `useT()`；新 key **先加 `libs/i18n/locales/en.json`**（`TranslationKey` 由 `typeof en.json` 推導，`libs/i18n/types.ts:29`），再補 `zh-Hant.json`（Rule 11）。i18n parity 測試（`__tests__/unit/i18n.test.ts`）會擋漏改的 locale。插值用 `{name}` 形式（`engine.ts:73-79`）。
- 顏色一律 `useTheme()` token（Rule 4）；錯誤態誠實顯示、不假造資料（Rule 8）；高頻 sensor/gesture/camera 值不進 React render 路徑（Rule 9）。
- 狀態瘦身是**機械搬移、不改行為**：每個 task 一次搬一群 + 跑全套測試 + commit，避免大爆炸 diff。
- 每個 task 結尾 commit（訊息已給）。不要 push。

---

## 任務排序與依賴

無依賴者先行（Task 1–6），Phase-2/3-dependent 的 IA 重排最後（Task 7）：

1. **Task 1（6.4）死碼清除** — 無依賴。
2. **Task 2（6.5）i18n 收字串** — 無依賴。
3. **Task 3（§1.8 快照落地）hub 快照持久化** — 無依賴。
4. **Task 4（6.1a）index.tsx 狀態瘦身** — 依賴 Task 1（先清 index 相鄰死碼）與 Task 3（新 hook seed 用到落地後的 `getPilgrimageHubSnapshot`；行為相容即可，不強制）。
5. **Task 5（6.1b）map.tsx 狀態瘦身** — 依賴 Task 1（sheetIndex 已在 Task 1 刪除；本 task 的狀態盤點以「sheetIndex 已移除」為前提）。
6. **Task 6（6.3）detail 區域分組** — 無依賴。
7. **Task 7（6.2）hub IA 重排** — 依賴 Task 4（index hook）+ **blocked-on Phase 2**（最近聖地 hero 真資料）+ **blocked-on Phase 3**（我的巡禮進度 visited/captures v2）。

> 行號會因 Phase 0–5 先落地而漂移。每個 anchor 以「符號 / 上下文」為準，執行時先 `grep` 定位，勿盲信行號（同 Phase 0 plan 的慣例）。

---

### Task 1: 刪四處死碼（6.4）

**Files:**
- Delete: `components/pilgrimage/PilgrimageSpotList.tsx`（零 import，`grep -rn PilgrimageSpotList` 只命中檔案本身）
- Modify: `libs/services/pilgrimage/pilgrimage-hub-collection-state.ts`（刪 `applyPilgrimageCollectionEntries` `:45-54` + `PilgrimageCollectionRefresh` 型別 `:9-11`）
- Modify: `__tests__/unit/pilgrimage/pilgrimage-hub-collection-state.test.ts`（刪引用 `applyPilgrimageCollectionEntries` 的第一個 `it` block `:37-51` + 變孤兒的 `anime`/`entry` helper 與 `CollectionPilgrimageEntry`/`AnitabiBangumi` import）
- Modify: `app/(tabs)/pilgrimage/map.tsx`（刪 `flyToFocusedAnime` `:609-613` + 其在 `handleSwitchMapViewMode` 的呼叫與 dep；刪 `sheetIndex` state `:650`、`handleSheetIndexChange` `:659`、`void sheetIndex` `:677`、`<PilgrimageHubSheet>` 的 `onSheetIndexChange` prop `:916`）

**Interfaces:**
- Produces（行為保證）：`pilgrimage-hub-collection-state.ts` 仍匯出 `buildPilgrimageCollectionState` / `mergePilgrimageAnimeList` / `shouldRefreshPilgrimageCollectionOnFocus`（Task 4/5 的 hook 消費它們）。
- `map.tsx` 切換到 `mapViewMode==='anime'` 時的鏡頭飛行**改由既有 effect（`:682-688`「Drive the inline map camera (Rule 9)」）獨力負責** — `handleSwitchMapViewMode` 呼叫 `setMapViewMode('anime')` 後，`mapViewMode` 變更即觸發該 effect 飛到 focused anime。`flyToFocusedAnime()` 只是同一件事的重複，刪除後行為等價（差一個 render frame）。
- `sheetIndex` 只被 `void sheetIndex`「使用」；`PilgrimageHubSheet.onSheetIndexChange` 是 optional，移除 prop 不影響其型別。

- [ ] **Step 1: 跑 baseline 確認全綠**

Run: `bun run test:unit`
Expected: 全綠（1397+ tests）。這是機械刪除，先確立基準。

- [ ] **Step 2: 刪 `PilgrimageSpotList.tsx`**

```bash
git rm components/pilgrimage/PilgrimageSpotList.tsx
```

- [ ] **Step 3: 刪 `applyPilgrimageCollectionEntries` + `PilgrimageCollectionRefresh`**

`libs/services/pilgrimage/pilgrimage-hub-collection-state.ts`：刪掉 `:9-11` 的

```ts
export interface PilgrimageCollectionRefresh extends PilgrimageCollectionState {
  mergedAnimes: AnitabiBangumi[];
}
```

與 `:45-54` 的整個 `applyPilgrimageCollectionEntries(...)` 函式。保留 `buildPilgrimageCollectionState` / `mergePilgrimageAnimeList` / `shouldRefreshPilgrimageCollectionOnFocus`。

- [ ] **Step 4: 修測試 `pilgrimage-hub-collection-state.test.ts`**

- import（`:3-8`）改成只留還用得到的：

```ts
import { describe, expect, it } from 'bun:test';

import { shouldRefreshPilgrimageCollectionOnFocus } from '../../../libs/services/pilgrimage/pilgrimage-hub-collection-state';
```

（刪掉 `applyPilgrimageCollectionEntries` import、`CollectionPilgrimageEntry` import、`AnitabiBangumi` import。）
- 刪掉 `anime(...)` helper（`:10-25`）與 `entry(...)` helper（`:27-34`）。
- 刪掉第一個 `it('uses the latest collection ids ...')` block（`:37-51`）。保留第二個 `it('refreshes on first focus only ...')`。

- [ ] **Step 5: 修 `map.tsx` — flyToFocusedAnime / sheetIndex / void**

- 刪 `flyToFocusedAnime`（`:609-613`）整個 `useCallback`。
- `handleSwitchMapViewMode`（`:624-639`）：刪掉 body 內的 `flyToFocusedAnime();`（`:632`）與 deps 陣列裡的 `flyToFocusedAnime`。切到 `'anime'` 時什麼都不做，靠 `:682-688` effect 飛行。改後：

```ts
  const handleSwitchMapViewMode = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    const next: PilgrimageMapViewMode = mapViewMode === 'myLocation' ? 'anime' : 'myLocation';
    persistMapViewMode(next);
    if (next === 'myLocation') {
      if (!flyToUserLocation()) requestPermissionSheet();
    }
  }, [flyToUserLocation, mapViewMode, persistMapViewMode, requestPermissionSheet]);
```

- 刪 `const [sheetIndex, setSheetIndex] = useState<number>(1);`（`:650`）、`const handleSheetIndexChange = useCallback((idx: number) => setSheetIndex(idx), []);`（`:659`）、以及 `:675-677` 的註解 + `void sheetIndex;`。
- `<PilgrimageHubSheet ... onSheetIndexChange={handleSheetIndexChange} ... />`（`:916`）：刪掉 `onSheetIndexChange={handleSheetIndexChange}` 這一行。

- [ ] **Step 6: 驗證**

Run: `bun run test:unit && bunx tsc --noEmit`
Expected: 全綠、無新 TS 錯誤（`pilgrimage-hub-collection-state.test.ts` 剩 1 個 `it`；map.tsx 型別乾淨 — `initialSheetIndex` 仍傳給 `initialIndex`，未受影響）。

- [ ] **Step 7: Commit**

```bash
git add components/pilgrimage/PilgrimageSpotList.tsx libs/services/pilgrimage/pilgrimage-hub-collection-state.ts __tests__/unit/pilgrimage/pilgrimage-hub-collection-state.test.ts 'app/(tabs)/pilgrimage/map.tsx'
git commit -m "chore(pilgrimage): remove dead PilgrimageSpotList / applyPilgrimageCollectionEntries / flyToFocusedAnime / sheetIndex"
```

---

### Task 2: i18n 清單逐條換 t()（6.5 / §1.8）

**Files:**
- Modify: `libs/i18n/locales/en.json`（新增 keys，見下）
- Modify: `libs/i18n/locales/zh-Hant.json`（對應繁中）
- Modify: `app/(tabs)/pilgrimage/index.tsx`（PopularCard `{total} spots` `:985`）
- Modify: `components/pilgrimage/PilgrimageHubSheet.tsx`（`:171,:194,:218,:376,:383,:622` + a11y `:360,:497,:607`）
- Modify: `components/pilgrimage/Tourism88Rail.tsx`（`REGION_LABELS` `:26-34`、`★ Official` `:65`、a11y `:121`、`+{n} cities` `:155`）
- Modify: `app/(tabs)/pilgrimage/album.tsx`（`REGION_LABELS` `:76-84`、`label="その他"` `:616`）
- Modify: `app/(tabs)/pilgrimage/map.tsx`（`REGION_88_LABELS` `:91-99` → 共享 region keys；**delta #4**）

**Interfaces:**
- Produces: 共享 region key 表 `pilgrimage.regions.{hokkaido_tohoku|kanto|tokyo|chubu|kinki|chugoku_shikoku|kyushu_okinawa|other}`，被 Tourism88Rail / album / map.tsx 三處以 `Record<AnimeTourism88Region, TranslationKey>` 對照消費（`TranslationKey` 由 `libs/i18n` 匯出，`engine.ts:159`）。

- [ ] **Step 1: 加 i18n keys（en.json 先）**

`en.json` `"pilgrimage"` 物件下新增（若 `regions`/`tourism88` 尚不存在則新建）：

```json
"regions": {
  "hokkaido_tohoku": "Hokkaido / Tohoku",
  "kanto": "Kanto",
  "tokyo": "Tokyo",
  "chubu": "Chubu",
  "kinki": "Kinki",
  "chugoku_shikoku": "Chugoku / Shikoku",
  "kyushu_okinawa": "Kyushu / Okinawa",
  "other": "Other"
},
"tourism88": {
  "official": "★ Official",
  "entryA11y": "{title}, Anime Tourism 88 entry",
  "moreCities": "+{count} cities"
}
```

`en.json` `"pilgrimage"."detail"` 下新增（供 Task 6 也用得到，先放這裡）：`"areaLabel": "Area {index} ({count})"`（Task 6 會再驗證）。

`en.json` `"pilgrimageUi"` 物件下新增：

```json
"anime": "Anime",
"photos": "Photos",
"nearbyAnime": "Nearby anime",
"unknownTitle": "Unknown title",
"scenesCount": "{count} scenes",
"spotsCount": "{count} spots",
"openAnimeA11y": "Open {title}",
"animePilgrimageA11y": "{title} pilgrimage"
```

`zh-Hant.json` 對應：

```json
"regions": {
  "hokkaido_tohoku": "北海道・東北",
  "kanto": "關東",
  "tokyo": "東京",
  "chubu": "中部",
  "kinki": "近畿",
  "chugoku_shikoku": "中國・四國",
  "kyushu_okinawa": "九州・沖繩",
  "other": "其他"
},
"tourism88": {
  "official": "★ 官方",
  "entryA11y": "{title}，動畫聖地巡禮 88 選",
  "moreCities": "+{count} 個城市"
}
```
`zh-Hant.json` `"pilgrimage"."detail"."areaLabel"`: `"區域 {index}（{count} 點）"`。
`zh-Hant.json` `"pilgrimageUi"`：`"anime": "動畫"`、`"photos": "照片"`、`"nearbyAnime": "附近動畫"`、`"unknownTitle": "未知標題"`、`"scenesCount": "{count} 個場景"`、`"spotsCount": "{count} 個景點"`、`"openAnimeA11y": "開啟 {title}"`、`"animePilgrimageA11y": "{title} 聖地巡禮"`。

- [ ] **Step 2: 換 `index.tsx` PopularCard 的 `{total} spots`（`:984-986`）**

```tsx
          <ThemedText variant="captionSmall" weight="700" style={{ color: accentFg, fontSize: 10 }}>
            {t('pilgrimageUi.spotsCount', { count: total })}
          </ThemedText>
```

PopularCard 目前無 `t` in scope — 在元件頂部加 `const t = useT();`（`useT` 已 import 於 `:82`）。

- [ ] **Step 3: 換 `PilgrimageHubSheet.tsx` 六處硬字串 + 三處 a11y**

- `:171` `const sectionTitle = nearbyAnimes.length === 1 ? 'Nearby anime' : 'Nearby animes';` → `const sectionTitle = t('pilgrimageUi.nearbyAnime');`（`t` 已在 `:114`）。
- `:194` StatCell `label={stats.nearbyCount === 1 ? 'Anime' : 'Animes'}` → `label={t('pilgrimageUi.anime')}`。
- `:218` StatCell `label={stats.photoCount === 1 ? 'Photo' : 'Photos'}` → `label={t('pilgrimageUi.photos')}`。
- `:376` `{anime.pointsLength ?? 0} scenes` → `{t('pilgrimageUi.scenesCount', { count: anime.pointsLength ?? 0 })}`（在 `FocusedAnimeCard`，`t` 已於 `:352`）。
- `:383` `{titles?.primary ?? 'Unknown Title'}` → `{titles?.primary ?? t('pilgrimageUi.unknownTitle')}`。
- `:622` `{anime.pointsLength ?? 0} spots` → `{t('pilgrimageUi.spotsCount', { count: anime.pointsLength ?? 0 })}`（在 `HubAnimeCard`，目前**無 `t`** → 在該 memo 元件內加 `const t = useT();`）。
- a11y `:360` `accessibilityLabel={`Open ${titles?.primary ?? 'anime'}`}` → `accessibilityLabel={t('pilgrimageUi.openAnimeA11y', { title: titles?.primary ?? t('pilgrimageUi.unknownTitle') })}`。
- a11y `:497`（`HubAnimeRow`，無 `t` → 加 `const t = useT();`）`accessibilityLabel={`${titles.primary} pilgrimage`}` → `accessibilityLabel={t('pilgrimageUi.animePilgrimageA11y', { title: titles.primary })}`。
- a11y `:607`（`HubAnimeCard`，Step 3 已加 `t`）同上換 `t('pilgrimageUi.animePilgrimageA11y', { title: titles.primary })`。

- [ ] **Step 4: 換 `Tourism88Rail.tsx`（REGION_LABELS + ★ Official + a11y + +N cities）**

- import 加 `TranslationKey`：`import { useT, type TranslationKey } from '../../libs/i18n';`（`useT` 已 import `:20`）。
- `:26-34` `REGION_LABELS` 常數改成 key 表：

```ts
const REGION_LABEL_KEY: Record<AnimeTourism88Region, TranslationKey> = {
  hokkaido_tohoku: 'pilgrimage.regions.hokkaido_tohoku',
  kanto: 'pilgrimage.regions.kanto',
  tokyo: 'pilgrimage.regions.tokyo',
  chubu: 'pilgrimage.regions.chubu',
  kinki: 'pilgrimage.regions.kinki',
  chugoku_shikoku: 'pilgrimage.regions.chugoku_shikoku',
  kyushu_okinawa: 'pilgrimage.regions.kyushu_okinawa',
};
```

- `:65` `★ Official` → `{t('pilgrimage.tourism88.official')}`（在 `Tourism88Rail`，`t` 已於 `:56`）。
- `Tourism88RailCard`（`:111`）無 `t` → 加 `const t = useT();`。`:115` `const regionLabel = REGION_LABELS[primaryEntry.region];` → `const regionLabel = t(REGION_LABEL_KEY[primaryEntry.region]);`。
- a11y `:121` `accessibilityLabel={`${title}, Anime Tourism 88 entry`}` → `accessibilityLabel={t('pilgrimage.tourism88.entryA11y', { title })}`。
- `:155` `+{cityCount} cities` → `{t('pilgrimage.tourism88.moreCities', { count: cityCount })}`。

- [ ] **Step 5: 換 `album.tsx`（REGION_LABELS + その他）**

- import 加 `TranslationKey`（`useT` 已 import `:46`）。
- `:76-84` 日文 `REGION_LABELS` 常數 → key 表（同 Task 2 Step 4 的 `REGION_LABEL_KEY` 形狀，值指向 `pilgrimage.regions.*`）。
- 三個消費點改成 `t(REGION_LABEL_KEY[region])`：`:601`（`label={REGION_LABELS[region]}` → `label={t(REGION_LABEL_KEY[region])}`）、`:641`（`{REGION_LABELS[selectedFolder.region]}` → `{t(REGION_LABEL_KEY[selectedFolder.region])}`）、`:927`（`folder.region ? REGION_LABELS[folder.region] : null` → `folder.region ? t(REGION_LABEL_KEY[folder.region]) : null`）。這三處都在有 `t` in scope 的元件內；若 `:927` 的 helper 無 `t`，把 label 的計算上移到呼叫端或傳入 `t`（讀該處上下文取最小改動）。
- `:616` `label="その他"` → `label={t('pilgrimage.regions.other')}`。

- [ ] **Step 6: 換 `map.tsx` REGION_88_LABELS（delta #4）**

- `:91-99` `REGION_88_LABELS` → 同 `REGION_LABEL_KEY` key 表（import `TranslationKey`；`useT` 已 import `:88`）。
- `RegionChipStrip`（`:1009`，`t` 已於 `:1015`）`:1063` `{REGION_88_LABELS[r]}` → `{t(REGION_LABEL_KEY[r])}`。

- [ ] **Step 7: 驗證**

Run: `bun run test:unit && bunx tsc --noEmit`
Expected: 全綠。i18n parity（`__tests__/unit/i18n.test.ts`）驗證 en/zh-Hant 新 key 齊備、`TranslationKey` 推導無誤（打錯 key 會是編譯錯誤）。

- [ ] **Step 8: Commit**

```bash
git add libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json 'app/(tabs)/pilgrimage/index.tsx' components/pilgrimage/PilgrimageHubSheet.tsx components/pilgrimage/Tourism88Rail.tsx 'app/(tabs)/pilgrimage/album.tsx' 'app/(tabs)/pilgrimage/map.tsx'
git commit -m "i18n(pilgrimage): route hub/88-rail/album region + scene/spot/photo strings through useT()"
```

---

### Task 3: hub 快照持久化到 CacheService（§1.8 hub 快照不落地）

**Files:**
- Modify: `libs/services/pilgrimage/pilgrimage-hub-cache.ts`（加 CacheService 落地 + async hydrate + debounced write + 可注入 cache seam）
- Modify: `app/(tabs)/pilgrimage/_layout.tsx`（mount 時 fire-and-forget `hydratePilgrimageHubSnapshotFromCache()` 預熱）
- Test: `__tests__/unit/pilgrimage/pilgrimage-hub-cache.test.ts`（追加持久化測試）

**Interfaces:**
- Consumes: `CacheService.set(key, value, ttlMs): Promise<void>`（`cache-service.ts:179`，同步 `memTouch` + async SQLite）、`CacheService.getSyncWithMeta<T>(key, graceMs): { value, age, isStale } | null`（`:106`，只讀 in-memory mirror）、`CacheService.getWithMeta<T>(key, graceMs): Promise<{ value, age, isStale } | null>`（`:148`，穿透 SQLite）。
- Produces:
  - `getPilgrimageHubSnapshot(maxAgeMs?)`（既有簽名不變）— module snapshot 為 null 時，fallback 試 `cache.getSyncWithMeta(KEY, PERSIST_TTL_MS)` 播種後回傳。
  - `updatePilgrimageHubSnapshot(patch)`（既有簽名不變）— in-memory 更新後 debounce 寫入 `cache.set(KEY, snapshot, PERSIST_TTL_MS)`。
  - **NEW** `hydratePilgrimageHubSnapshotFromCache(): Promise<PilgrimageHubSnapshot | null>` — module snapshot 為 null 時 `await cache.getWithMeta(KEY, PERSIST_TTL_MS)` 播種；idempotent，`_layout` 呼叫。
  - `__resetPilgrimageHubCacheForTests({ now?, cache?, debounceMs? })` — 擴充：可注入假 cache、把 debounce 設 0。
- 隱私：`userLocation` 欄位照存（本地 SQLite，同既有 `visited`/`spot-intents` 慣例，spec 授權敘述）。

- [ ] **Step 1: 寫 failing tests（追加到 `pilgrimage-hub-cache.test.ts`）**

```ts
import { CacheService } from '../../../libs/services/cache-service';

const HUB_KEY = 'pilgrimage_hub_snapshot_v1';

function makeFakeCache() {
  const store = new Map<string, { value: unknown; ts: number; ttl: number }>();
  return {
    calls: [] as Array<{ key: string; ttl: number }>,
    set: async (key: string, value: unknown, ttlMs: number) => {
      store.set(key, { value, ts: 0, ttl: ttlMs });
    },
    getSyncWithMeta: <T,>(key: string, _grace: number) => {
      const hit = store.get(key);
      return hit ? { value: hit.value as T, age: 0, isStale: false } : null;
    },
    getWithMeta: async <T,>(key: string, _grace: number) => {
      const hit = store.get(key);
      return hit ? { value: hit.value as T, age: 0, isStale: false } : null;
    },
    seed: (value: unknown) => store.set(HUB_KEY, { value, ts: 0, ttl: 0 }),
  } as const;
}

test('updatePilgrimageHubSnapshot persists the full snapshot to the cache (debounced)', async () => {
  const cache = makeFakeCache();
  __resetPilgrimageHubCacheForTests({ now: () => 1000, cache: cache as never, debounceMs: 0 });
  updatePilgrimageHubSnapshot({ userLocation: { latitude: 25, longitude: 121 } });
  await new Promise((r) => setTimeout(r, 0)); // flush the 0ms debounce
  const persisted = cache.getSyncWithMeta<{ userLocation: { latitude: number } }>(HUB_KEY, 0);
  expect(persisted?.value.userLocation.latitude).toBe(25);
});

test('getPilgrimageHubSnapshot seeds from a warm cache mirror when module snapshot is cold', () => {
  const cache = makeFakeCache();
  cache.seed({ collectionAnimes: [], userLocation: null, updatedAt: 1000 });
  __resetPilgrimageHubCacheForTests({ now: () => 1500, cache: cache as never, debounceMs: 0 });
  const snap = getPilgrimageHubSnapshot();
  expect(snap).not.toBeNull();
  expect(Object.prototype.hasOwnProperty.call(snap ?? {}, 'collectionAnimes')).toBe(true);
});

test('hydratePilgrimageHubSnapshotFromCache seeds the module snapshot from SQLite', async () => {
  const cache = makeFakeCache();
  cache.seed({ collectionAnimes: [], updatedAt: 2000 });
  __resetPilgrimageHubCacheForTests({ now: () => 2500, cache: cache as never, debounceMs: 0 });
  const out = await hydratePilgrimageHubSnapshotFromCache();
  expect(out).not.toBeNull();
  // module snapshot now non-null → sync read returns it without touching cache
  expect(getPilgrimageHubSnapshot()).not.toBeNull();
});
```

在檔頭 import 補上 `getPilgrimageHubSnapshot, updatePilgrimageHubSnapshot, hydratePilgrimageHubSnapshotFromCache`（`__resetPilgrimageHubCacheForTests` 已於 `:4`）。若既有測試呼叫 `__resetPilgrimageHubCacheForTests()`（無參數）或 `__resetPilgrimageHubCacheForTests(() => tick)`（傳函式），保持向後相容 — 見 Step 3 的簽名。

- [ ] **Step 2: 跑測試確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/pilgrimage-hub-cache.test.ts`
Expected: 三個新 test FAIL（`hydratePilgrimageHubSnapshotFromCache` 不存在、無持久化、無 cache seam）。

- [ ] **Step 3: 實作 `pilgrimage-hub-cache.ts`**

檔頭加 import + 常數 + 可注入 cache seam：

```ts
import { CacheService } from '../cache-service';

const PILGRIMAGE_HUB_CACHE_KEY = 'pilgrimage_hub_snapshot_v1';
// 24h — a stale hub is fine (collection/location rarely change hour-to-hour);
// it only needs to survive an app restart so the user's own anime + last fix
// paint immediately instead of falling back to the bundled offline seed.
const PERSIST_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERSIST_DEBOUNCE_MS = 800;

interface HubCacheAdapter {
  set: (key: string, value: unknown, ttlMs: number) => unknown;
  getSyncWithMeta: <T>(key: string, graceMs: number) => { value: T } | null;
  getWithMeta: <T>(key: string, graceMs: number) => Promise<{ value: T } | null>;
}

const defaultCache: HubCacheAdapter = {
  set: (key, value, ttlMs) => CacheService.set(key, value, ttlMs),
  getSyncWithMeta: (key, graceMs) => CacheService.getSyncWithMeta(key, graceMs),
  getWithMeta: (key, graceMs) => CacheService.getWithMeta(key, graceMs),
};
```

module 級可變狀態改成：

```ts
let snapshot: PilgrimageHubSnapshot | null = null;
let now = () => Date.now();
let cache: HubCacheAdapter = defaultCache;
let persistDebounceMs = DEFAULT_PERSIST_DEBOUNCE_MS;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
```

`getPilgrimageHubSnapshot` 加 cold-mirror fallback（在既有 `if (!snapshot) return null;` 之前）：

```ts
export function getPilgrimageHubSnapshot(
  maxAgeMs: number = PILGRIMAGE_HUB_SNAPSHOT_TTL_MS
): PilgrimageHubSnapshot | null {
  if (!snapshot) {
    // Warm-mirror fast path: within the same session (or after _layout's
    // async hydrate primed CacheService's in-memory mirror), the persisted
    // snapshot is readable synchronously — Rule 10 frame-1 seed.
    const meta = cache.getSyncWithMeta<PilgrimageHubSnapshot>(
      PILGRIMAGE_HUB_CACHE_KEY,
      PERSIST_TTL_MS
    );
    if (meta) snapshot = normalizePersisted(meta.value);
  }
  if (!snapshot) return null;
  if (maxAgeMs >= 0 && now() - snapshot.updatedAt > maxAgeMs) return null;
  return cloneSnapshot(snapshot);
}
```

`updatePilgrimageHubSnapshot` 末端（`snapshot = base;` 之後）加 debounced persist：

```ts
  base.updatedAt = now();
  snapshot = base;
  schedulePersist();
}

function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (snapshot) cache.set(PILGRIMAGE_HUB_CACHE_KEY, snapshot, PERSIST_TTL_MS);
  }, persistDebounceMs);
}
```

新 async hydrate：

```ts
/**
 * Async seed of the module snapshot from persisted SQLite. Called from the
 * pilgrimage _layout on mount so the module snapshot is warm before the hub /
 * map screen reads it synchronously. No-op once a snapshot exists this session
 * (never clobbers live data).
 */
export async function hydratePilgrimageHubSnapshotFromCache(): Promise<PilgrimageHubSnapshot | null> {
  if (snapshot) return cloneSnapshot(snapshot);
  try {
    const meta = await cache.getWithMeta<PilgrimageHubSnapshot>(
      PILGRIMAGE_HUB_CACHE_KEY,
      PERSIST_TTL_MS
    );
    if (meta && !snapshot) snapshot = normalizePersisted(meta.value);
  } catch {
    // best-effort — a cold hub just falls back to the bundled offline seed
  }
  return snapshot ? cloneSnapshot(snapshot) : null;
}

// Persisted JSON has no methods and may be from an older shape — pass it
// through cloneSnapshot so only known slices survive and updatedAt is sane.
function normalizePersisted(raw: PilgrimageHubSnapshot): PilgrimageHubSnapshot {
  return cloneSnapshot({ ...raw, updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now() });
}
```

`__resetPilgrimageHubCacheForTests` 擴充（向後相容既有兩種呼法）：

```ts
export function __resetPilgrimageHubCacheForTests(
  arg:
    | (() => number)
    | { now?: () => number; cache?: HubCacheAdapter; debounceMs?: number } = () => Date.now()
): void {
  snapshot = null;
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (typeof arg === 'function') {
    now = arg;
    cache = defaultCache;
    persistDebounceMs = DEFAULT_PERSIST_DEBOUNCE_MS;
    return;
  }
  now = arg.now ?? (() => Date.now());
  cache = arg.cache ?? defaultCache;
  persistDebounceMs = arg.debounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS;
}
```

- [ ] **Step 4: 預熱 — `_layout.tsx` mount 時 hydrate**

`app/(tabs)/pilgrimage/_layout.tsx` 改成 fire-and-forget 一次：

```tsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { hydratePilgrimageHubSnapshotFromCache } from '../../../libs/services/pilgrimage/pilgrimage-hub-cache';

export default function PilgrimageLayout() {
  useEffect(() => {
    // Warm the module snapshot from SQLite before the hub / map screen reads
    // it synchronously (CLAUDE.md Rule 10 — silent upgrade, never a skeleton).
    hydratePilgrimageHubSnapshotFromCache().catch(() => undefined);
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

（保留原檔的說明註解。）

- [ ] **Step 5: 驗證**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/pilgrimage-hub-cache.test.ts && bun run test:unit && bunx tsc --noEmit`
Expected: 全綠（含既有 hub-cache 測試 — 無參數 / 傳函式的 `__reset` 呼法仍相容）。

- [ ] **Step 6: Commit**

```bash
git add libs/services/pilgrimage/pilgrimage-hub-cache.ts 'app/(tabs)/pilgrimage/_layout.tsx' __tests__/unit/pilgrimage/pilgrimage-hub-cache.test.ts
git commit -m "feat(pilgrimage): persist hub snapshot to CacheService (24h TTL, debounced write, _layout hydrate)"
```

---

### Task 4: index.tsx 狀態瘦身 → `usePilgrimageHubScreenData`（6.1a）

**目標：** hub `index.tsx` root useState 從 10 降到 **1**（僅留 `sortKey` 這個 view 控制，Rule 9），資料/effect 全進新 hook。對照 `[animeId].tsx`（route shell + feature hooks）與 `usePilgrimageHubData`（map 的同類 hook）。**機械搬移、不改行為。**

**狀態盤點（逐行 → 目的地）：**

| index.tsx 行 | state | 目的地 |
|---|---|---|
| `:145` `initialSnapshot` | hook 內部一次性 `useState(() => getPilgrimageHubSnapshot())` |
| `:149` `collectionAnimes`/`setCollectionAnimes` | hook |
| `:156` `featuredAnimes`/`setFeaturedAnimes` | hook |
| `:161` `collectionLoading` | hook（併入 `loading`） |
| `:166` `featuredLoading` | hook（併入 `loading`） |
| `:167` `visited`（`setVisited` 從未呼叫，delta #1）| hook（seed-only，回傳唯讀 `visited`） |
| `:170` `spotIntents`（`setSpotIntents` 從未呼叫）| hook（seed-only，回傳唯讀 `spotIntents`） |
| `:171` `userLocation`/`setUserLocation` | hook |
| `:174` `error`/`setError` | hook |
| `:175` `sortKey`/`setSortKey` | **留在 screen**（view 控制，SortPill） |

| index.tsx effect | 目的地 |
|---|---|
| `:206` collection load `useEffect` | hook |
| `:225` collection focus refresh `useFocusEffect` | hook |
| `:241` featured `/lite` streaming `useEffect` | hook |
| `:328` `updatePilgrimageHubSnapshot({ visited })` once `useEffect` | hook |
| `:335` `getCurrentLocation` `useEffect` | hook |
| `:541` `useSyncExternalStore`（anitabi index version）| **留在 screen**（88 rail 用） |

**Files:**
- Create: `hooks/usePilgrimageHubScreenData.ts`
- Modify: `app/(tabs)/pilgrimage/index.tsx`（刪上表 9 個 root state + 5 個 effect + `refreshCollectionAnimes`，改讀 hook；留 `sortKey` 與所有 derived memo / handler / 88 rail 狀態）

**Interfaces:**
- Consumes（既有）：`collectionPilgrimageService.getEntries()`、`buildPilgrimageCollectionState(entries)`、`mergePilgrimageAnimeList`（Task 1 保留）、`pilgrimageRepository.getSpotsByBangumiId(id)`、`loadVisitedSpotsSync()`、`loadSpotIntentsSync()`、`locationService.getCurrentLocation()`、`getPilgrimageHubSnapshot()` / `updatePilgrimageHubSnapshot()`（Task 3 落地後行為相容）、`buildSeededPilgrimageAnimes(ids)`、`FEATURED_PILGRIMAGE_ANIME`、`useT()`。
- Produces:

```ts
export interface UsePilgrimageHubScreenData {
  collectionAnimes: AnitabiBangumi[];
  featuredAnimes: AnitabiBangumi[];
  loading: boolean;              // collectionLoading || featuredLoading
  error: string | null;
  visited: VisitedMap;           // MMKV-seeded, read-only this screen
  spotIntents: SpotIntentMap;    // MMKV-seeded, read-only this screen
  userLocation: LatLng | null;
}
export function usePilgrimageHubScreenData(): UsePilgrimageHubScreenData;
```

- [ ] **Step 1: 跑 baseline 確認全綠**

Run: `bun run test:unit`
Expected: 全綠（機械重構，靠既有測試 + tsc 當回歸網；hub screen 本身無 unit 測試，同 Phase 0 plan Task 9 的先例）。

- [ ] **Step 2: 建 `hooks/usePilgrimageHubScreenData.ts`（原樣搬入 index.tsx 的資料邏輯）**

把 index.tsx `:145-351` 的 9 個 data state + `refreshCollectionAnimes`（`:179-204`）+ 五個 effect（`:206,:225,:241,:328,:335`）**逐字**搬進 hook，`t` 用 hook 內 `const t = useT();`。骨架（內容沿用原 index.tsx，勿改邏輯）：

```ts
// usePilgrimageHubScreenData — data cluster for the pilgrimage hub list screen
// (app/(tabs)/pilgrimage/index.tsx). Mirrors usePilgrimageHubData (the map's
// sibling): owns the snapshot/offline-index seed, the collection + featured
// /lite backfill, MMKV-seeded visited/spot-intents, and the location fix, so
// the route file stays a view orchestrator (CLAUDE.md Rule 9). View controls
// (sort key) stay in the screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../libs/services/pilgrimage/collection-pilgrimage-service';
import { locationService, type LatLng } from '../libs/services/pilgrimage/location-service';
import { loadVisitedSpotsSync, type VisitedMap } from '../libs/services/pilgrimage/visited-prefs';
import { loadSpotIntentsSync, type SpotIntentMap } from '../libs/services/pilgrimage/spot-intents';
import {
  getPilgrimageHubSnapshot,
  updatePilgrimageHubSnapshot,
  type PilgrimageHubSnapshot,
} from '../libs/services/pilgrimage/pilgrimage-hub-cache';
import { buildSeededPilgrimageAnimes } from '../libs/services/pilgrimage/pilgrimage-screen-state';
import { buildPilgrimageCollectionState } from '../libs/services/pilgrimage/pilgrimage-hub-collection-state';
import type { AnitabiBangumi } from '../libs/services/pilgrimage/types';
import { useT } from '../libs/i18n';

export interface UsePilgrimageHubScreenData {
  collectionAnimes: AnitabiBangumi[];
  featuredAnimes: AnitabiBangumi[];
  loading: boolean;
  error: string | null;
  visited: VisitedMap;
  spotIntents: SpotIntentMap;
  userLocation: LatLng | null;
}

function hasSnapshotSlice<K extends keyof PilgrimageHubSnapshot>(
  snapshot: PilgrimageHubSnapshot | null,
  key: K
): boolean {
  return !!snapshot && Object.prototype.hasOwnProperty.call(snapshot, key);
}

function buildSeededFeatured(): AnitabiBangumi[] {
  return buildSeededPilgrimageAnimes(FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId));
}

export function usePilgrimageHubScreenData(): UsePilgrimageHubScreenData {
  const t = useT();
  const [initialSnapshot] = useState(() => getPilgrimageHubSnapshot());
  const hasInitialCollection = hasSnapshotSlice(initialSnapshot, 'collectionAnimes');
  const hasInitialFeatured = hasSnapshotSlice(initialSnapshot, 'featuredAnimes');
  // …(逐字搬入 index.tsx :149-351 的 state + refreshCollectionAnimes + 5 effects)…
  const loading = collectionLoading || featuredLoading;
  return { collectionAnimes, featuredAnimes, loading, error, visited, spotIntents, userLocation };
}
```

搬移守則：`hasInitialCollection`/`hasInitialFeatured` 與 `buildSeededFeatured`/`hasSnapshotSlice` 一併搬進 hook（index.tsx `:127-136,:146-147` 那些 helper 只服務資料邏輯）。`visited`/`spotIntents` 用 `useState(seed)` 但**不回傳 setter**（seed-only，delta #1 已證 setter 從未被呼叫）。

- [ ] **Step 3: 改 `index.tsx` 消費 hook**

- 刪 `:145-351` 全部 data state + `refreshCollectionAnimes` + 五個 effect + `hasSnapshotSlice`/`buildSeededFeatured`/`initialSnapshot`/`hasInitial*` 等 helper。
- 在元件頂部（`sortKey` 附近）改成：

```ts
  const { collectionAnimes, featuredAnimes, loading, error, visited, spotIntents, userLocation } =
    usePilgrimageHubScreenData();
  const [sortKey, setSortKey] = useState<PilgrimageSortKey>(DEFAULT_PILGRIMAGE_SORT_KEY);
```

- 保留 `:353` 之後所有 derived memo（`animeCards`、`allSpots`、`nearby`、`featuredSpots`、`sortedCollectionAnimes`、`collectionDistanceKm`、`popularList`、88 rail 的 `tourism88Entries`/`anitabiIndexVersion`/`tourism88Covers`/`collectionBangumiIds`）與所有 handler、JSX — 它們照舊消費上面解構出來的值。
- 清理 import：移掉只給被搬走邏輯用的 import（`useFocusEffect`、`pilgrimageRepository`、`FEATURED_PILGRIMAGE_ANIME`、`collectionPilgrimageService`、`locationService` 若 screen 其他處仍用則保留 — `allSpots`/`animeCards`/`collectionDistanceKm` 用 `locationService.getDistanceKm`，故 `locationService` **保留**；`loadVisitedSpotsSync`/`loadSpotIntentsSync`/`buildPilgrimageCollectionState`/`getPilgrimageHubSnapshot`/`updatePilgrimageHubSnapshot`/`buildSeededPilgrimageAnimes` 移除）。`useRef`/`useCallback` 若 screen 其餘 handler 仍用則保留。加 `import { usePilgrimageHubScreenData } from '../../../hooks/usePilgrimageHubScreenData';`。

- [ ] **Step 4: 驗證**

Run: `bun run test:unit && bunx tsc --noEmit`
Expected: 全綠、無新 TS 錯誤、無 unused import。root useState 只剩 `sortKey`（`grep -nE "useState" 'app/(tabs)/pilgrimage/index.tsx'` 在元件本體僅 1 個）。

- [ ] **Step 5: Commit**

```bash
git add hooks/usePilgrimageHubScreenData.ts 'app/(tabs)/pilgrimage/index.tsx'
git commit -m "refactor(pilgrimage): lift hub list data/effects into usePilgrimageHubScreenData (10→1 root useState)"
```

---

### Task 5: map.tsx 狀態瘦身 → `usePilgrimageMapScreenState`（6.1b）

**目標：** hub `map.tsx` root useState 從 14（Task 1 刪 `sheetIndex` 後 13）降到 **6**，把 view 控制群抽進新 hook。**機械搬移、不改行為。**

**狀態盤點（逐行 → 目的地；`sheetIndex` 已於 Task 1 刪）：**

| map.tsx 行 | state | 目的地 |
|---|---|---|
| `:198` `styleOverride` | 留 screen（map style） |
| `:206` `initialSnapshot` | 留 screen（frame-1 camera seed） |
| `:211` `mapViewMode` | **hook**（+ `persistMapViewMode`） |
| `:219` `initialUserLocation` | 留 screen（seed） |
| `:258` `initialView` | 留 screen（seed） |
| `:295` `searchQuery`（+ `useDeferredValue`）| **hook** |
| `:299` `hubFilter` | **hook**（seed 自 route `filter` param） |
| `:303` `listLayout` | **hook** |
| `:306` `selectedRegions` | **hook** |
| `:309` `flyTick` | **hook** |
| `:312` `mapLoadFailed` | 留 screen（map load） |
| `:313` `mapReloadKey` | 留 screen（map reload） |
| `:317` `focusedAnimeId` | **hook**（+ `setFocusedAnimeId`） |

搬 7 個 → 剩 6 個 root useState（`styleOverride`/`initialSnapshot`/`initialUserLocation`/`initialView`/`mapLoadFailed`/`mapReloadKey`）。

| map.tsx effect | 目的地 |
|---|---|
| `:199` `subscribeMapStyleOverride` | 留 screen |
| `:250` `userLocation → snapshot` | 留 screen |
| `:426` reset `focusedAnimeId`（消費 screen 端 `filteredEntries`）| 留 screen（呼叫 hook 的 `setFocusedAnimeId`） |
| `:682` fly to focused anime（Rule 9 imperative）| 留 screen |
| `:690` fly to user location | 留 screen |
| `:695` auto permission prompt | 留 screen |
| `:707` fly to region bounds | 留 screen |

純 view handler 搬進 hook：`handleSearchChange`（`:588`）、`handleSearchClear`（`:589`）、`handlePickFilter`（`:594`）、`handlePickLayout`（`:599`）、`handlePickRegion`（`:511`）、`handleResetToJapan`（`:522`）、`persistMapViewMode`（`:604`）。留 screen：`handleSwapFocused`（`:433`，需 `filteredEntries`）、`handleSwitchMapViewMode`（`:624`，需 fly/permission）。

**Files:**
- Create: `hooks/usePilgrimageMapScreenState.ts`
- Modify: `app/(tabs)/pilgrimage/map.tsx`（刪 7 個 view state + 7 個 view handler，改讀 hook；`HubFilter` type 從 hook import）

**Interfaces:**
- Consumes（既有）：`getStringParam(params, 'filter')`、`AnimeTourism88Region`、`PilgrimageMapViewMode`、`setPilgrimageMapViewMode(next)`、`loadPilgrimageMapViewModeSync`、`Haptics.selectionAsync`、`useDeferredValue`。
- Produces:

```ts
export type HubFilter = 'all' | 'collection' | 'official88';

export interface UsePilgrimageMapScreenStateParams {
  initialFilter: HubFilter;              // seeded from route `filter` param
  initialFocusBangumiId: number | null;  // route `focus` param
}
export interface UsePilgrimageMapScreenState {
  searchQuery: string;
  deferredSearchQuery: string;
  hubFilter: HubFilter;
  listLayout: 'grid' | 'rows';
  selectedRegions: ReadonlySet<AnimeTourism88Region>;
  flyTick: number;
  focusedAnimeId: number | null;
  mapViewMode: PilgrimageMapViewMode;
  setFocusedAnimeId: (updater: number | null | ((cur: number | null) => number | null)) => void;
  persistMapViewMode: (next: PilgrimageMapViewMode) => void;
  handleSearchChange: (text: string) => void;
  handleSearchClear: () => void;
  handlePickFilter: (next: HubFilter) => void;
  handlePickLayout: (next: 'grid' | 'rows') => void;
  handlePickRegion: (region: AnimeTourism88Region) => void;
  handleResetToJapan: () => void;
}
export function usePilgrimageMapScreenState(
  params: UsePilgrimageMapScreenStateParams
): UsePilgrimageMapScreenState;
```

`PilgrimageHubSheet` 的 `filterMode` prop 型別是 `'all' | 'collection' | 'official88'`，與 `HubFilter` 結構相同 — 傳 `hubFilter` 不需改 sheet。

- [ ] **Step 1: 跑 baseline 確認全綠**

Run: `bun run test:unit`
Expected: 全綠（Task 1 已落地；機械重構靠 tsc + 既有測試當回歸網）。

- [ ] **Step 2: 建 `hooks/usePilgrimageMapScreenState.ts`（逐字搬入 view 控制）**

```ts
// usePilgrimageMapScreenState — parent-owned view controls for the hub map
// screen (app/(tabs)/pilgrimage/map.tsx): search / filter / layout / region /
// focused card / view-mode. Lifted out so the route file stays a view
// orchestrator (CLAUDE.md Rule 9). Derived memos (hubEntries, filteredEntries,
// markers, stats, focusedAnime) + the imperative camera effects stay in the
// screen and consume these outputs where the local state used to live.
import { useCallback, useDeferredValue, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { AnimeTourism88Region } from '../libs/services/pilgrimage/anime88-repository';
import {
  setPilgrimageMapViewMode,
  loadPilgrimageMapViewModeSync,
  type PilgrimageMapViewMode,
} from '../libs/services/pilgrimage/map-view-mode-prefs';

export type HubFilter = 'all' | 'collection' | 'official88';
// …params + return interface (見 Interfaces)…

export function usePilgrimageMapScreenState({
  initialFilter,
  initialFocusBangumiId,
}: UsePilgrimageMapScreenStateParams): UsePilgrimageMapScreenState {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [hubFilter, setHubFilter] = useState<HubFilter>(initialFilter);
  const [listLayout, setListLayout] = useState<'grid' | 'rows'>('rows');
  const [selectedRegions, setSelectedRegions] = useState<ReadonlySet<AnimeTourism88Region>>(
    () => new Set()
  );
  const [flyTick, setFlyTick] = useState(0);
  const [focusedAnimeId, setFocusedAnimeId] = useState<number | null>(initialFocusBangumiId);
  const [mapViewMode, setMapViewModeState] = useState<PilgrimageMapViewMode>(
    loadPilgrimageMapViewModeSync
  );

  const persistMapViewMode = useCallback((next: PilgrimageMapViewMode) => {
    setMapViewModeState(next);
    setPilgrimageMapViewMode(next).catch(() => undefined);
  }, []);
  const handleSearchChange = useCallback((text: string) => setSearchQuery(text), []);
  const handleSearchClear = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setSearchQuery('');
  }, []);
  const handlePickFilter = useCallback((next: HubFilter) => {
    Haptics.selectionAsync().catch(() => undefined);
    setHubFilter(next);
  }, []);
  const handlePickLayout = useCallback((next: 'grid' | 'rows') => {
    Haptics.selectionAsync().catch(() => undefined);
    setListLayout(next);
  }, []);
  const handlePickRegion = useCallback((region: AnimeTourism88Region) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedRegions((cur) => {
      const next = new Set(cur);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
    setFlyTick((tk) => tk + 1);
  }, []);
  const handleResetToJapan = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedRegions((cur) => (cur.size === 0 ? cur : new Set()));
    setFlyTick((tk) => tk + 1);
  }, []);

  return {
    searchQuery, deferredSearchQuery, hubFilter, listLayout, selectedRegions, flyTick,
    focusedAnimeId, mapViewMode, setFocusedAnimeId, persistMapViewMode,
    handleSearchChange, handleSearchClear, handlePickFilter, handlePickLayout,
    handlePickRegion, handleResetToJapan,
  };
}
```

- [ ] **Step 3: 改 `map.tsx` 消費 hook**

- 刪 `:295-309`、`:317`、`:211` 的 7 個 view state；刪 `:588-602`、`:511-526`、`:604-607` 的 7 個 view handler；刪 map.tsx 本地的 `type HubFilter`（`:174`，改從 hook import）。
- 在 `initialView`（`:258`）之後插入：

```ts
  const initialHubFilter = useMemo<HubFilter>(() => {
    const raw = getStringParam(params, 'filter');
    return raw === 'collection' || raw === 'official88' ? raw : 'all';
  }, [params]);
  const {
    searchQuery, deferredSearchQuery, hubFilter, listLayout, selectedRegions, flyTick,
    focusedAnimeId, mapViewMode, setFocusedAnimeId, persistMapViewMode,
    handleSearchChange, handleSearchClear, handlePickFilter, handlePickLayout,
    handlePickRegion, handleResetToJapan,
  } = usePilgrimageMapScreenState({
    initialFilter: initialHubFilter,
    initialFocusBangumiId: focusBangumiIdParam,
  });
```

- import 加 `import { usePilgrimageMapScreenState, type HubFilter } from '../../../hooks/usePilgrimageMapScreenState';`；移掉 map.tsx 對 `useDeferredValue`（改由 hook 用）、`loadPilgrimageMapViewModeSync`/`setPilgrimageMapViewMode`/`PilgrimageMapViewMode`（若 screen 其餘處仍用 `PilgrimageMapViewMode` 型別 — `handleSwitchMapViewMode` 的 `next: PilgrimageMapViewMode` 用它 → **保留 type import**，移除 `loadPilgrimageMapViewModeSync`/`setPilgrimageMapViewMode`）。
- 保留並不動：`handleSwapFocused`（`:433`）改讀解構出的 `filteredEntries`+`setFocusedAnimeId`（原本就用這兩者，只是來源改成 hook）；reset-focused effect（`:426`）同理；`handleSwitchMapViewMode`（Task 1 已改）改用 `mapViewMode`+`persistMapViewMode`。所有 derived memo（`hubEntries`/`filteredEntries`/`markers`/`stats`/`focusedAnime`/`flyBoundsRequest`/`filterCounts` 等）與 JSX 照舊消費解構值。

- [ ] **Step 4: 驗證**

Run: `bun run test:unit && bunx tsc --noEmit`
Expected: 全綠、無新 TS 錯誤。root useState 剩 6（`grep -nE "= useState" 'app/(tabs)/pilgrimage/map.tsx'` 在元件本體 6 個：`styleOverride`/`initialSnapshot`/`initialUserLocation`/`initialView`/`mapLoadFailed`/`mapReloadKey`）。

- [ ] **Step 5: Commit**

```bash
git add hooks/usePilgrimageMapScreenState.ts 'app/(tabs)/pilgrimage/map.tsx'
git commit -m "refactor(pilgrimage): lift hub map view controls into usePilgrimageMapScreenState (13→6 root useState)"
```

---

### Task 6: detail 距離分組 — `groupSpotsIntoAreas` + section headers（6.3）

**目標：** 600 點的動漫 detail list 從一片平面清單變成「區域 section」。純函式 `groupSpotsIntoAreas` grid-cluster；DetailSheet 的 **rows 模式**加誠實 section header（`區域 {index}（{count} 點）`，不假造地名，Rule 8）；點 header → 切到 map 視圖並 `fitBounds` 該區（透傳 handle）。

**Files:**
- Create: `libs/services/pilgrimage/spot-areas.ts`
- Test: `__tests__/unit/pilgrimage/spot-areas.test.ts`（新檔）
- Modify: `libs/i18n/locales/en.json` / `zh-Hant.json`（`pilgrimage.detail.areaLabel` — Task 2 已加，這裡確認）
- Modify: `components/pilgrimage/detail/SpotMapView.tsx`（handle 加 `fitBounds`）
- Modify: `components/pilgrimage/detail/PilgrimageDetailSheet.tsx`（rows 模式插 area section header + `onAreaPress` prop）
- Modify: `app/(tabs)/pilgrimage/[animeId].tsx`（傳 `onAreaPress` → `spotMapRef.fitBounds` + `setView({ viewMode: 'map' })`）

**Interfaces:**
- Consumes（既有）：`AnitabiSpot`（`types.ts:87`，`{ id, name, cn?, geo:[lat,lng], image, scenes }`）、`MapSurfaceHandle.fitBounds?(box, opts?)`（`map-engine/types.ts:98`；delta #3：`SpotMapViewHandle` 目前無 `fitBounds`，本 task 透傳）、`SpotSheet`/`SpotMapView` ref 慣例。
- Produces:

```ts
export interface SpotAreaBounds { south: number; west: number; north: number; east: number; }
export interface SpotArea {
  id: string;                          // `area:${gridKey}` — stable, not a place name
  center: { lat: number; lng: number };
  bounds: SpotAreaBounds;              // fed to MapSurfaceHandle.fitBounds (structurally BBox)
  spots: AnitabiSpot[];                // input order preserved within an area
}
export function groupSpotsIntoAreas(
  spots: readonly AnitabiSpot[],
  opts?: { cellKm?: number }           // default 2
): SpotArea[];
```
`SpotMapViewHandle` 新增 `fitBounds: (box, opts?) => void`。`PilgrimageDetailSheetProps` 新增 `onAreaPress?: (area: SpotArea) => void`。

- [ ] **Step 1: 寫 failing tests（`spot-areas.test.ts`）**

```ts
import { describe, expect, test } from 'bun:test';
import { groupSpotsIntoAreas } from '../../../libs/services/pilgrimage/spot-areas';
import type { AnitabiSpot } from '../../../libs/services/pilgrimage/types';

function spot(id: string, lat: number, lng: number): AnitabiSpot {
  return { id, name: id, geo: [lat, lng], image: `https://x/${id}.jpg`, scenes: [] };
}

describe('groupSpotsIntoAreas', () => {
  test('collapses spots within one cell into a single area', () => {
    // ~200m apart at lat 35 — well inside a 2km cell
    const areas = groupSpotsIntoAreas([spot('a', 35.0000, 139.0000), spot('b', 35.0018, 139.0018)]);
    expect(areas).toHaveLength(1);
    expect(areas[0].spots.map((s) => s.id)).toEqual(['a', 'b']);
  });

  test('splits spots that fall in different cells', () => {
    const areas = groupSpotsIntoAreas([spot('a', 35.0, 139.0), spot('z', 35.9, 139.9)]);
    expect(areas).toHaveLength(2);
  });

  test('preserves input order for area ordering (first appearance wins)', () => {
    const areas = groupSpotsIntoAreas([spot('far', 35.9, 139.9), spot('near', 35.0, 139.0)]);
    expect(areas[0].spots[0].id).toBe('far');
  });

  test('computes bounds enclosing every spot in the area', () => {
    const areas = groupSpotsIntoAreas([spot('a', 35.0, 139.0), spot('b', 35.0018, 139.0018)]);
    const b = areas[0].bounds;
    expect(b.south).toBeCloseTo(35.0, 4);
    expect(b.north).toBeCloseTo(35.0018, 4);
    expect(b.west).toBeCloseTo(139.0, 4);
    expect(b.east).toBeCloseTo(139.0018, 4);
  });

  test('drops spots with no usable geo and returns [] for empty input', () => {
    expect(groupSpotsIntoAreas([])).toEqual([]);
    const areas = groupSpotsIntoAreas([spot('nogeo', 0, 0), spot('ok', 35.0, 139.0)]);
    expect(areas).toHaveLength(1);
    expect(areas[0].spots[0].id).toBe('ok');
  });

  test('cellKm widens buckets (two 3km-apart spots merge at cellKm=5)', () => {
    const a = groupSpotsIntoAreas([spot('a', 35.0, 139.0), spot('b', 35.027, 139.0)]);
    const b = groupSpotsIntoAreas([spot('a', 35.0, 139.0), spot('b', 35.027, 139.0)], { cellKm: 5 });
    expect(a.length).toBe(2);
    expect(b.length).toBe(1);
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-areas.test.ts`
Expected: FAIL — Cannot find module `spot-areas`。

- [ ] **Step 3: 實作 `spot-areas.ts`**

```ts
// Grid-cluster AnitabiSpots into geographic areas for the detail list's
// "○○一帶" sections. Honest by construction (CLAUDE.md Rule 8): an area carries
// no place name — the caller labels it "Area N (count)". A ~cellKm grid bucket
// is enough to make a 600-point anime feel like a handful of neighbourhoods.
import type { AnitabiSpot } from './types';

export interface SpotAreaBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}
export interface SpotArea {
  id: string;
  center: { lat: number; lng: number };
  bounds: SpotAreaBounds;
  spots: AnitabiSpot[];
}

const KM_PER_DEG_LAT = 111;

function hasGeo(geo: readonly [number, number]): boolean {
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

export function groupSpotsIntoAreas(
  spots: readonly AnitabiSpot[],
  opts: { cellKm?: number } = {}
): SpotArea[] {
  const cellKm = opts.cellKm ?? 2;
  const stepDeg = cellKm / KM_PER_DEG_LAT;
  const order: string[] = [];
  const buckets = new Map<string, AnitabiSpot[]>();

  for (const s of spots) {
    if (!hasGeo(s.geo)) continue;
    const [lat, lng] = s.geo;
    // cos-correct lng so a 2km cell is ~2km E–W too (not stretched at 35°N).
    const lngStep = stepDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const key = `${Math.floor(lat / stepDeg)}:${Math.floor(lng / lngStep)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(s);
    else {
      buckets.set(key, [s]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const members = buckets.get(key)!;
    let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
    let sumLat = 0, sumLng = 0;
    for (const m of members) {
      const [lat, lng] = m.geo;
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      sumLat += lat;
      sumLng += lng;
    }
    return {
      id: `area:${key}`,
      center: { lat: sumLat / members.length, lng: sumLng / members.length },
      bounds: { south, west, north, east },
      spots: members,
    };
  });
}
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-areas.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: `SpotMapView` handle 透傳 `fitBounds`（delta #3）**

`components/pilgrimage/detail/SpotMapView.tsx`：
- `SpotMapViewHandle`（`:25-31`）加：

```ts
  /** Fit the camera to a bounding box (used by the detail list's area jump). */
  fitBounds: (box: { south: number; west: number; north: number; east: number }, opts?: { animate?: boolean }) => void;
```

- `useImperativeHandle`（`:124-131`）加一行：

```ts
      fitBounds: (box, opts) => maplibreRef.current?.fitBounds?.(box, opts),
```

（`maplibreRef` 是內層 `MapSurface`，其 handle 已有 `fitBounds?`。）

- [ ] **Step 6: `PilgrimageDetailSheet` — rows 模式插 area section header**

`components/pilgrimage/detail/PilgrimageDetailSheet.tsx`：
- import：`import { groupSpotsIntoAreas, type SpotArea } from '../../../libs/services/pilgrimage/spot-areas';`
- props 介面加 `onAreaPress?: (area: SpotArea) => void;`（同步加進 `areEqual`：`prev.onAreaPress === next.onAreaPress &&`）。
- 在 `renderRow` 附近建 rows 模式的分節資料 + renderer。只在 **rows 且區數 ≥ 2** 時分節（否則維持原本平面清單，grid 模式完全不動）：

```ts
  type RowItem = { kind: 'header'; area: SpotArea } | { kind: 'spot'; spot: AnitabiSpot };

  const rowData = useMemo<RowItem[]>(() => {
    if (listLayout !== 'rows') return [];
    const areas = groupSpotsIntoAreas(filteredGroupedSpots);
    if (areas.length < 2) {
      return filteredGroupedSpots.map((spot) => ({ kind: 'spot', spot }) as RowItem);
    }
    const out: RowItem[] = [];
    areas.forEach((area) => {
      out.push({ kind: 'header', area });
      for (const spot of area.spots) out.push({ kind: 'spot', spot });
    });
    return out;
  }, [listLayout, filteredGroupedSpots]);

  const renderRowItem = useCallback(
    ({ item }: { item: RowItem }, index: number) => {
      if (item.kind === 'header') {
        const label = t('pilgrimage.detail.areaLabel', {
          index: index === 0 ? 1 : rowData.slice(0, index).filter((r) => r.kind === 'header').length + 1,
          count: item.area.spots.length,
        });
        return (
          <Pressable
            onPress={() => onAreaPress?.(item.area)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.areaHeader, pressed && { opacity: 0.7 }]}>
            <ThemedText variant="titleSmall" weight="800">{label}</ThemedText>
            <Ionicons name="map-outline" size={15} color={theme.text.tertiary} />
          </Pressable>
        );
      }
      return renderRow({ item: item.spot });
    },
    [onAreaPress, renderRow, rowData, styles.areaHeader, t, theme.text.tertiary]
  );
```

- `BottomSheetFlatList`（`:388-400`）在 rows 模式改用 `rowData` + `renderRowItem`；grid 模式維持原 `filteredGroupedSpots` + `renderTile`：

```tsx
      <BottomSheetFlatList
        key={listKey}
        data={(listLayout === 'grid' ? (filteredGroupedSpots as AnitabiSpot[]) : rowData) as readonly unknown[] as never[]}
        keyExtractor={(item: unknown, index: number) =>
          listLayout === 'grid'
            ? (item as AnitabiSpot).id
            : (item as RowItem).kind === 'header'
              ? `h:${(item as { area: SpotArea }).area.id}`
              : `s:${((item as { spot: AnitabiSpot }).spot).id}`
        }
        renderItem={
          listLayout === 'grid'
            ? (renderTile as never)
            : (({ item, index }: { item: RowItem; index: number }) => renderRowItem({ item }, index)) as never
        }
        numColumns={numColumns}
        ListHeaderComponent={headerNode}
        ListEmptyComponent={emptyNode}
        ListFooterComponent={footerNode}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sheetContent}
        columnWrapperStyle={listLayout === 'grid' ? styles.gridRow : undefined}
      />
```

（`numColumns` 在 rows 模式為 1，header 佔滿一列，安全。若 TS 對 `data`/`renderItem` 的聯合型別不滿意，用上面的 `as never` 收斂 — gorhom 的 `BottomSheetFlatList` 泛型較鬆，取務實最小改動。）
- styles 加 `areaHeader`：

```ts
    areaHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
```

（`Ionicons` 已 import `:24`；`titleSmall` 若非 `ThemedText` variant，改用既有的 `titleMedium`。）

- [ ] **Step 7: `[animeId].tsx` 接 `onAreaPress`**

在 `handleViewPresetChange` 附近新增：

```ts
  const handleAreaPress = useCallback(
    (area: import('../../../libs/services/pilgrimage/spot-areas').SpotArea) => {
      Haptics.selectionAsync().catch(() => undefined);
      setView({ viewMode: 'map' }); // peek the sheet so the map is dominant
      spotMapRef.current?.fitBounds(area.bounds, { animate: true });
    },
    [setView]
  );
```

`<PilgrimageDetailSheet ... />`（`:800-829`）加 `onAreaPress={handleAreaPress}`。

- [ ] **Step 8: 驗證**

Run: `bun run test:unit && bunx tsc --noEmit`
Expected: 全綠。i18n parity 認得 `pilgrimage.detail.areaLabel`（Task 2 已加雙語）。模擬器（可延後）：detail rows 模式出現「區域 1（12 點）」等 section header；點 header → 切 map 視圖並框住該區。

- [ ] **Step 9: Commit**

```bash
git add libs/services/pilgrimage/spot-areas.ts __tests__/unit/pilgrimage/spot-areas.test.ts components/pilgrimage/detail/SpotMapView.tsx components/pilgrimage/detail/PilgrimageDetailSheet.tsx 'app/(tabs)/pilgrimage/[animeId].tsx'
git commit -m "feat(pilgrimage): group detail spots into distance areas — list section headers jump the map (fitBounds)"
```

---

### Task 7: hub 資訊架構重排（6.2）— **blocked-on Phase 2 + Phase 3**

**目標：** hub `index.tsx` 順序改為 ①最近聖地 hero（Phase 2 真資料卡）②「我的巡禮」rail（有 visited/captures 進度的收藏動漫，誠實計數）③附近動漫 rail（既有）④探索區（featured / Tourism88 降級收此區）。刪假網格 `NearbyHero`（`:791-856` 的 grid + 散點 pin）與 `FeaturedSpotRow.miniMap`（`:1096-1102`）。per-anime accent 用 `anime.color || theme.accent`（先例 `map.tsx:469`；`AnitabiBangumi.color` 為 `string`，空字串由 `||` 兜底）。

**依賴（執行時若未落地，對應 sub-step 標 blocked-on 並保留誠實 fallback）：**
- **Phase 2**（spec 2.3/2.4）— 最近聖地 hero 的真資料。**delta #2**：實際函式是 `buildNearbySpots`（`libs/services/pilgrimage/nearby-spots.ts:58`）+ 復活的 `NearbySpotsSheet.tsx`，**不是** outline 說的 `getSpotsNear`。Interfaces 以這兩者標 Consumes（blocked-on Phase 2）。未落地時：hero 退回顯示「最近的收藏/featured 動漫」的既有 `nearestAnime` 資料（真距離、真標題、真 cover），**但移除假 grid/散點 pin** — 即「純資料 hero，無假地圖」。
- **Phase 3**（spec 3.1/3.3）— 「我的巡禮」進度的 visited/captures v2。誠實計數規則（Rule 8）：`✓{visitedCount}` 用 `visited` ∩ 該動漫 detail points；分母用「CacheService 快取的該動漫 detail points 總數（打卡必經 detail，資料必在）」的真值，**無快取 → 只顯示 ✓ 數不顯示分母**（litePoints 是抽樣，不可當分母，Rule 8）。未落地時：用既有 `PopularCard` 的 `visitedCount = litePoints ∩ visited` 當 ✓ 計數（僅 ✓ 數、不顯示分母）。

**Files:**
- Modify: `app/(tabs)/pilgrimage/index.tsx`（刪 `NearbyHero` 的假 grid/pin JSX + styles `heroGrid`/`gridLineV`/`gridLineH`/`roadPath`/`satPin`/`primaryPin`；刪 `FeaturedSpotRow.miniMap` JSX + `miniMap`/`miniMapPin` styles；重排 ScrollView 內 section 順序；「我的巡禮」rail 卡片加進度；per-anime accent 用 `anime.color`）
- Modify（blocked-on Phase 2）: `components/pilgrimage/NearbySpotsSheet.tsx` / `libs/services/pilgrimage/nearby-spots.ts`（Phase 2 復活後，hero 消費其輸出）
- Test: `__tests__/unit/pilgrimage/pilgrimage-hub-progress.test.ts`（新檔，測「誠實進度」純函式）

**Interfaces:**
- Consumes（既有，Task 4 之後）：`usePilgrimageHubScreenData()`（`collectionAnimes`/`featuredAnimes`/`visited`/`userLocation`）、`getPilgrimageAnimeTitles`、`rankFeaturedSpotsByPriority`、`Tourism88Rail`。
- Consumes（**blocked-on Phase 2**）：`buildNearbySpots(userLocation, opts)`（`nearby-spots.ts:58`）→ 最近聖地 hero 的 `{ spot, anime, distanceKm }`。
- Consumes（**blocked-on Phase 3**）：Phase 3 的 captures v2 + 每動漫 detail-points 快取（`CacheService` key，Phase 3 定案）→ 誠實分母。
- Produces: `resolveHubAnimeProgress(anime, visited, cachedDetailPointIds?): { visitedCount: number; total: number | null }` — 純函式，`total` 只在有快取 detail points 時為數字，否則 `null`（只顯示 ✓ 數）。

- [ ] **Step 1: 寫 failing test（`pilgrimage-hub-progress.test.ts`）**

```ts
import { describe, expect, test } from 'bun:test';
import { resolveHubAnimeProgress } from '../../../libs/services/pilgrimage/pilgrimage-hub-progress';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

function anime(litePointIds: string[]): AnitabiBangumi {
  return {
    id: 1, title: 'X', cn: '', city: '', cover: '', color: '#8DC5D8',
    geo: [35, 139], zoom: 12, modified: 0, pointsLength: 500,
    imagesLength: 0,
    litePoints: litePointIds.map((id) => ({ id, name: id, image: 'https://x/a.jpg', ep: 0, s: 0, geo: [35, 139] as [number, number] })),
  };
}

describe('resolveHubAnimeProgress', () => {
  test('counts visited ∩ points; total from cached detail ids when present', () => {
    const p = resolveHubAnimeProgress(anime(['a', 'b']), { a: true }, ['a', 'b', 'c', 'd']);
    expect(p.visitedCount).toBe(1);
    expect(p.total).toBe(4); // honest denominator = cached detail point count
  });
  test('no cached detail ids → total is null (show check count only, never litePoints as denominator)', () => {
    const p = resolveHubAnimeProgress(anime(['a', 'b']), { a: true, b: true });
    expect(p.visitedCount).toBe(2);
    expect(p.total).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/pilgrimage-hub-progress.test.ts`
Expected: FAIL — Cannot find module。

- [ ] **Step 3: 實作 `libs/services/pilgrimage/pilgrimage-hub-progress.ts`**

```ts
// Honest "my pilgrimage" progress for a hub collection card (CLAUDE.md Rule 8).
// visitedCount = the anime's known points that are checked in. total is the
// denominator ONLY when we hold that anime's cached detail points — litePoints
// is a sample, so it must never masquerade as the true count.
import type { AnitabiBangumi } from './types';
import type { VisitedMap } from './visited-prefs';

export function resolveHubAnimeProgress(
  anime: AnitabiBangumi,
  visited: VisitedMap,
  cachedDetailPointIds?: readonly string[] | null
): { visitedCount: number; total: number | null } {
  let visitedCount = 0;
  for (const p of anime.litePoints ?? []) {
    if (visited[p.id]) visitedCount += 1;
  }
  const total = cachedDetailPointIds && cachedDetailPointIds.length > 0 ? cachedDetailPointIds.length : null;
  return { visitedCount, total };
}
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/pilgrimage-hub-progress.test.ts`
Expected: PASS。

- [ ] **Step 5: 刪假地圖 chrome（無依賴，先做）**

`index.tsx`：
- `NearbyHero`（`:765-897`）：刪 `:791-805` 的 `heroGrid`（grid line + roadPath）、`:816-844` 的三個 `satPin`、`:846-856` 的 `primaryPin`。保留真資料部分：`heroCoverArt`（真 cover）、`heroOverlay`、`heroBody`（真標題/距離文案）。
- `FeaturedSpotRow`（`:1032-1105`）：刪 `:1096-1102` 的 `miniMap` `View`（假地圖方塊 + pin）。
- `makeStyles`：刪 `heroGrid`/`gridLineV`/`gridLineH`/`roadPath`/`satPin`/`primaryPin`/`miniMap`/`miniMapPin` 這些只服務假 chrome 的 style（grep 確認無其他引用後刪）。
- import：若 `LinearGradient` 仍被 `heroOverlay` 用則保留；`Ionicons` 仍被 hero badge / 其他用則保留。

- [ ] **Step 6: 重排 section 順序 + 「我的巡禮」進度卡（blocked-on Phase 2/3）**

`index.tsx` ScrollView（`:612-759`）內容順序改為：
1. `<NearbyHero .../>`（最近聖地）— **blocked-on Phase 2**：Phase 2 落地後把 `nearestAnime` 換成 `buildNearbySpots(userLocation)[0]` 的真景點卡（場景照 + 「離你 1.2km・鎌倉高校前・灌籃高手」）。未落地：維持既有 `nearestAnime`（真距離/標題/cover），只是已無假 grid。
2. **我的巡禮 rail**（原「My Collection」section `:659-695` 上移到此）— `PopularCard` 進度改用 `resolveHubAnimeProgress(anime, visited, cachedDetailPointIds)`：`✓{visitedCount}`，`total != null` 時顯示 `{visitedCount}/{total}`，否則只顯示 `✓{visitedCount}`。**blocked-on Phase 3**：`cachedDetailPointIds` 來源 = Phase 3 的每動漫 detail-points 快取讀取；未落地時傳 `undefined`（只顯示 ✓ 數）。per-anime accent：`PopularCard` 的 `accent` prop 由 `theme.accent` 改成 `anime.color || theme.accent`。
3. 附近動漫 rail（既有 `popularList` section `:705-732`）。
4. 探索區：`<Tourism88Rail/>`（`:697-703`）+ Featured Spots（`:734-756`）收到最後當「探索」。

`resolveHubAnimeProgress` 進 `index.tsx` import。`PopularCard` 的 visited badge JSX（`:993-1003`）改用 progress 結果渲染 `✓{visitedCount}` 或 `{visitedCount}/{total}`。

- [ ] **Step 7: 驗證**

Run: `bun run test:unit && bunx tsc --noEmit`
Expected: 全綠、無 unused style/import。模擬器（可延後）：hub 順序為 最近聖地 → 我的巡禮 → 附近 → 探索；無假 grid/散點/miniMap；收藏卡顯示誠實 ✓ 計數（有快取才顯示分母）。

- [ ] **Step 8: Commit**

```bash
git add 'app/(tabs)/pilgrimage/index.tsx' libs/services/pilgrimage/pilgrimage-hub-progress.ts __tests__/unit/pilgrimage/pilgrimage-hub-progress.test.ts
git commit -m "feat(pilgrimage): reorder hub IA (nearest → my pilgrimage → nearby → explore); drop fake map chrome; honest progress"
```

> **Phase 2/3 落地後的收尾**（本 plan 執行時若依賴尚未 merge，開 follow-up）：hero 接 `buildNearbySpots` 真景點；「我的巡禮」分母接 Phase 3 detail-points 快取。兩者接線點已由 Step 6 的 `NearbyHero` props 與 `resolveHubAnimeProgress(cachedDetailPointIds)` 標好。

---

## 完成後整體驗收（對照 spec Phase 6 表 6.1–6.5 + §1.8）

- [ ] `bun run test:unit` 全綠、`bunx tsc --noEmit` 無新錯誤、i18n parity 通過。
- [ ] 6.4：`PilgrimageSpotList` / `applyPilgrimageCollectionEntries` / `flyToFocusedAnime` / `sheetIndex` 皆已移除，grep 乾淨。
- [ ] 6.5：§1.8 i18n 清單逐條換 `t()`（含 map.tsx 第三份 region 表，delta #4）；App 語言切換後 hub / 88 rail / album region / detail area 全跟著變。
- [ ] §1.8 快照：重啟 App 後 hub 立即顯示上次收藏/位置（非只 bundled seed）；冷啟動 frame-1 不是 skeleton。
- [ ] 6.1：`index.tsx` root useState = 1、`map.tsx` root useState = 6；行為與重構前一致。
- [ ] 6.3：detail rows 模式出現誠實 area section header；點 header 切 map 並 `fitBounds` 該區。
- [ ] 6.2：hub 順序 = 最近聖地 → 我的巡禮 → 附近 → 探索；假 grid/散點/miniMap 全刪；per-anime accent 用 `anime.color`；進度誠實（Phase 2/3 未落地時退回真 fallback，無假資料）。

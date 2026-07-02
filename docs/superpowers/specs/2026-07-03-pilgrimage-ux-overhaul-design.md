# 聖地巡禮 UX 總體檢 — 診斷 + 分階段計畫

日期：2026-07-03　狀態：待核准
範圍：`app/(tabs)/pilgrimage/*`、`libs/services/pilgrimage/*`、`components/pilgrimage/*`、`app/(tabs)/collection/*`，以及 sibling repos（`Aniseekr-source` pipeline、`aniseeker_backend` Workers）。

---

## 0. TL;DR

七個用戶抱怨全部找到 root cause，而且大部分**不是缺功能，是功能做了一半沒接上或預設關閉**：

| 抱怨 | Root cause | 修法 |
|---|---|---|
| 圖片整體出不來 | **兩層**。①App bug（必然壞）：`/lite` 的 litePoints 圖片是相對路徑 `/images/points/...`，**從未 normalize** 就直接餵 expo-image → hub/featured/nearby/卡片全部空白（只有 detail 頁自癒）；壞路徑還被存進 SQLite 7 天。②上游脆弱：anitabi api/image 子網域的 Cloudflare WAF 擋非瀏覽器流量（實測 403）、app UA `Aniseekr/1.0`、所有圖片元件**零 onError/fallback**、TTL 到期即斷崖 | Phase 0：normalize litePoints + cache-bust（很可能一發救活）→ 錯誤態 + stale-if-error + 自家 proxy |
| 地圖沒貼著用戶 | follow mode **存在**但預設 `idle`（不開 watcher）、一滑地圖就退出、不持久化、精度 50m/10s | Phase 1：改預設 + 改參數 + FAB 重新進入 follow |
| 永遠那幾部動漫 | nearby 資料源是 781 部「動漫中心點」索引；收藏 <16 部時用 29 部 hardcode 清單回填；bounds 查詢被 4° 限制擋住 | Phase 2：pipeline 出**景點級**全球索引 |
| 只有日本 | 資料其實是全球的；但 `pointInJapan` gate 讓**日本以外的用戶永遠被置中到日本**（hub-initial-view:39）、fallback 視圖恆為 JAPAN_BOUNDS | Phase 1 拆 gate + Phase 2 景點索引 |
| 沒有獨立相機 | `recordCapture` 強制要 `spotId`（captures.ts:39）；album 直接丟棄無 spot 的紀錄 | Phase 3：captures v2 + 自由拍攝入口 |
| collection 資料夾亂/難找 | 狀態 tabs 和系統資料夾**兩套重複分類**；排序 chips 只排資料夾不排動漫；系統資料夾內 SQL 連 ORDER BY 都沒有 | Phase 5 |
| plan 頁沒用 | 裝飾品：假天數/步行時數（Rule 8 違規）、preset 點了沒人讀、省略號按鈕只放 haptic | Phase 4：砍假料，接上已存在的 planned intents |

**已建好但沒接上的資產**（計畫核心是「接線」不是「新造」）：
- 景點級「附近聖地」面板 `NearbySpotsSheet.tsx` + `nearby-spots.ts` — **整個寫完了，零 import**（死碼）
- visited 綠色 marker — 引擎全支援（`MapLibreEngine.updateVisited`、`marker-style.ts` VISITED_COLOR），hub 地圖沒傳
- 路線繪製 — `MapRoute`/`MapWaypoint` types 已預留（types.ts:70-87），引擎沒實作
- planned/saved intents — `spot-intents.ts` 已持久化，plan 頁卻不讀它
- 每日更新的 anitabi 索引 pipeline — `Aniseekr-source` 已每日 build + GitHub Release + app runtime hydration（anitabi-index.ts:1-13）
- 品質好的既有底層（直接複用即可）：local-first 搜尋（`pilgrimage-search-service.ts`，離線可搜、Bangumi fallback、Rule 8 嚴格比對）、系列合併（`pilgrimage-series.ts` BFS 續作/劇場版 + 季標籤）、標題在地化（`pilgrimage-localization.ts` 簡繁轉換 + 語言優先序）

---

## 1. 逐項診斷（證據）

### 1.1 圖片整體出不來（用戶體感最差）

**第一層 — app bug，必然重現，很可能就是主因：**
1. `/lite` 回傳的 litePoints 圖片是**主機相對路徑** `/images/points/{subjectId}/{pointId}.jpg`。`normalizeAnitabiImageUrl`（anitabi-image.ts，本身正確）只被用在 `/points` 詳情路徑（`anitabi-service.ts:249`）和 cover（`anitabi-index.ts:276`、search）；**`getLite` 完全跳過**（`anitabi-client.ts:57-59` 直接 `response.json()`，`anitabi-service.ts:158` 原樣存進 SQLite）。
2. 相對路徑被直接餵給 expo-image → 無法解析 → 空白。命中所有發現面：hub featured spots（`index.tsx:417,1057`）、`AnimePilgrimageCard.tsx:148`、`nearby-spots.ts:83`、`pilgrimage-series.ts:264`。
3. **Detail 頁自癒**（`usePilgrimageDetailData.ts:142-182` 先渲染 litePoints、再換成 normalize 過的 `/points`）— 所以「點進去圖會出現、外面全空白」的體感。
4. **Cover 回歸**：hub 先用索引的 normalize 過 cover 播種，`/lite` 抵達後 `index.tsx:260` 整物件覆寫 → cover 變回未 normalize 的原始值。
5. 壞 URL 已持久化：SQLite 7 天（lite 路徑**沒有** `_v2` 式 cache-bust 機制）+ expo-image disk cache。修好程式後必須 bump lite cache key。
6. 測試假象：`anitabi-service.test.ts:33` fixture 手寫了絕對 URL，所以沒有測試踩到真實相對路徑。

**第二層 — 上游脆弱（即使修好第一層也要處理）：**
1. `api.anitabi.cn` 與 `image.anitabi.cn` 對非瀏覽器客戶端回 403（Cloudflare "Attention Required"，本機實測含完整瀏覽器 header 仍 403 → IP/TLS 指紋層級）。主站 `anitabi.cn` 正常 → 子網域 WAF 規則。
2. **App 端 UA**：`anitabi-client.ts:12` `USER_AGENT = 'Aniseekr/1.0'` — bot 偵測的典型封鎖對象。expo-image 抓圖用 iOS CFNetwork/okhttp UA，同類。
3. **零錯誤處理**：全部圖片元件（hub `index.tsx:807,977,1056`、`PilgrimageHubSheet.tsx:367,504,614`、`album.tsx:1055-1074`、detail sheet）**沒有 onError、沒有失敗 placeholder** — 失敗就是一塊安靜的空底色。唯一例外 `Tourism88Rail.tsx:124-141`。
4. **快取斷崖**：`anitabi-service.ts:112` `row.expires_at > now()` — 過期的 SQLite 資料**直接無視**，接著 network 失敗 → 整頁沒資料。資料明明還躺在本地。
5. 先例：`[animeId].tsx:274-288` 已註記 api.bgm.tv 圖片在 Android okhttp UA 下 403 — 同類問題出現過一次，當時的解法是沉默繞路。

### 1.2 地圖沒有貼著用戶

follow mode 存在（`use-user-location-tracking.ts`：idle → following → compass），但：
1. 預設 `idle`，idle **不開 watchPosition**（:210）— 開屏只放一次 last-known 位置，人走了點不動。
2. 任何手勢 pan → 立刻退回 idle（`MapLibreEngine.tsx:180-183` → :308-311）。
3. mode 不持久化，每次進頁面重設 idle（:141-144）。
4. following 時參數太鈍：`distanceInterval: 50m, timeInterval: 10s, Accuracy.Balanced`（location-service.ts:240-245）。
5. header「我的位置」toggle 是另一套一次性 recenter（map.tsx:690-693），與 follow 無關 → 體感「按一下跳一次，然後就死了」。

### 1.3 永遠是那幾部動漫 / 只有日本

1. 資料源：`anitabi-index`（bundled 82 部 → runtime hydrate ~781 部），**動漫中心點**一筆一部，不是景點。
2. hub 清單 = 用戶收藏 ∪ hardcode 29 部（`featured-anime.ts:18-48`，收藏 <16 時回填，`usePilgrimageHubData.ts:47,247`）∪ 位置半徑 30km/60 部（`map-nearby.ts:4-6`）∪ bounds 查詢 — 但 bounds 被 `latSpan ≤ 4°` 擋住（`pilgrimage-design-flow.ts:16-32`），預設全日本視圖 21° → **永遠不觸發**。
3. 沒定位權限 + 收藏少 + 預設縮放 → 清單恆等於那 29 部。
4. 「附近」的距離是**到動漫中心點**的距離：ゆるキャン 684 個點散佈全山梨，中心點距離對「我旁邊有什麼」毫無意義；日本以外中心點稀疏 → 空白。
5. **日本鎖定是 UX 層不是資料層**：索引本身全球（`getAnimeInBounds`/`getAnimeNear` 無日本過濾），但 `pilgrimage-hub-initial-view.ts:39` 只有 `pointInJapan(userLocation)` 才置中用戶，:66 fallback 恆為 JAPAN_CENTER；`map.tsx:133,490` fallback 視圖恆為 JAPAN_BOUNDS；`index.tsx:107,453` 的 nearby 分層最高到「在日本」5000km 桶。人在台北 → 永遠看到日本地圖。
6. 88 巡禮 rail、region label 都是日本框架的 chrome。

### 1.4 沒有獨立拍照相機

- `recordCapture` 必填 `spotId`（`captures.ts:39`）；compare 相機永遠從 route 帶 spot。
- `album-captures.ts:58-67`：無 `animeId`/`spotImage`/`spotName` 的紀錄直接不渲染。
- 另一個資料坑：**每個 spot 只存最新一張**（`captures.ts:73`）— 同一景點拍三張，前兩張的 metadata 默默消失（照片還在相簿但 app 不知道）。

### 1.5 Collection（主 tab）分類怪、難找、排序壞

- 兩套重複分類：4 個狀態 tabs（`index.tsx:53`）疊在 6 個系統資料夾 + 自訂資料夾（`collection-service.ts:5-60`）上；命名四元組不一致（Planned→planned→wishlist→system_plan_to_watch）。
- 排序 chips **只排資料夾格子，不排動漫**（`index.tsx:494-502`）；動漫卡永遠 `updated_at DESC` 硬編碼、只顯示 6 張（:72,748）。
- 壞掉的排序模式：popularity 按恆為 0 的 `sharedBy` 排（no-op）、rarity 按 R18 旗標排、id 按 UUID 排。
- **系統資料夾內的清單 SQL 沒有 ORDER BY**（`collection-service.ts:289-292`），資料夾內也沒有排序/搜尋控制 → 「一多很難找到」的直接原因。

### 1.6 點進動漫 A 大海撈針、沒攻略感

- `[animeId].tsx` 架構好（Rule 9 模範），但 `groupPointsIntoSpots` 只做同座標去重 — 600 點的動漫仍是一片平面清單/滿屏 marker。沒有區域分組、沒有順路排序。
- visited 有記（手動 toggle，`visited-prefs.ts`）、detail 有 all/unvisited/visited filter，但：hub 地圖 marker 完全不顯示 visited（§0 表）；沒有 per-anime 進度呈現（X/Y、%）；「走過」和「沒走過」在地圖上長一樣 → 零攻略感。
- 沒有「你的位置 ↔ 這個點」的相對呈現（距離 + 方位）。

### 1.7 plan.tsx 是裝飾品

- 假資料（Rule 8 違規）：`estimatedDays = ceil(spots/6)`、`walkingHours = spots*0.4`（plan.tsx:89-91,128-130）渲染成「3 日行程 / 12.4h 步行」。
- 死 UI：preset tiles push `/pilgrimage?preset=x` 但**沒有任何 consumer**（註解自己承認，:46-49）；header 省略號按鈕只放 haptic（:223-230）。
- 明明 `spot-intents.ts` 已持久化 planned 旗標（SpotSheet 有「計畫」toggle），plan 頁完全不讀。

### 1.8 其他發現（agents 掃出）

- **死碼**：`PilgrimageSpotList.tsx`（零 import）、`NearbySpotsSheet.tsx` + `buildNearbySpots`（零 import）、`applyPilgrimageCollectionEntries`（只有測試在用）、`map.tsx:609-613 flyToFocusedAnime` 重複。
- **Rule 9**：hub `index.tsx` 10 useState + 6 effects（自稱 list-only）；`map.tsx` 14 useState + 7 effects — 下一個 camera 式簡化的對象。
- **i18n 違規**（Rule 11）：`index.tsx:985`「{n} spots」、`PilgrimageHubSheet` 多處（'Nearby anime'、'Unknown Title'、英文 a11y labels）、`Tourism88Rail`（★ Official、REGION_LABELS）、`album.tsx` REGION_LABELS/「その他」。
- 小 bug：hub 地圖小 cluster 點擊 no-op（沒傳 `onClusterPress`，map.tsx:729-745）；夜間地圖主題用 render 時 `new Date().getHours()` 不會自己翻轉（map.tsx:202）；`FeaturedTripCard` 的 `replace('?plan=h160','?plan=h360')` 對不含該字串的 URL 是 no-op。
- **Hub 快照不落地**（Rule 10 相鄰問題）：`pilgrimage-hub-cache.ts:5` 是 module 級 in-memory、5 分鐘 TTL — 每次重啟 app hub 都是冷啟動。Phase 6 順手改 CacheService 持久化 + `getSync` 播種。
- 未完成的鷹架：資料夾 `isShared/sharedBy` 分享功能（恆 0、無後端）；`offlineOnly` prop 收了不執行。

---

## 2. 設計原則（第一性原則翻譯）

1. **核心機制要強、要簡單、路徑要短**：每個 phase 先接現成的線，再造新東西。新機制 = 打卡（stamp）一個，其他都是呈現。
2. **照片是主角**：聖地巡禮的貨幣是「動畫場景 × 現實照片」。圖片管線的可靠性優先於一切新功能（Phase 0 不做完，後面全是空中樓閣）。
3. **攻略感 = 狀態可見**：沒走過/走過/拍過 三態必須在地圖 marker、清單、進度環一眼可辨。資料早就有（visited/intents/captures），只是沒畫出來。
4. **全球資料、本地優先**：索引和快取都要離線可用；日本框架（88 rail、region）降級為可選 chrome。
5. **不假裝知道**（Rule 8）：假統計一律刪；錯誤態誠實顯示「無法載入」。

---

## 3. 分階段計畫

> 每個 phase 獨立可出貨、獨立可驗收。動工前各自再寫 implementation plan（superpowers:writing-plans）。

### Phase 0 — 資料生命線（P0，其他一切的前提）

> Implementation plan（Phase 0.0–0.3 + Phase 1 全部）：`docs/superpowers/plans/2026-07-03-pilgrimage-p0-data-lifeline-p1-map-follow.md`。0.4/0.5 等 spike 1 結果後另出 plan。

**目標：有網路時圖片一定出得來；沒網路/被擋時有誠實的畫面，且舊資料不蒸發。**

| # | 改動 | 位置 | 大小 |
|---|---|---|---|
| 0.0 | **litePoints 圖片 normalize**（很可能一發救活發現面）：`getAnimePilgrimage` 存檔前對 `litePoints[].image` 與 `cover` 跑 `normalizeAnitabiImageUrl`；lite cache key 加 `_v2` bust（比照 detail 的機制，注意 fan-out 警告 anitabi-service.ts:24-30）；修 hub `/lite` 合併覆寫 cover 的回歸（index.tsx:260 改欄位合併）；補一條「相對路徑輸入」的單元測試 | `anitabi-service.ts:141-158`、`index.tsx:260` | S |
| 0.1 | stale-if-error：network 失敗時回傳過期 SQLite row（lite + points 兩路都是），UI 標「可能過時」 | `anitabi-service.ts:110-134` | S |
| 0.2 | 統一 `<SpotImage>` 元件：onError → 重試一次 → 誠實錯誤 tile（icon+「無法載入」）；`cachePolicy="memory-disk"`；替換全部 8+ 個裸 `<Image uri>` 呼叫點 | `components/pilgrimage/` 全域 | M |
| 0.3 | Header 實驗：API fetch 與 expo-image `source.headers` 加瀏覽器 UA + `Referer: https://anitabi.cn/`，真機驗證是否解封（低成本，可能直接救活） | `anitabi-client.ts:117`、SpotImage | S |
| 0.4 | 自家圖片線路：`aniseeker_backend`（Elysia on Workers）加 `/anitabi/img/*` proxy，edge cache 30d + stale-on-error；app 圖片 URL 改指 proxy、anitabi 直連做 fallback | backend repo + `anitabi-image.ts` | M |
| 0.5 | 資料快照：`Aniseekr-source` 每日 pipeline 已抓 `/lite` — 加抓 `/points`，隨 `anitabi-index` release 一起發；app 端 hydration 順手灌進 SQLite（= 熱門動漫離線可用） | pipeline repo | M |

**Spike（0.4/0.5 前）**：確認 Workers egress 和 GitHub Actions runner 是否也被 anitabi WAF 擋。如果都擋 → 快照改走本機 dev-loop 上傳（`BANGUMI_DUMP_PATH` 同款模式）。
**授權**：Anitabi CC BY-NC-SA 4.0 — 鏡像/proxy 保留 `origin`/`originURL` 顯示（欄位已存在），app 需維持非商用敘述。

**驗收**：hub／featured／nearby 縮圖真的顯示（0.0）；飛航模式開啟看過的動漫 → 圖與資料照常；封鎖網路下首開 → 每格是明確錯誤態不是空白；TTL 過期 + 斷網 → 顯示舊資料。

### Phase 1 — 地圖貼人 + 攻略感 marker（P0，純 app 端、小）

**目標：開地圖 = 藍點跟著人；走過的點一眼可辨。**

| # | 改動 | 位置 | 大小 |
|---|---|---|---|
| 1.1 | 有定位權限時預設 `following`（非 idle）；mode 持久化（MMKV，同 map-view-mode-prefs 模式） | `use-user-location-tracking.ts:141-144,210` | S |
| 1.2 | 手勢 pan → 進「暫停跟隨」而非丟棄 watcher；LocateFab 一按回 following、再按進 compass（Google Maps 慣例） | 同上 + `LocateFab.tsx` | S |
| 1.3 | following 時 `Accuracy.High, distanceInterval 10m, timeInterval 3s`（僅前景，省電無虞） | `location-service.ts:240-245` | S |
| 1.4 | hub 地圖 anime marker 走過即變綠（binary，`entry.visitedCount > 0`；引擎已支援渲染）。精確進度環（visited/total）與 📷 badge 需要 Phase 2 的景點級索引才有誠實分母（litePoints 是抽樣，Rule 8）→ 挪到 Phase 6 | `map.tsx:453-473`、`marker-style.ts:78-86` | S |
| 1.5 | SpotSheet 加「你的位置」列：距離 + 方位箭頭（heading 已有），例「350m ↗」 | `SpotSheet.tsx` | S |
| 1.6 | 順手修：cluster 點擊 no-op（傳 onClusterPress）、夜間主題不翻轉（改用 map-theme-clock 的 reactive 時鐘） | `map.tsx:202,729-745` | S |
| 1.7 | **拆日本 gate**：有定位就置中用戶（不管在不在日本）；JAPAN_BOUNDS 只當「無定位」的 fallback；nearby 分層文案去掉「在日本」假設 | `pilgrimage-hub-initial-view.ts:39,66,163-170`、`map.tsx:133,490`、`index.tsx:107,453` | S |

**驗收**：走 20m 地圖跟著移；滑開地圖後按 FAB 一鍵回追；走過的點在 hub 和 detail 地圖都是綠✓；人在台北開地圖 → 置中台北不是日本。

### Phase 2 — Nearby 全球化：景點級索引（跨 repo，核心投資）

**目標：在世界任何地方打開，看到「離我最近的聖地」，含我追的動漫，離線可用。**

| # | 改動 | 位置 | 大小 |
|---|---|---|---|
| 2.1 | pipeline 產出**景點級**索引：`{pointId, animeId, lat, lng, name, cn, image}` 全量（估 5-10 萬點，gzip JSON 數 MB），隨每日 release 發佈 | `Aniseekr-source` | M |
| 2.2 | app 下載進 SQLite 表（lat 索引 + BETWEEN 查詢即可，10 萬列無壓力），背景更新沿用 anitabi-index hydration 節奏 | `libs/db.ts` + 新 service | M |
| 2.3 | 復活 `NearbySpotsSheet`（現成死碼）：資料改接景點級查詢；分區 = 「我的收藏」優先 + 「附近全部」；chips：全部/未走過/已收藏 | `NearbySpotsSheet.tsx`、`nearby-spots.ts` | S-M |
| 2.4 | hub「附近」入口改為**最近聖地 hero 卡**：場景照大圖 + 「離你 1.2km・鎌倉高校前・灌籃高手」，取代假網格地圖；點擊 → 地圖 focus 該點 | `index.tsx:791-856` | S |
| 2.5 | 刪 4° bounds gate（landmark 查詢改打本地 SQLite，不再需要保護 API）；30km 半徑改景點級 | `pilgrimage-design-flow.ts:16-32`、`map-nearby.ts` | S |
| 2.6 | 長按 marker → quick actions（收藏/計畫/導航/打卡）— 用戶點名的互動 | `MapLibreEngine` onLongPress + small sheet | S-M |

**驗收**：台北/上海/首爾打開 → 有真實 nearby（anitabi 有海外點）；飛航模式 nearby 照常出（索引在本地）；收藏的動漫優先浮出。

### Phase 3 — 獨立相機 + 打卡（新機制只有這一個）

**目標：不用先找 spot 也能拍；同景點多張不丟；打卡成為核心動作。**

| # | 改動 | 位置 | 大小 |
|---|---|---|---|
| 3.1 | captures schema v2：`Record<spotId, Capture[]>` + `free: Capture[]`（帶 geo/takenAt）；v1 遷移 = 包一層 array | `captures.ts` | S-M |
| 3.2 | 自由拍攝入口（hub header + 地圖 FAB）：進 compare 相機、overlay off、無 spotId；存檔時若 150m 內有已知 spot → 提示掛載，否則進「自由拍攝」資料夾 | `compare/[spotId].tsx` 路由參數化 | M |
| 3.3 | 「打卡」動作統一：visited toggle 升級為 SpotSheet 主按鈕「打卡」（可附拍照）；打卡 = visited + 時間戳 | `SpotSheet`、`visited-prefs.ts`（加時間戳） | S |
| 3.4 | album：資料夾 = 動漫（已有）+「自由拍攝」+ 依 v2 顯示同 spot 多張 | `album.tsx`、`album-captures.ts:58-67` | S-M |
| 3.5 | 到點提醒（前景輕量版）：地圖開著且距離未打卡 spot <100m → banner「你在 XX 附近，打卡？」。不做背景 geofence（YAGNI） | map screen + 現有 watcher | S |

**驗收**：路上隨手拍 → album 找得到；同點拍 3 張全在；靠近點時被提示打卡。

### Phase 4 — 巡禮清單（plan 頁重生，規劃入口）

**目標：把「計畫」從裝飾變成真的：我勾的點 → 順路清單 → 帶去導航。**

| # | 改動 | 位置 | 大小 |
|---|---|---|---|
| 4.1 | 刪假料：estimatedDays/walkingHours/死 preset tiles/死省略號（Rule 8） | `plan.tsx` | S |
| 4.2 | plan 頁 = 讀 `spot-intents.planned`：按動漫分組的待走清單，顯示每組進度；空狀態引導去地圖勾點 | `plan.tsx` 重寫（複用 hub 卡片） | M |
| 4.3 | 順路排序：從用戶位置 nearest-neighbor 鏈（純函式 + 單元測試），一鍵「開始巡禮」→ 地圖畫路線 | 新 pure fn + `MapLibreEngine` 實作已預留的 `MapRoute`（GL LineLayer） | M |
| 4.4 | 匯出：Google/Apple Maps multi-stop deep link（waypoints ≤9 分段） | `pilgrimage-navigation.ts` 擴充 | S |
| 4.5 | 不做：多日行程實體、AI 排程、住宿建議（等被要求再說） | — | — |

**驗收**：勾 5 個點 → plan 頁出現、按距離排好、一鍵丟進 Google Maps；沒勾任何點 → 誠實空狀態。

### Phase 5 — Collection tab 修理（主 app，用戶點名）

| # | 改動 | 位置 | 大小 |
|---|---|---|---|
| 5.1 | 單一分類體系：砍狀態 tabs，資料夾（系統+自訂）是唯一入口；系統資料夾命名對齊 status | `collection/index.tsx:53-62` | M |
| 5.2 | 資料夾內：SQL 加 ORDER BY + 排序控制（加入時間/更新/標題/評分）+ 搜尋框 | `collection-service.ts:289-292`、`[id].tsx` | M |
| 5.3 | 刪壞排序：popularity（恆0）/rarity（R18 proxy）/id（UUID）；`sortOptions` 與 `CollectionSortMode` 對齊 | `collection-prefs.ts`、`index.tsx:494-537` | S |
| 5.4 | 主頁動漫預覽 6 張限制 → 「查看全部」直達排序後的完整清單 | `index.tsx:72,748` | S |
| 5.5 | 分享鷹架（isShared/sharedBy）：無後端 → 先移除 UI 痕跡，schema 留著 | `collection-service.ts` | S |

### Phase 6 — Hub 簡化 + 清理（camera 式縮減）

| # | 改動 | 大小 |
|---|---|---|
| 6.1 | hub `index.tsx`（10 state）與 `map.tsx`（14 state）拆進 feature hooks — 對照 `[animeId].tsx` 模範 | M |
| 6.2 | hub 資訊架構重排：最近聖地 hero → 我的巡禮（進度環卡）→ 附近 → 探索（featured/88 降級為探索區）；用 anitabi `color` 做 per-anime accent | M |
| 6.3 | detail「大海撈針」：距離分組（聚類現成 supercluster 邏輯複用）→ 區域 section「○○一帶（12 點）」+ 跳轉 | M |
| 6.4 | 刪死碼：`PilgrimageSpotList`、`flyToFocusedAnime`、`applyPilgrimageCollectionEntries`、`void sheetIndex` | S |
| 6.5 | i18n 清單修完（§1.8 全列） | S |

---

## 4. 順序與依賴

```
Phase 0 (生命線) ──► Phase 1 (地圖+marker) ──► Phase 2 (景點索引) ──► Phase 3 (相機+打卡)
                                                      │
                                                      └──► Phase 4 (巡禮清單)
Phase 5 (collection tab)  — 獨立，可並行
Phase 6 (hub 簡化)        — 建議最後（吃前面所有新元件）
```

建議節奏：0+1 一起出（止血 + 立即體感）；2 是最大單筆投資（跨 repo）；3/4 各自獨立出貨；5 可隨時插隊。

## 5. Spike / 開放決策

1. **Anitabi WAF 繞法**（Phase 0 前）：真機驗證 403 是否同樣發生（可能只擋部分 IP 段）；Workers/GH Actions egress 測試。決定 proxy vs 純快照 vs header 修復即可。
2. **景點索引體積**：全量點數需 pipeline 實測（~781 部 × 平均點數）。>10MB 就按 geohash 分片下載。
3. **圖片鏡像深度**：只 proxy（零儲存）vs h160 縮圖全鏡像進 R2（估 1-2GB，徹底解依賴）。建議先 proxy，量測命中率再決定。
4. **非商用敘述**：CC BY-NC-SA 鏡像的合規確認（app 目前免費無 IAP 則無虞）。

## 6. 不做清單（YAGNI）

- 背景 geofence 推播（前景 banner 夠了）
- 離線地圖磚包（MapLibre ambient cache 先撐著；`createPack` API 留作 stretch）
- 多日行程/AI 行程（等 Phase 4 用起來再說）
- 相片雲端上傳（本地 + 系統相簿即可；備份走既有 backup-service 的路）

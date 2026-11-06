# 資料來源切換 E2E 結果（2026-11-05）

## 範圍與 build
- Galaxy S20 FE `RFCR81WHKWJ`，`com.kidneyweakx.aniseekr.e2e` debug dev client + 本機 Metro :8081（feat/uiux-cleanup 工作樹，含未 commit 變更），adb reverse。
- 操作路徑：我的 → 資料來源 → 點選來源 → 追番 tab。這是唯一會跟著 `browseSource` 走的畫面（見下方 code review）。
- 中途另一個 session 接上了 `emulator-5554`，之後所有指令都固定 `ANDROID_SERIAL=RFCR81WHKWJ`，沒碰那台模擬器。

## 結果
| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| B0 AniList（基準） | 季番清單 | 本季全部 90，週曆有播出時間 | PASS | B0-schedule.jpg |
| S1 Bangumi | 換成 Bangumi 資料 | 本季全部 90，跟 AniList 是同一份清單（設計上 seasonal 委派 AniList 再補中文標題） | UNVERIFIED（沒有獨立證據證明有打 bgm.tv） | S1-schedule.jpg |
| S2 Kitsu | 換成 Kitsu 資料 | 真的有換：本季全部 126、日文標題。但**週一到週日全部顯示「這天沒有排定播出的動畫」** | FAIL | S2-schedule.jpg |
| X2 Kitsu 點卡片進詳情 | 同一部作品的詳情 | 只有 route params 帶過來的標題/海報；Metro log `[AnimeDetail] load failed AniList HTTP 404`，簡介空白、區塊停在 skeleton | FAIL | X2-detail.jpg |
| S3 Shikimori | 換成 Shikimori 資料 | 本季全部 0 ＋重試；log `HTTP 422`，重試一次一樣 | FAIL | S3-schedule.jpg |
| S4 Simkl | 換成 Simkl 本季資料 | 顯示「本季全部 200」，但實際上是同一批約 20 部重複出現（Grotesqqque 每約 60 列出現一次）；海報全部空白；標題出現 `&amp;`；格式是小寫 `movie/tv` | FAIL | S4-schedule.jpg、S4-scrolled.jpg |
| X1 非 AniList 時的探索/搜尋/評分 | 依產品文案「探索與季番瀏覽」應換來源 | 未在機上測 | UNVERIFIED | — |

整體：**FAIL**。只有 Kitsu 有真的換到資料，但週曆和詳情頁都壞了；Shikimori 完全載不到；Simkl 的資料是假的多（重複）；Bangumi 等同 AniList。

## 失敗原因（假設，附程式位置）
- **Shikimori 422**：`libs/services/data-sources/shikimori-data-source.ts` 送出 `season=2026_fall`，API 只接受 `fall_2026`。直接 curl 驗過：`2026_fall` → 422 `Invalid season value`、`fall_2026` → 200。另外 `shikimori.one` 會 301 轉到 `shikimori.io`。
- **Kitsu/Simkl 週曆是空的**：這兩個來源沒有填 `nextAiringEpisode`，週曆依賴這個欄位。
- **詳情 404**：`app/anime/[id].tsx` 和 `AnimeRepository.getAnimeDetails` 都寫死 AniList。Kitsu 的 id 被當成 AniList id 送出去；要是 id 剛好撞到，會顯示**另一部作品**。追番／提醒也用同一個 id。
- **Simkl 重複**：`fetchSeasonalAnime` 忽略 page/season，固定打 `/anime/premieres?limit=20`；batched loader 一直翻頁拿到同樣的 20 部，dedupe 又沒擋下來（推測是 id 不穩定，例如 fallback 到 `uuid()`）。

## Code review（沒在機上測）
- 只有 `hooks/useSeasonSchedule.ts`（追番 tab）走 `resolveSource()`。探索 / 評分牌堆 / 搜尋 / 熱門 / 類型 / 詳情都走 `AnimeRepository` 的 static facade，**寫死 `AniListClient`**，切來源不會有任何影響。
- 設定頁文案寫「選擇用於探索與季番瀏覽的平台」，實際上只影響季番。

## 遠端變更與清理
- 沒有寫入任何遠端資料。browseSource 已切回 AniList（設定頁顯示「目前使用」），dev client 已 force-stop，已移除 `adb reverse tcp:8081`、停掉 Metro。prod app 沒碰。

---

# 修復後重跑（同日 22:00–22:40）

Build：同一台 S20 FE `.e2e` dev client，Metro :8081 重新 `--clear`，從 Metro 拿到的 bundle 確認含 `seasonalpage_v3_`、`getAnimeByMalIds`、`wrapSimklFanart`。指令固定 `ANDROID_SERIAL=RFCR81WHKWJ`。

偏差：第一輪重跑（R1–R4 首次）「我的」頁有捲動，點到 tab bar，來源其實沒切換 → 四筆都 **INVALID**，不採用。改用 `aniseeker://data-source` deep link，並在每一步檢查「目前使用」是否真的換了才繼續。

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| R0 AniList（回歸） | 跟修復前一樣 | 本季全部 90，週一到週日都有列 | PASS | — |
| R1 Bangumi | 清單 + 點進詳情是同一部 | 90 部；點「冰之城牆 第二季」→ 詳情 The Ramparts of Ice S2、★8.1、RELEASING | PASS | fix-X1-detail.jpg |
| S2/R2 Kitsu 週曆 | 週曆有播出時間 | 本季全部 97（126 部裡有 29 部在 AniList 找不到對應，已丟掉，log 有記錄），週一到週日都有列，有集數＋播出時間 | PASS | fix-R2-schedule.jpg |
| X2 Kitsu 詳情 | 同一部作品 | 「歸還者的魔法要特別 第二季」→ A Returner's Magic S2、★6.9、RELEASING | PASS | fix-X2b-detail.jpg |
| S3/R3 Shikimori | 載得到本季 | 本季全部 108，週曆有列；點「轉生就是劍 第二季」→ 詳情 ★7.5 正常 | PASS | fix-R3-schedule.jpg、fix-X3-detail.jpg |
| S4/R4 Simkl | 不重複、有海報、只有本季 | 本季全部 8，全部不重複、有海報；都是 11 月首映的電影/ONA，所以只出現在「電影與特別篇」，週曆是空的（合理：沒有每週播出）；點 Demons' Crest → 詳情正常 | PASS | fix-R4b-schedule.jpg、fix-X4-detail.jpg |

重跑時多抓到一個 bug，已修：Simkl 的 Grotesqqque 在 AniList 是成人向，但 Simkl 沒給 genre/tag，所以清單沒擋掉、詳情卻拒絕打開（`Adult content is hidden`）。修法：anchor 時帶上 AniList 的成人判斷，清單層就濾掉。重跑後 9 → 8，詳情不會再被擋。

整體（範圍＝季番四個 bug）：**PASS**。

## 還沒處理（不在這次範圍）
- ~~來源不是 AniList 時，詳情頁的「相關作品」404~~ → 已修，見下一節。
- 季番清單的中文標題「物語系列 外傳季&amp;怪物季」有 `&amp;`：來自標題在地化（Bangumi name_cn），不是 Simkl。
- 探索 / 搜尋 / 評分還是寫死 AniList（產品決策還沒定）。

清理：browseSource 已切回 AniList（確認「目前使用」）、dev client force-stop、移除 adb reverse、停 Metro。另一個 session 的 `emulator-5554` 沒碰。

---

# 詳情頁「相關作品」修復（2026-11-06）

根因有兩個：
1. `AnimeRepository.fetchAnime{Staff,Relations,Streaming,Themes,Statistics}` 依 browseSource 選來源。詳情頁傳的是 AniList id（`sourcePlatform: 'anilist'`），在 Kitsu 底下就把 AniList id 拿去問 Kitsu → 404。改成：呼叫端有講 id 屬於哪個平台，就用那個平台的來源（REPO-065）。
2. 舊 bug，跟來源無關：AniList 的相關作品 id 用 `idMal ?? id`，點下去把 MAL id 送進 AniList 詳情 → 404。改成 AniList id（ANIL-012）。

實機（S20 FE，Kitsu 來源，Metro bundle 確認含修正）：
| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| D1 Kitsu 下開「歸還者的魔法要特別 第二季」詳情 | 相關作品 / 製作團隊 / 觀看平台都載得到，沒有 404 | 相關作品出現 Prequel（Kikansha no Mahou… TV）、Alternative（漫畫）；製作團隊、Crunchyroll / Bilibili 都有；log 沒有 AnimeDetail 錯誤 | PASS | rel-K1-detail-relations.jpg |
| D2 點 Prequel | 打開第一季 | 「歸還者的魔法要特別」、FINISHED、★6.9，log 無錯 | PASS | rel-K2-prequel.jpg |

修正前：D1 log 有 `[AnimeDetail] relations failed HTTP 404`；D2 第一次點是 `AniList HTTP 404`（修 ANIL-012 前實測）。

偏差 / 環境：
- 冷啟動後用 deep link 直接開資料來源頁，「返回」沒有上一頁，跳出 expo-router 的 Console Error。這是測試路徑造成的，之後改用 deep link 進追番 tab。
- 測試中我把手機的 `screen_off_timeout` 改成 600000（10 分鐘），原值沒記到，**需要手動改回**。
- 清理：來源已切回 AniList、dev client force-stop、移除 adb reverse、停 Metro。

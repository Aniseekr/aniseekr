# 資料來源切換 E2E 計畫（2026-11-05）

目標：除了 AniList / MAL(Jikan) 之外，Settings → 資料來源 切到 Bangumi / Kitsu / Shikimori / Simkl 時，畫面上的內容是不是真的換了來源。

裝置：Galaxy S20 FE (SM-G781B) `RFCR81WHKWJ`，`com.kidneyweakx.aniseekr.e2e` debug dev client + 本機 Metro :8081（feat/uiux-cleanup 工作樹）。
不碰 prod app `com.kidneyweakx.aniseekr`。

## 程式碼依據（code review，用來決定要看哪些畫面）
- 只有 `hooks/useSeasonSchedule.ts`（新番 tab）走 `AnimeRepository.defaultInstance()` → `resolveSource()` → 依 `browseSource` 取資料。
- 評分牌堆 / 搜尋 / 熱門 / 類型 / 詳情走 static facade，寫死 `AniListClient`。
- Bangumi data source 的 seasonal 是委派 AniList 再補中文標題。

## 驗證方式
每個 source：設定頁點選 → 回新番 tab → 截圖 + logcat 過濾 HTTP host（`ReactNativeJS` + `okhttp`）＋ 判斷卡片標題/數量是否與 AniList 基準不同。

| ID | 步驟 | 預期 | 驗證位置 |
|----|------|------|---------|
| B0 | source=AniList，開新番 tab | AniList 季番清單（基準） | 截圖、logcat 有 graphql.anilist.co |
| S1 | 切 Bangumi → 新番 tab | 清單重新載入；標題帶中文 | 截圖 + logcat 有 api.bgm.tv |
| S2 | 切 Kitsu → 新番 tab | 清單換成 Kitsu 資料 | 截圖 + logcat 有 kitsu.app/kitsu.io |
| S3 | 切 Shikimori → 新番 tab | 清單換成 Shikimori 資料 | 截圖 + logcat 有 shikimori |
| S4 | 切 Simkl → 新番 tab | 清單換成 Simkl 資料 | 截圖 + logcat 有 api.simkl.com |
| X1 | source=Kitsu 時，搜尋 / 評分 tab | 預期（依產品意圖）也換來源；依程式碼推測仍為 AniList | 截圖 + logcat host |
| X2 | source=Kitsu 時，從新番點進詳情 / 加追蹤 | 詳情是同一部作品 | 截圖比對標題 |

清理：最後切回 AniList（原本設定），停 Metro、移除 adb reverse。

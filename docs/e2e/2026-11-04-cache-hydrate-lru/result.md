# 結果：快取 hydrate / LRU / 記憶體洩漏修正（2026-11-04）

**範圍**：commit `1cccaaf`（快取）、`9f198e1`（記憶體上限）、`3ff04f6`（開機錯誤標籤）的 JS；原生程式沒動，兩個平台都用既有 debug build + Metro。計畫見 `plan.md`。截圖統一縮成長邊 1200px 的 JPEG。

## iOS — iPhone 18 Pro 模擬器（ios/build Debug app）

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| C1 開機同步預熱不影響啟動 | 能進 app、沒有紅屏、`warmSync mirrored 0 rows` | 進到 onboarding；Metro log `warmSync mirrored 0 rows`；沒有 `CacheService.warmSync error` | PASS | ios-C1-after-cold-launch.jpg、Metro log |
| C2 評分頁抓資料並寫進快取 | 本季、類型列顯示真實資料 | 本季新番與類型卡片都有出現 | PASS | ios-C2-rate-tab-loaded.jpg |
| C3 冷啟動預熱首頁 key | log 顯示 3 rows；評分頁第一張截圖是真實資料 | `warmSync mirrored 3 rows`；第一張截圖已有完整內容 | PASS（首幀無骨架只靠截圖觀察，無法逐幀證明） | ios-C3-rate-tab-after-cold-relaunch.jpg、Metro log |
| C4 共用連線下的非同步路徑 | 詳情頁正常、沒有 CacheService 錯誤 | 詳情頁完整顯示；error log 為空 | PASS | ios-C4-detail.jpg |

## Android — AVD `aniseekr_test`（API 36，debug build versionCode 1）

實機 SM-G781B 裝的是 Play 正式版（versionCode 105，有使用者資料），換 debug 版必須先解除安裝，所以沒有在實機測。

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| A1 開機同步預熱不影響啟動（`pm clear` 後） | 能進 app、`warmSync mirrored 0 rows` | 進到 onboarding；log `warmSync mirrored 0 rows`；沒有 warmSync 錯誤 | PASS | android-A1-after-cold-launch.jpg、Metro log |
| A2 Discover 抓資料 | 三個區塊顯示真實資料 | 第一次三區都是「Unable to load」——模擬器沒網路（`UnknownHostException`、ping 不通）；`svc wifi/data enable` 後重試，本季、類型、本週熱門都有資料 | PASS（第一次的錯誤畫面是環境問題，且 error 狀態顯示正確） | android-A2-rate-tab-loaded.jpg |
| A3 冷啟動預熱 | log 3 rows；Discover 第一張截圖是真實資料 | 第一輪 `2 rows`：本週熱門的 Retry 沒按到，所以從沒抓過資料。補抓之後再冷啟動得到 `3 rows`；截圖序列為啟動動畫 → 有資料的 Discover，中間沒有骨架 | PASS（第二輪；首幀同樣只靠 2 秒間隔的截圖） | android-A3-relaunch-1-splash.jpg、android-A3-relaunch-2-rate-tab.jpg、Metro log |
| A4 詳情頁非同步路徑 | 詳情頁正常、沒有 CacheService 錯誤 | 先用路由參數顯示標題與海報、內文骨架，之後從網路載入完整內容；沒有 `CacheService.*` log | PASS | android-A4-detail.jpg |

## 未測
| Case | 判定 | 需要 |
|---|---|---|
| C5 描邊/素描/去背疊圖（Skia dispose 與上限） | BLOCKED | 模擬器沒有相機，需要實機 |

**整體判定**：BLOCKED（C5 沒跑）。

**偏差**：iOS 模擬器途中被外部關機一次，重開後從 C1 重跑。iOS 用 deep link 跳過 onboarding；Android 走完 onboarding，選了 Collector。Android 測試中關掉了 dev client 的「Tools button」，因為它擋住了 Skip。log 裡只有 RevenueCat 錯誤（iOS 沒設 offerings、Android 模擬器沒有 Google Play 帳單服務），跟這次改動無關。

## code review，未實測
- QueryClient LRU 上限 200、Skia 快取上限，以及 SWR 寬限期在重開後保留：這些靠 unit test（CACHE-018/019）與讀程式碼驗證，沒有在 app 裡量記憶體數字。

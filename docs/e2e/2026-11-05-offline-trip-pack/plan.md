# 離線行程包 E2E 計畫（2026-11-05）

裝置：Samsung S20 FE（SM-G781B，Android 13，序號 RFCR81WHKWJ）。
Build：本 worktree（`claude/offline-trip-pack-ebe054`，含 6f1359c / 4d2c7ee / 200f08c）prebuild 出 debug dev client，
套件 `com.kidneyweakx.aniseekr.offline`（不覆蓋正式版與 `.e2e`），JS 由 Metro :8084 經 `adb reverse` 提供。
離線條件：基線時手機已是「飛航模式＋手動開 Wi-Fi」（行動網路已關、Wi-Fi 在線，ping 1.1.1.1 成功）。離線＝再關掉 Wi-Fi（`adb shell cmd wifi set-wifi-enabled disabled`），以 ping 失敗確認；USB 的 adb reverse 仍可用，所以 JS bundle 照常載入。測完把 Wi-Fi 開回來，維持使用者原本的飛航模式。
測試作品：氷菓（`hyouka`，44 景點，計畫 81 tiles，估約 9.5 MB）。

Pro：正式設定下（`PREMIUM_ENABLED: true`、沒有購買）是非 Pro，用來測 Paywall。下載案例需要 Pro，
測試時**暫時**在本機把 `constants/FeatureFlags.ts` 的 `PREMIUM_ENABLED` 改成 `false`（等同解鎖，不 commit），Metro reload 後再測，測完改回。

| ID | 目標 | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|---|
| P0 | 前置 | 裝 build、開 App、開氷菓作品頁（deep link `aniseeker://pilgrimage/hyouka`） | 作品頁正常；sheet 有「離線行程包」列，顯示「約 N MB」估計 | 截圖 |
| G1 | 非 Pro 擋下 | 非 Pro 點「下載離線使用」 | 出現 PaywallSheet，功能列有「離線行程包，在日本沒訊號也能用」；沒有開始下載 | 截圖 + `run-as … ls files/offline-packs` 不存在 |
| D1 | 下載前估計 | 切 Pro 後點下載 | 確認對話框顯示「約 N MB：44 個景點…」 | 截圖 |
| D2 | 下載 | 確認下載 | 出現進度 %→完成後列顯示「離線副本 · 2026/11/05」＋大小＋44 個景點 | 截圖；裝置上 tiles 數 = 81、works/hyouka.json 存在、styles/light.json 存在 |
| D3 | 設定頁 | 設定 → 快取 | 「離線行程包」區塊列出氷菓、大小、日期，有「刪除」 | 截圖 |
| D4 | 行程 | 在作品頁把 2 個景點加入行程 | trip 頁（deep link `aniseeker://pilgrimage/trip/hyouka`）線上顯示路線 | 截圖 |
| C1 | 清快取不刪 pack | 設定 → 快取 → 全部清除 | 離線行程包區塊仍在、檔案仍在 | 截圖 + `run-as ls` |
| O1 | 進入離線 | 關 Wi-Fi（飛航已開）、force-stop App | `airplane_mode_on` = 1、Wi-Fi disabled；手機 `ping` 失敗 | adb 輸出 |
| O2 | 冷啟動作品頁 | 冷啟動 → deep link 氷菓 | 景點列表正常；列顯示「沒有網路，顯示離線副本 · 2026/11/05」；地圖有街道底圖＋景點標記 | 截圖（底圖要看得到道路/地名，不是空白） |
| O3 | 離線行程頁 | deep link trip | 路線＋標記＋底圖 | 截圖 |
| O4 | 沒 pack 的作品 | 離線開一部沒下載、快取已清的作品（ゆるキャン△ `yuru-camp`） | 真實錯誤畫面＋「再試一次」，不是假資料 | 截圖 |
| R1 | 恢復網路 | 關飛航 → 回作品頁 | 列回到「離線副本 · 日期」（不是 servedOffline 字樣）；資料來自線上 | 截圖 |
| X1 | 刪除 | 設定 → 快取 → 刪除氷菓 | 區塊變空；`files/offline-packs` 被移除 | 截圖 + `run-as ls` |

不在裝置上跑（只有單元測試）：「Atlas dataVersion 變更 → 提供更新」需要伺服器發新版，PILG-109 覆蓋，裝置上標 UNVERIFIED。
下載失敗＋重試：在下載中途開飛航模式（若時間允許，F1）。

清理：Wi-Fi 開回（飛航維持原狀）、FeatureFlags 改回、解除安裝 `.offline`、刪 `android/`、移除 node_modules symlink、`adb reverse --remove-all` 只移除 8084。

# 離線行程包 — E2E 結果（2026-11-05）

範圍與 build：Samsung S20 FE（SM-G781B，Android 13）。本 worktree prebuild 出 debug dev client，套件 `com.kidneyweakx.aniseekr.offline`（與正式版、`.e2e` 並存），JS = 分支 `claude/offline-trip-pack-ebe054`（6f1359c / 4d2c7ee / 200f08c），Metro :8084 經 `adb reverse`，App 語言 zh-Hant。
基線：手機原本就是「飛航模式＋手動開 Wi-Fi」（行動網路關、ping 1.1.1.1 成功）。離線＝再關 Wi-Fi，以 ping「Network is unreachable」與 DNS 失敗確認。
Pro：正式設定為非 Pro（G1）。D1 起暫時把 `PREMIUM_ENABLED` 改 `false` 解鎖（未 commit，已改回）。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| P0 作品頁列 | 「離線行程包」列＋估計 | 「景點、地址與周邊地圖，約 9.5 MB」＋ Pro 標章＋「下載離線使用」 | PASS | `P0-work-page-online.png` |
| G1 非 Pro | 開 PaywallSheet、不下載 | Paywall 出現，多一列「離線行程包，在日本沒訊號也能用」；`files/offline-packs` 不存在 | PASS | `G1-paywall.png` |
| D1 下載前估計 | 確認框有大小與景點數 | 「約 9.5 MB：44 個景點與周邊地圖…」 | PASS | `D1-confirm.png` |
| D2 下載 | 進度→完成 | 「正在下載地圖… 82%・5.5 MB」→「離線副本 · 2026/11/05・5.8 MB · 44 個景點」。裝置上 81 tiles（z5:1 … z14:25，＝計畫數）、`works/hyouka.json`、`styles/{light,dark}.json`、sprite、glyphs；共 7.4 MB | PASS | `D2-progress.png`、`D2-ready.png` |
| D3 設定頁 | 列出大小/日期/刪除 | 「裝置上的離線行程包 7.5 MB」＋氷菓列＋刪除 | PASS | `D3-settings.png` |
| D4 行程（線上） | 路線＋標記 | 2 站＋路線 | PASS | `D4-trip-online.png` |
| C1 清除所有快取 | pack 保留 | Metadata cache 變「空白」，pack 仍 7.5 MB、檔案都在 | PASS | `C1-after-clear.png` |
| O1 進入離線 | ping 失敗 | airplane=1、Wi-Fi disabled、`connect: Network is unreachable`、DNS 失敗。另外刪掉 MapLibre 環境快取 `mbgl-offline.db`，避免舊瀏覽快取冒充 pack | PASS | adb 輸出（本文） |
| O2 冷啟動作品頁 | 列表＋標記＋底圖，標示離線副本 | 冷啟動後 44 景點列表、標記、道路與地名都在；列顯示「沒有網路，顯示離線副本 · 2026/11/05」。點 EP20 飛到街道級（建物、花里町一丁目、苔川）。從沒線上瀏覽過的掛川景點也有街道。重新建立的 `mbgl-offline.db` 有 0 tiles / 0 resources，所以底圖只可能來自 pack 的 `file://` | PASS | `O2-work-offline.png`、`O2-street-level.png`、`O2-list.png`、`O2-kakegawa.png` |
| O3 離線行程頁 | 路線＋標記＋底圖 | 與線上相同的 2 站、路線、底圖 | PASS | `O3-trip-offline.png` |
| O4 沒 pack 的作品 | 真實錯誤＋重試 | 「無法載入巡禮」＋原始錯誤（UnknownHostException）＋「再試一次」＋返回 | PASS | `O4-no-pack-offline.png` |
| R1 恢復網路 | 不再顯示「沒有網路」 | 封面載入，列回到「離線副本 · 2026/11/05」 | PASS | `R1-online-again.png` |
| F1 下載中斷線→重試 | 失敗＋重試，續傳 | ゆるキャン△（估「約 50 MB」）下載到 13% 時關 Wi-Fi →「下載失敗」＋「重試」。開回 Wi-Fi 重試：已有 213 tiles，續傳完成「30 MB · 244 個景點」，沒有標成部分地圖 | PASS | `F1-b-downloading.png`、`F1-c-failed.png`、`F1-e-done.png` |
| X1 刪除 | 只刪自己的 tiles，最後整個資料夾移除 | 刪氷菓：841 → 776 tiles（共用的 16 張留給ゆるキャン△）；再刪ゆるキャン△：`files/offline-packs` 不存在，區塊顯示空狀態 | PASS | `X1-a.png`、`X1-c-after-hyouka.png`、`X1-d-empty.png` |
| GF 字型修正後重下載 | 新 glyph 範圍存在、掛川離線不再報錯 | 手機在重跑前從 USB 消失（`adb devices` 與 USB 樹都沒有） | BLOCKED | — |
| U1 dataVersion 變更→更新 | 提供「更新」 | 需要 Atlas 發新版，只在單元測試 PILG-109 | UNVERIFIED | — |

整體：BLOCKED（GF）＋ UNVERIFIED（U1）。其餘 in-scope 案例都 PASS。

## 過程中修掉的 bug
- O2 時 dev 畫面報 `Failed to load glyph range 1024-1279 for font stack Noto-Sans-Regular`（掛川附近有西里爾字母的地名；只少那幾個字，地圖照常）。已補 Greek、Cyrillic、字母符號三個範圍。用 curl 確認這 9 個檔案在 OpenFreeMap 都是 200（每個 42–135 KB）。裝置重下載（GF）因斷線未跑。

## 偏差
- 第一次 Metro 打包到 pro-themes worktree 的 `app/`（多個 worktree 共用 node_modules symlink，transform cache 裡 expo-router 的 app root 是別人的）。改用獨立 TMPDIR 啟動 Metro 後重跑，以上結果都是重跑的。
- 中途 `adb reverse` 被別的 session 全部清掉，之後手機斷線。
- 手機斷線時：Wi-Fi 已開回（回到基線）、沒有 pack 檔，但測試用 `com.kidneyweakx.aniseekr.offline` **還沒解除安裝**，要接回手機後執行 `adb uninstall com.kidneyweakx.aniseekr.offline`。

## 觀察（未改）
- O4、F1 的錯誤說明是原始例外字串（UnknownHostException、`FileSystem.downloadFileAsync …`），真實但不友善，可改成本地化文案。
- 設定頁刪除 pack 後，上方「文件目錄」大小要手動「重新計算用量」才更新。
- 行程頁「下一站」名稱是空的（既有行為，非本次改動）。
- ゆるキャン△估計「約 50 MB」實際 30 MB：估計用的平均 tile 大小偏都市，鄉間偏高估。

## code review，未測
- iOS 沒跑。iOS 的 MapLibre 預設是否開本地 CJK 字形（Android 有，高山市等漢字地名有出來）要在 iOS 上確認。
- `style` 依地圖主題選 light/dark，兩份都存了；dark 離線沒截圖。

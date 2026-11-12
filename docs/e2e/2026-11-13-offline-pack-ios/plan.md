# 離線行程包 iOS 驗證計畫（2026-11-13）

目的：11/05 只在 Android 實機跑過，iOS 沒跑。這次確認 Atlas 與 OpenFreeMap 的線上鏈路，並在 iOS 模擬器跑下載→離線顯示。

裝置：既有的 iPhone 18 Pro 模擬器（793562A3）。
Build：`ios/build/dd/Build/Products/Release-iphonesimulator/AniSeekr.app` 的副本，JS 由目前工作目錄（`feat/uiux-cleanup`）`expo export:embed` 重新打包。
測試作品：氷菓（`hyouka`，44 景點，計畫 81 tiles）。沒 pack 的對照：ゆるキャン△（`yuru-camp`）。

只改匯出後的 bundle，不改工作目錄：
- Bundle A：`PREMIUM_ENABLED` 改 `false`（解鎖 Pro，才能下載）。
- Bundle B：A 再加上「JS `fetch` 一律失敗」，模擬沒網路。模擬器共用 Mac 的網路，沒辦法真的斷網，所以這是故障注入，不是飛航模式。原生 MapLibre 的網路沒被擋，靠「MapLibre 環境快取裡 0 張圖磚」證明底圖只來自 pack。

## A. 線上鏈路（curl，不需裝置）

| ID | 目標 | 預期 | 驗證位置 |
|---|---|---|---|
| L1 | Atlas meta | `meta.json` 200，有 `dataVersion` 與 `paths.work` | curl 輸出 |
| L2 | Atlas 資料檔 | `works.json`、`works/hyouka.json`、`moved.json` 200、immutable；氷菓 44 景點 | curl + JSON 計數 |
| L3 | 內建 works 快照 | 與線上 works 的 key 一致 | 比對腳本 |
| L4 | OpenFreeMap 樣式 | positron / dark 200，各有一個 vector source 與 TileJSON | curl |
| L5 | 圖磚、sprite、字型 | z14 圖磚、4 個 sprite 檔、每個字型的 glyph 範圍都 200 | curl |
| L6 | locality API | `/api/v1/locality` 200（活動、集章、88） | curl |

## B. iOS 模擬器

| ID | 目標 | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|---|
| P0 | 前置 | 裝 Bundle A、開 `aniseeker://pilgrimage/hyouka` | 作品頁有「離線行程包」列與大小估計 | 截圖 |
| D1 | 下載 | 點下載→確認 | 進度→「離線副本 · 2026/11/13」＋大小＋44 個景點 | 截圖；容器內 tiles = 81、`works/hyouka.json`、`styles/{light,dark}.json`、sprite 4 檔、glyphs |
| M1 | 強制用離線底圖 | 刪 MapLibre 環境快取、冷啟動、作品頁打開「只用快取圖磚」 | 地圖有道路與地名（含漢字）、景點標記 | 截圖；環境快取 0 張圖磚 |
| O1 | 進入「離線」 | 設定→快取→全部清除；換 Bundle B；刪 MapLibre 環境快取 | pack 還在；Bundle B 已安裝 | 截圖 + 容器檔案 |
| O2 | 離線冷啟動作品頁 | 冷啟動→deep link 氷菓 | 44 景點列表；列顯示「沒有網路，顯示離線副本」；地圖有道路＋標記 | 截圖；環境快取 0 張圖磚 |
| O3 | 街道級 | 點一個景點飛過去 | z14 以上看得到街道與建物 | 截圖 |
| O4 | 沒 pack 的作品 | 開 `yuru-camp` | 真實錯誤＋重試，沒有假資料 | 截圖 |
| K1 | 容器路徑改變後 | 把 `styles/*.json` 內的根路徑改成不存在的舊路徑（模擬 iOS 更新後容器 UUID 改變），冷啟動、離線開作品頁 | 地圖仍有道路（樣式自動改指向現在的路徑） | 截圖 + 樣式檔內容 |
| X1 | 刪除 | 設定→快取→刪除氷菓 | 區塊變空，`offline-packs` 資料夾移除 | 截圖 + 容器檔案 |

事先標記：
- 真機飛航模式：沒有接 iOS 實機，UNVERIFIABLE（這次不跑）。
- dataVersion 變更→提供更新：需要 Atlas 發新版，只有單元測試，UNVERIFIED。
- 非 Pro 擋下（Paywall）：與平台無關的 JS，11/05 Android PASS，這次不重跑。

清理：刪 pack、把模擬器上的 App 換回原本的 Release build、`xcrun simctl shutdown all`。

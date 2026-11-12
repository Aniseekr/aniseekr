# 離線行程包 iOS 驗證結果（2026-11-13）

範圍與 build：iPhone 18 Pro 模擬器（793562A3，iOS 27）。11/11 的 Release 模擬器 build，JS 由 `feat/uiux-cleanup` 工作目錄重新打包。測試用 bundle 只改匯出檔：A = `PREMIUM_ENABLED: false`；B = A 加上 JS `fetch` 一律失敗（故障注入，不是飛航模式）。App 語言 zh-Hant。
基線：模擬器上原本沒有 `Documents/offline-packs`；資料容器 `7CD77F45…`。

## 判定

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| L1 Atlas meta | 200，有 dataVersion | 200，`20261104-6584d5e-f2`，max-age=60 | PASS | curl |
| L2 Atlas 資料檔 | 200、immutable、氷菓 44 景點 | works 779、氷菓 44 景點（43 個有座標）、moved 0 筆，全部 immutable | PASS | curl |
| L3 內建 works 快照 | key 與線上一致 | 779 對 779，差 0 | PASS | 比對腳本 |
| L4 OpenFreeMap 樣式 | positron / dark 200 | 都 200，vector source ＋ TileJSON（maxzoom 14） | PASS | curl |
| L5 圖磚、sprite、字型 | 全部 200 | z14 圖磚、4 個 sprite 檔、3 個字型各 4 個抽查範圍都 200 | PASS | curl |
| L6 locality API | 200 | **404**（`not_found`） | FAIL | curl |
| P0 作品頁列 | 有「離線行程包」列與估計 | 「約 9.5 MB」＋「下載離線使用」 | PASS | `P0-work-page.jpg` |
| D1 下載 | 完成、檔案齊全 | 「離線副本 · 2026/11/13 · 5.8 MB · 44 個景點」；81 tiles（z5:1 … z14:25，＝計畫數）、works、styles、sprite 4 檔、3 字型各 8 個範圍；共 8.1 MB | PASS | `D1-confirm.jpg`、`D1-ready.jpg`、容器檔案 |
| M1 強制用離線底圖 | 道路＋漢字地名＋標記 | 有道路、「Takayama 高山市」；pack 範圍外（上緣）是空白，線上時那裡有道路 | PASS（見偏差） | `M1-forced-offline-style.jpg` |
| O1 清快取不刪 pack | pack 還在 | Metadata cache 變「空白」，pack 仍 8.3 MB，81 tiles | PASS | `O1-after-clear.jpg` |
| O2 離線冷啟動作品頁 | 列表＋「沒有網路，顯示離線副本」＋底圖 | 44 景點、該字樣、道路與地名；MapLibre 環境快取 0 tiles / 0 resources | PASS | `O2-offline-work-page.jpg`、sqlite 計數 |
| O3 街道級 | 街道與建物 | 花里跨線橋：建物、鐵路、「花里町一丁目」、「苔川」 | PASS | `O3-street-level.jpg` |
| O4 沒 pack 的作品 | 真實錯誤＋重試 | 「無法載入巡禮」＋錯誤字串＋「再試一次」＋返回 | PASS | `O4-no-pack-offline.jpg` |
| K1 容器路徑改變後（修正前） | 地圖仍有道路 | 覆蓋安裝後容器變成 `2FEB225E…`，樣式仍指向 `E482530B…`，**底圖全空白，只剩標記** | FAIL | `K1-before-fix-after-reinstall.jpg` |
| K1 重跑（修正後） | 地圖仍有道路 | 同一個失效狀態、不重裝，換上含修正的 bundle：樣式三個網址都改指向 `2FEB225E…`，道路與地名回來；環境快取 0 tiles | PASS | `K1-after-fix.jpg`、樣式檔內容 |
| X1 刪除 | 區塊變空、資料夾移除 | 「還沒有離線行程包」0 KB；`Documents/offline-packs` 不存在 | PASS | `X1-after-delete.jpg` |

整體：FAIL（L6）。K1 已修並重跑通過。

## 失敗

- **L6**：`https://atlas.aniseekr.moe/api/v1/locality` 回 404。`aniseekr-atlas-api` 的 `b4708dc`（加這條路由）只在本機，`main` 比 `origin/main` 多 1 個 commit，還沒部署；上傳用的 `publish-locality.yml` 也還沒進版控。App 端收到 404 會沿用內建資料，不會壞，但活動、集章、88 的資料不會更新。需要推上去並部署（要 Kidney 決定）。
- **K1**（已修）：iOS 每次覆蓋安裝都會換資料容器路徑（這次實測 `7CD77F45` → `E482530B` → `2FEB225E`），而 `styles/<mode>.json` 存的是絕對 `file://` 路徑。更新 App 後離線底圖就空白，要重新下載才會好，而人在沒訊號的地方時做不到。修正：`offlinePackStore.offlineStyleUri()` 每次啟動檢查一次，路徑不同就改寫（`rehomeOfflineStyle`，回歸測試 PILG-114）。Android 的路徑固定，不受影響。

## 沒跑／無法確認

- iOS 實機飛航模式：沒有接實機。UNVERIFIABLE。
- dataVersion 變更→提供更新：要 Atlas 發新版，只有單元測試 PILG-109。UNVERIFIED。
- 深色離線樣式：兩份都有存，離線沒截圖。UNVERIFIED。
- 非 Pro 擋下：這次沒重跑（11/05 Android PASS）。

## 狀態變更與清理

- 模擬器上 App 的 Metadata cache 被清空（測試步驟的一部分）。
- 行程包已刪；模擬器上的 App 已換回原本的 Release build（確認不含注入字串）；`simctl shutdown all`。
- 沒有改任何遠端資料。

## 偏差

- M1 原訂用「環境快取 0 張圖磚」驗證，但冷啟動先載入線上樣式，快取裡本來就會有 7 張。改用「pack 範圍外是空白」判斷樣式確實切換；O2、K1 才有嚴格的 0 張檢查。
- 模擬器不能只斷自己的網路，離線是用 JS `fetch` 注入模擬。原生 MapLibre 的網路沒擋，以環境快取 0 筆證明底圖沒走網路。

## code review，未測

- 圖磚網址帶 planet 版本（現在是 `20261101_080013_pt`），已存在的圖磚續傳時不重抓，所以「更新」行程包只更新景點資料，圖磚不會更新；跨版本混用通常看不出來。
- 下載失敗與沒 pack 時顯示的是原始例外字串，沒有本地化。
- 快取設定頁的分區名稱與說明（Metadata cache 等）是寫死的英文。
- 作品頁的離線列有兩行說明字，和「列上不放說明小字」的方向不一致。

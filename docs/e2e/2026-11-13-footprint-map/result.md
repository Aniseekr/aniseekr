# 足跡地圖 E2E 結果（2026-11-13，階段 2）

範圍與 build：iPhone 18 Pro 模擬器（iOS 27），11/11 的 Release build，JS 由工作目錄打包後換進已安裝的 App。Bundle：R＝工作目錄原樣；L＝R 但 `checkInSpot` 不寫章明細；B＝R 加 JS `fetch` 一律失敗。L、B 只改匯出檔。App 語言 zh-Hant（M9 切 English）。
基線：氷菓 現地 5 · 補記 1，全在高山市（21203）。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| M0 分頁 | 時間流／作品／集章冊／地圖，字完整 | 四個都完整（zh） | PASS | `M1-one-prefecture.jpg` |
| M1 一個縣 | 「1 個都道府縣・1 個市區町村」，只有岐阜上色，一列「岐阜県 6 個景點」 | 相符，沒有「還沒歸類」 | PASS | `M1-one-prefecture.jpg` |
| M2 縣的明細 | 岐阜県／高山市／冰菓 6 個景點 · 現地 5 | 相符 | PASS | `M2-prefecture-sheet.jpg` |
| M3 進集章帳 | sheet 關閉，開氷菓集章帳，有標題與封面 | 相符（現地 5 · 補記 1 · 6 / 44） | PASS | `M3-stamp-book-from-map.jpg` |
| M4 點方格 | 點「岐阜」格開同一個 sheet；返回後仍在地圖分頁 | 相符 | PASS | `M4-tile-tap.jpg` |
| M5 舊紀錄 | L：勾「2.5次元的誘惑」1 個景點，只有「去過」沒有明細 | 石と光の広場（Atlas：13108 江東区）變外框勾，「去過 1」 | PASS | `M5a-work-opened.jpg`、`M5b-legacy-checkin.jpg` |
| M6 離線＝未歸類 | B：只有岐阜上色，「1 個還沒歸類」，標題 1・1 | 相符；上方「7 去過的場景」 | PASS | `M6-offline-unplaced.jpg` |
| M7 補齊 | R：不用操作，東京上色，「2 個都道府縣・2 個市區町村」，「還沒歸類」消失 | 相符；岐阜（6）比東京（1）深一級 | PASS | `M7-backfilled.jpg` |
| M8 新縣的明細 | 市名與 Atlas 一致，作品「2.5次元的誘惑」 | 東京都／江東区／2.5次元的誘惑　1 個景點（Atlas `cities.json`：13108＝江東区） | PASS | `M8-tokyo-sheet.jpg` |
| M9 英文 | 英文字串、羅馬字縣名、分頁字完整 | 第一次：分頁變成「Time…／Works／Sta…／Map」（FAIL，四個分頁擠不下）。修正後重跑：「Timeline／Works／Stamps／Map」，「Prefectures 2 · Cities 2」，Gifu／Tokyo | PASS（修正後重跑） | `M9-map-en.jpg`（修正前）、`M9b-map-en-fixed.jpg` |

整體：in-scope 案例全 PASS（M9 是修正後重跑才過）。

## 修正

- M9：四個分頁共用一列時改用小一級的字（和作品頁的篩選列同做法），英文「Stamp book」改成「Stamps」。中文分頁字也跟著小一級（`Z-zh-restored.jpg`）。
- sheet 左右留白重複了一層，已拿掉（M8 之後的截圖是修正後的樣子）。

## 沒跑／無法確認

- 空狀態（沒有任何章時的「還沒有足跡」）：要清掉 App 資料，沒跑。UNVERIFIED。
- 最深一級上色（同一縣 10 個景點以上）：資料不夠，沒出現。UNVERIFIED。
- 淺色模式與其他主題色：沒截。UNVERIFIED。
- 城市名單還沒載入時 sheet 顯示代碼：沒遇到。UNVERIFIED。
- Android：沒跑。

## 狀態變更與清理

- 模擬器的 App 資料多了「2.5次元的誘惑／石と光の広場」1 個補記（測試資料），並已被補上明細。
- App 語言改回「跟隨系統」；bundle 換回原本的（比對一致）；`simctl location clear`；`simctl shutdown all`。

## 偏差

- 無。

## code review，未測

- 英文「1 spots」沒有單複數（沿用既有字串 `pilgrimageUi.spotsCount`，App 的字串系統沒有複數規則）。
- 方格上的縣名在所有語言都是日文漢字兩個字；下方清單與 sheet 才依語言顯示（中日文＝日文原名，其他＝羅馬字）。

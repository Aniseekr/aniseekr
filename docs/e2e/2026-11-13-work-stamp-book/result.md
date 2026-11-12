# 作品集章帳 E2E 結果（2026-11-13，階段 1 第一批）

範圍與 build：iPhone 18 Pro 模擬器（iOS 27），11/11 的 Release build，JS 由工作目錄打包後換進已安裝的 App。定位用 `simctl location set`，權限用 `simctl privacy grant`。App 語言 zh-Hant（S10 切 English）。
基線：氷菓 0 個去過。先用改動前的 bundle 勾了 2 個景點（加茂荘花鳥園、千反田邸のモデル）當舊紀錄。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| S0 基線＋舊資料 | 舊 bundle 勾 2 個 | 「去過 2」 | PASS | `S0-old-bundle-two-visited.jpg` |
| S1 舊紀錄＝補記 | 外框勾、去過 2 | 換新 bundle 後兩個都是外框勾，「去過 2」，進度列出現「集章帳」 | PASS | 畫面截圖（S2 同畫面） |
| S2 補記 | 位置在東京勾一個 → 外框勾、沒動畫 | 平湯バスターミナル變外框勾 | PASS（見偏差） | `S2-manual-third.jpg` |
| S3 集章帳 | 補記是細圈、其餘虛線空格、數字正確 | 「現地 0 · 補記 2 · 2 / 44」，2 個細圈章＋日期，其餘虛線 | PASS | `S3-stamp-book-manual.jpg` |
| S4 現地章 | 位置在鍛冶橋 → 蓋章動畫＋實心勾 | 大章「11/13」落下＋「蓋了 4 個現地章」，該列變實心勾 | PASS（見偏差） | `S4-stamp-press-overlay.jpg` |
| S5 同地點一起蓋 | 範圍內同作品景點一起變現地章 | 0 m（exact）、83 m／103 m／267 m（area，300 m 內）共 4 個變實心；178 m（landmark）與 295 m（exact）沒蓋。「去過 6」 | PASS | `S5-after-onsite.jpg` |
| S6 補記升級 | 在舊紀錄的景點旁點它 → 不被取消、變現地章 | 千反田邸のモデル（0 m）變實心勾，顯示「升級成現地章」，「去過」仍是 6 | PASS | `S6-at-chitanda-model-before.jpg`、`S6-upgrade-overlay.jpg` |
| S7 取消現地章要確認 | 出現確認框；取消後章還在；確認後移除 | 第一次跑：兩顆按鈕都寫「取消」（FAIL，文案）。修正後重跑：「取消／移除」；按取消章還在；按移除後該列變空心、「去過 5」 | PASS（修正後重跑） | `S7-remove-onsite-confirm.jpg`（修正前）、`S7b-remove-confirm-fixed-copy.jpg`、`S7c-after-remove.jpg` |
| S8 集章帳（混合） | 現地章在前（實心雙圈＋日期），補記其次 | 「現地 5 · 補記 1 · 6 / 44」，排序與樣式符合 | PASS | `S8-stamp-book-mixed.jpg` |
| S9 手帳集章冊 | 出現氷菓本子與數字 | 「冰菓　現地 5 · 補記 1 · 6 / 44」＋ 6 個小章 | PASS | `S9-journal-stamp-tab.jpg` |
| S9b 手帳統計 | 與章一致 | 第一次：上方寫「0 去過的場景／0 枚集章」（FAIL，統計只算照片）。修正後重跑：「6 去過的場景／0 張照片／5 枚集章」 | PASS（修正後重跑） | `S9b-journal-stats.jpg` |
| S10 英文 | 字串是英文 | 「Stamp book」「On site 4 · Noted 1 · 5 / 44」 | PASS | `S10-stamp-book-en.jpg` |

整體：in-scope 案例全 PASS（S7、S9b 是修正後重跑才過）。

## 沒跑／無法確認

- 靠近提示（banner）本身與「蓋這裡的 N 個章」按鈕：這輪 sheet 一直是展開的，蓋住地圖上的提示，沒看到。現地蓋章是從清單的勾觸發的，走的是同一段邏輯，但提示的畫面 UNVERIFIED。
- 舊紀錄由 Atlas 補齊（沒有章明細的去過 → 出現在手帳集章冊）：加茂荘花鳥園在 S2 的過程中被我誤點取消，千反田邸是升級時就寫入了明細，所以補齊的路徑沒有在裝置上跑到，只有單元測試 PILG-118。UNVERIFIED。
- 「制霸」完成章：沒跑。UNVERIFIED。
- 取消一個補記（不需確認）：誤點時發生過一次，行為符合設計，但不是計畫內的步驟。
- Android：沒跑。
- 照片蓋章、備份還原：還沒實作。

## 狀態變更與清理

- 模擬器的 App 資料裡留下氷菓 5 個打卡（測試資料）。
- App 語言改回「跟隨系統」（`Z-language-restored.jpg`）；bundle 換回原本的；`simctl location clear`；`simctl shutdown all`。

## 偏差

- S2 計畫是「勾第 3 個」，實際 sheet 還在動畫中時點了兩下，結果是加茂荘花鳥園被取消、平湯被勾上，所以之後的數字都比計畫少 1（補記 2 而不是 3）。判定用實際狀態對照。
- S4 計畫是從靠近提示蓋章，實際從清單第一列（0 m）的勾蓋。
- 英文版集章帳是用沒帶封面參數的 deep link 開的，封面是空的；已補上「沒帶參數時用作品資料的封面」，這個修正沒有重跑。

## 第二批：照片蓋章

基線：氷菓「現地 4 · 補記 1 · 5 / 44」，花里跨線橋（EP21）未蓋（`F0-stamp-book-before-photo.jpg`；這張同時確認了「沒帶封面參數時用作品封面」的修正）。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| F1 匯入帶座標的照片 | 歸到氷菓／花里跨線橋 | 「匯入 1 張 · 1 張在聖地」「冰菓　花里跨線橋　1 張」，時間流出現 10月5日 | PASS | `F1-import-result.jpg` |
| F2 照片蓋現地章 | 花里跨線橋變現地章，日期 10/5 | 實心雙圈 EP21，日期 10/5；「現地 5 · 補記 1 · 6 / 44」 | PASS | `F2-stamp-book-after-photo.jpg` |
| F3 手帳統計 | 章數 +1 | 匯入當下那一頁還停在「4 枚集章」（FAIL：統計只在回到頁面時重讀）。修正後重開：「6 去過的場景／1 張照片／5 枚集章」 | PASS（修正後，見下） | `F1-import-result.jpg`（修正前）、`F3-journal-stats-after-photo.jpg` |

- F3 修正後只確認了重開後的數字；「匯入後不離開頁面就更新」這個時機沒有重跑一次匯入。UNVERIFIED。
- App 內相機拍照蓋章：模擬器沒有相機，沒跑；和匯入走同一個存檔函式（`recordCapture`）。UNVERIFIED。
- 備份匯出與合併還原：沒在裝置上跑，只有 PILG-117。UNVERIFIED。
- 測試照片留在模擬器相簿與 App 的足跡裡（測試資料）。bundle 已換回、模擬器已關。

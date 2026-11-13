# 廣告版位整體配置 — E2E 結果（2026-11-13）

範圍與版本：iPhone 18 Pro 模擬器（iOS 27.2，已被清空，全新安裝），繁中。
殼：03:23 編的 Release 模擬器版（`ios/build/dd`，含小工具與背景定位原生模組）。
JS：commit `4a55b2f` 用 `expo export:embed --dev false` 匯出，正式 iOS 原生廣告單元，模擬器收到的是 AdMob 測試廣告。
只在匯出的 bundle 副本加 `[ads-e2e]` log，原始碼沒動。沒有點任何廣告。Android、實機未跑。

**總判定：4 個版位都出現且排版正確（D1–D4、D6 PASS）；D5 停留時間實測 1734ms，超出計畫容許的 1500±150ms；C3 失敗重試沒跑。**

| 案例 | 預期 | 實際 | 判定 | 證據 |
| --- | --- | --- | --- | --- |
| P0 Preflight | 趨勢頁出現，log 有 `request` | 趨勢頁出現；16:03:43 `request` | PASS | ads-e2e-log.txt |
| D1 趨勢內嵌列 | 第 05、06 名之間一列廣告：「廣告」標記、標題、動作鈕 | 相符；AdChoices 在右上角，沒壓到動作鈕；validator「No implementation issues found」 | PASS | d1-trending-row.png |
| D2 詳情頁不滑不請求 | 進詳情後不滑動，沒有新的 `request` | 進詳情後停 7 秒，log 無新增 | PASS | d2-detail-no-scroll.png、log 16:03:46→16:04:26 之間無 request |
| D3 詳情頁內嵌卡片 | 開始滑動後 `request`→`load-ok`→`inline-shown variant=card`；位置在觀看平台之後、相關作品之前；圖完整不裁切 | 16:04:26 滑動後才 request，16:04:28 顯示；位置相符；圖撐滿寬度、完整 | PASS | d3-detail-card.png |
| D4 類型頁內嵌列 | 熱門榜第 5 名後一列廣告 | 相符（動作類，第 5、6 名之間） | PASS | d4-genre-row.png |
| D5 滑卡廣告停留 | `deck-ad-top` 與 `deck-ad-unlocked` 相差 1500ms（±150） | 第 8 張後出現廣告卡；相差 1734ms（超出容許 84ms） | FAIL（只超出時間容許值） | ads-e2e-log.txt 最後兩行、d5-deck-ad-entering.png |
| D6 滑卡廣告媒體區 | 圖撐滿卡片寬、完整不裁切 | 相符 | PASS | d6-deck-ad-card.png |
| C3 失敗後 30 秒重試 | `load-fail` → 30 秒內 `skip-backoff` → 之後恢復 | 沒跑（沒做注入無效單元的 Bundle B） | 未執行 | — |

## D5 說明

- 量到的是 JS 端兩行 log 的時間差：第一行在計時動畫啟動前印，第二行要等動畫結束再從 UI 執行緒排回 JS，所以包含兩段排程延遲。只跑了一次，沒有重跑。
- 鎖定時間比設計值長、不是短：「廣告要在畫面上滿 1 秒」的目的有達到。是否要把 1500 調短或放寬容許值，沒有動程式。

## 未驗證

- C3 失敗後重試：只有單元測試（`native-ad-backoff.test.ts`）涵蓋退避時間的計算，實機沒跑。
- 付費用戶不顯示廣告：需要沙盒購買，沒跑。
- `impression` 事件：這次沒有加這行 log，只用截圖確認廣告在畫面上。
- 詳情頁有「聖地巡禮」卡片時的排版：測的作品沒有聖地卡。
- Android、實機、正式環境填充率。

## 偏差

- 計畫的執行者（廣告線 session）沒跑完，改由管理 session 執行。
- 模擬器是清空後的狀態，從 onboarding 用 deep link 進頁面；每次 deep link 會跳系統確認框。
- 類型頁第一次開啟時誤觸進了一部作品的詳情，返回後重開類型頁再截圖（log 裡 16:04:43 與 16:05:21 兩次 row 請求就是這個原因）。
- 滑卡時有兩次滑動被當成點擊而進了詳情頁，返回後繼續；不影響第 8 張後出廣告的結果。

## 清理

測試版已從模擬器移除，模擬器已關機。工作目錄沒有暫時程式。

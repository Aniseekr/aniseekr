# Run C E2E 計畫 — 付費牆恢復 + App→Web 連結 + 相機匯入（2026-11-04）

裝置：iPhone 18 Pro 模擬器（dev client），JS = 工作樹（Run C 未 commit）。App 語言 zh-Hant。

| ID | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|
| C1 | 開「設定」 | 出現 Premium 區塊，標題「Aniseekr Premium」（zh-Hant 翻譯），沒有英文原文 | 截圖 |
| C2 | 設定 → 主題，看付費主題 | 付費主題顯示「僅限 Premium」說明；點下去開付費牆而不是直接套用 | 截圖 |
| C3 | 開付費牆 | 顯示 RevenueCat 方案＋價格，或真實的載入／無方案（可重試）／不支援狀態；不出現假價格或「—」 | 截圖 + Metro log |
| C4 | 個人頁 | Premium CTA 出現 | 截圖 |
| C5 | 聖地 → 冰菓作品頁 → sheet footer | 有「在網頁開啟地圖與行程規劃」按鈕 | 截圖 |
| C6 | 點 C5 按鈕 | 開啟 `https://aniseekr.moe/zh-tw/works/hyouka?utm_source=app&utm_medium=work` | 瀏覽器 URL 截圖 |
| C7 | 相機比對頁（無參考圖） | 顯示「匯入這一幕的截圖」主按鈕 + 「第 N 集 · mm:ss」提示（有時間時） | 截圖 |
| C8 | 點 C7 按鈕 → 從相簿匯入一張圖 | 主按鈕消失；REF 縮圖顯示匯入的圖片 | 截圖 |

購買流程：本機沒有 StoreKit 設定檔 → 完成購買標 UNVERIFIED，不執行。

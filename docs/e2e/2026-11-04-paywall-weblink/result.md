# Run C E2E — 付費牆恢復 + App→Web 連結 + 相機匯入（2026-11-04）

範圍與 build：iPhone 18 Pro 模擬器，dev client，JS = 工作樹（Run C 未 commit），App 語言 zh-Hant。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| C1 設定 Premium | 有 Premium 區塊、中文文案 | 「解鎖 Premium／無廣告、全部主題、無限同步」+ 升級 | PASS | `C1-settings.jpg` |
| C2 付費主題 | 有 Premium 標記；點了開付費牆、不套用 | Cyberpunk／Survey Corps 有鎖頭標記；點 Cyberpunk 開付費牆，主題仍是 Aniseekr | PASS | `C2-appearance.jpg`、`C2-premium-theme-tap.jpg` |
| C3 付費牆方案 | RevenueCat 價格，或真實錯誤狀態 | 「目前無法載入訂閱方案。重試」，沒有假價格；Metro log：RevenueCat 回報 dashboard 的 offering 沒有登記 App Store 商品 | UI PASS／價格 BLOCKED | `C3-paywall.jpg` |
| C4 個人頁 CTA | Premium CTA 出現 | 「解鎖 Premium」+ 升級 | PASS | `C4-profile.jpg` |
| C5 作品頁網頁按鈕 | sheet footer 有按鈕 | 「在網頁開啟地圖與行程規劃」 | PASS | `C5-web-button.jpg` |
| C6 開網頁 | `aniseekr.moe/zh-tw/works/hyouka?utm_source=app&utm_medium=work` | SafariVC 開 aniseekr.moe 冰菓頁（繁中介面、44 個景點）；URL 函式輸出與 curl 200 | PASS | `C6-web-open.jpg`、`C6-urls.txt` |
| C7 相機無參考圖 | 主按鈕 + 集數提示 | 「匯入這一幕的截圖」+「第 21 集」（此景點無時間） | PASS | `C7-compare-empty.jpg` |
| C8 匯入後 | 主按鈕消失、REF 顯示圖片 | 按鈕 → 選擇參考圖 sheet → 匯入截圖 → 相簿；匯入後 REF 縮圖是該圖，疊圖套上 | PASS | `C8-picker-sheet.jpg`、`C8-library.jpg`、`C8-after-import.jpg` |

整體：範圍內 BLOCKED（C3 價格）。

## BLOCKED／UNVERIFIED
- C3 價格：RevenueCat dashboard 的 offering 沒有 App Store 商品（log 原文 "there are no App Store products registered in the RevenueCat dashboard for your offerings"）。要在 RevenueCat 後台把 App Store 商品掛進 offering 才能再測；完成購買本來就 UNVERIFIED（沒有 StoreKit 設定檔）。
- 行程頁的網頁按鈕：沒跑（模擬器上沒有已規劃的行程）。共用同一個 URL 函式，`C6-urls.txt` 有 trip 版本輸出。

## 偏差
- C6 第一次點擊落在捲動慣性中，點到景點列（展開了「拍照比對」列）；等停穩後重點，結果如上。

## code review, not tested
- 付費牆列出「無限同步平台」「巡禮離線地圖」，但程式裡 `isPro` 只鎖主題，`adFree` 只管廣告；同步和離線地圖對所有人都免費。這是恢復前就有的文案。

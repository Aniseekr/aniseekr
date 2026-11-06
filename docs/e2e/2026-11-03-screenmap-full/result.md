# Screenmap 全頁擷取＋v6 UI 統一 — 結果

範圍：既有 iPhone 18 Pro 模擬器（iOS 27）、本機重編 Debug build（1.2.1，Xcode 27.2；先補裝 Metal Toolchain）、Metro :8081、預設 `aniseeker` 主題（深色）、英文介面。onboarding 以 Skip 完成；未登入、未同步、未刪除。

擷取物：`.screenmap/out/before/`（改動前）、`.screenmap/out/screens/`（最終）、`.screenmap/out/screens-v1/`（第一版「重框線」中間稿）、`.screenmap/out/*.scrmap`。

## 判定

| ID | 預期 | 實際 | 判定 |
| --- | --- | --- | --- |
| C1 | onboarding 後進 tab 首頁 | Skip → Get started → Discover | PASS |
| C2 | 59 個靜態路由皆擷取並分類 | 59/59 擷取；分類見 `capture-status.json` | PASS |
| C3 | 6 個動態路由以真實點擊進入 | anime/[id]、pilgrimage/[animeId] 以點擊進入；其餘 4 個見下 | 部分 BLOCKED |
| C4 | 6 個 OAuth callback 照實分類 | 無 code 參數時導回 Account 頁，記為 auth-wall | PASS |
| C5 | 打包 .scrmap、viewer 載入 | `AniSeekr-2026-11-03.scrmap`：65 節點、131 連線、61 張截圖；`map.html` 在瀏覽器載入，顯示狀態標籤與 4 個無截圖路由 | PASS |
| U1 | 共用控制項同一套圓角 | 按鈕／chip／輸入框／icon 按鈕 4pt、卡片 6pt、大面板 8pt；417 處散落 radius 收斂 | PASS（截圖比對） |
| U2 | 換 accent 全部跟著變 | 未在本輪執行 | UNVERIFIED |
| U3 | 按壓回饋 | 程式改為 lg CTA 下沉、其他按鈕縮放；未錄影驗證 | UNVERIFIED |

## 這輪修掉的「漏掉的點」（皆有截圖對照）

- 分享頁開啟即崩潰（Worklets：`cornerPinHomography` 在 UI runtime 被呼叫；修好後又因 worklet 閉包在建立時捕捉、`solveLinearSystem` 宣告在後面而變 `undefined`）→ 標成 worklet 並把 solver 移到前面。before 截圖中 share 之後 8 頁全是紅屏。
- Attribution 頁顯示原始 i18n key（`settings.attribution.source.*`，實際 key 在 `attributionScreen`）→ 修正並改用 `TranslationKey` 型別，打錯會編譯失敗。
- Rating 頁 Plan 色寫死 iOS 藍 `#0A84FF` → 跟主題 accent。
- Browse Source 頁用靜態 `Colors.*`，不跟主題 → 改用設定頁共用版型。
- Account 的 Connect／Disconnect 自刻按鈕 → `ThemedButton`；SIMKL 黑色圖示在深色卡片上看不見 → 對比不足時改用文字色。
- 通知頁副標顯示 OS 列舉值「undetermined」→ 本地化成「Not set／尚未設定」。
- Camera diagnostics 副標寫死英文 → 進 i18n。
- 7 種不同的返回鍵／標題列樣式 → 共用 `ScreenHeader`／`ThemedIconButton`。
- 作品詳情頁用 NativeWind 寫死 zinc／白／藍、圓形按鈕 → 主題色＋統一圓角。

## 未修、需要決定或外部因素（code review / 觀察，非測試結論）

- 聖地巡禮「Explore more」封面與作品聖地資料全空：`image.anitabi.cn` 從本機 IP 回 403（Cloudflare 風控，#94）。UI 正確顯示無資料，但詳情頁寫「No pilgrimage data yet」對被擋的請求是誤導文案。
- Nearby 區塊在定位權限提示被打斷後一直顯示骨架。
- `compare/tips` 沒有參考圖時一直顯示「Analyzing…」，沒有轉成無資料狀態。
- 首頁區段標題（Discover／Schedule／Pilgrimage）各自實作，尚未套用設定頁的小色塊標記。

## 其他

- 動態路由：pilgrimage/trip、pilgrimage/event、collection/[id]（需使用者自建資料夾）、compare/[spotId]（需相機與真實景點）未擷取，記為 needsNavigation。
- 模擬器上另裝的 Solidarity（creds.id）App 曾跳出「要在 creds.id 中打開嗎」，與本 App 無關。
- 動態路由的 pilgrimage/[animeId]：從列表點進去標題顯示「—」，列表已有片名卻沒透過 route params 帶過去（CLAUDE.md 規則 10），未修。
- 設計取捨：依使用者「簡潔明瞭」回饋，中途把每個 chip／icon 按鈕都加粗框＋硬陰影的版本（`screens-v1/`）收斂成：只有 lg 主要 CTA 有硬陰影，其餘一律細框或平面。

## 專案檢查

- `bunx tsc --noEmit`：通過。
- `bun run test:unit`：1752 pass／0 fail。
- 改動的 155 個檔案 scoped ESLint：0 error；Prettier 已套用。
- `bun run lint` 全專案：既有 1123 個 error（例如未改動的 `notification-service.ts`），非本次造成。
- 清理：模擬器已關、Metro 已停、本機 http 伺服器已停。

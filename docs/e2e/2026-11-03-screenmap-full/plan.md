# Screenmap 全頁擷取＋v6 漫畫風 UI 統一 — 測試計畫

範圍：既有 iPhone 18 Pro（DD354DEA…）模擬器、本機 Debug build（Metro :8081）、預設 `aniseeker` 主題（橘×黑）、深色、英文介面。
不登入任何平台、不執行同步、不按刪除／購買／登出。onboarding 用 Skip 完成（僅改模擬器本機偏好）。

## 擷取（before / after 各一輪）

| ID | 步驟 | 預期 | 驗證位置 |
| --- | --- | --- | --- |
| C1 | 完成 onboarding 後 `aniseeker://` | 進入 tab 首頁，不是錯誤畫面 | 模擬器截圖 |
| C2 | 對 59 個靜態路由逐一 deep link，等 1.5–4 秒後截圖到 `.screenmap/out/screens/<slug>.png` | 每張截圖的標題對得上路由；分類 ok / empty-state / not-found / error-boundary / auth-wall / loading | 截圖 + `capture-status.json` |
| C3 | 6 個動態路由（anime/[id]、pilgrimage/[animeId]、trip/[animeId]、event/[eventId]、collection/[id]、compare/[spotId]）從 App 內點擊進入真實資料 | 顯示真實作品／景點，不是 not-found | 截圖標題與資料一致 |
| C4 | 6 個 OAuth callback 路由（*-auth） | 無 code 參數時的畫面（預期為錯誤或返回），照實分類 | 截圖 |
| C5 | pack `.scrmap`，viewer 載入 | 65 節點，擷取數 = 實際成功數 | viewer 截圖 |

相機類路由（explorer-camera、pilgrimage/capture、compare/*、companion/*）在模擬器沒有相機，預期是權限／無相機狀態，照實記錄，不算 ok。

## UI 統一（after）

| ID | 檢查 | 預期 | 驗證位置 |
| --- | --- | --- | --- |
| U1 | 共用按鈕／卡片／chip 圓角 | 同一套 v6 圓角 token，無 pill 與 20px 混用 | after 截圖逐頁對照 |
| U2 | 換 accent（設定 → 主題色選其他色） | 按鈕、硬陰影、標籤都跟著換色；淺色 accent 上文字仍可讀 | 截圖 |
| U3 | 按壓按鈕 | 硬陰影收回＋位移，無閃爍 | 模擬器操作 |

清理：結束後 `xcrun simctl shutdown all`、停 Metro。

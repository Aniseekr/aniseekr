# 廣告版位整體配置 — E2E 計畫（2026-11-13）

範圍：滑卡廣告停留與媒體區、詳情頁內嵌卡片、趨勢／類型列表內嵌列、失敗後重試（上一輪未完成的 C3）。

裝置：既有的 iPhone 18 Pro 模擬器（793562A3）。**開跑前確認沒有別的 session 在用**（`docs/e2e/2026-11-13-*` 近 3 分鐘無新檔、無 simctl 行程）。
Build：模擬器上既有 Release 殼 + `expo export:embed --dev false` 匯出的 bundle。`__DEV__=false` → 正式 iOS 原生廣告單元；模擬器是 AdMob 測試裝置。
只改匯出後的 bundle，不改工作目錄：
- Bundle A：加 `[ads-e2e]` log（request / load-ok / load-fail / skip-backoff / impression / inline-shown / deck-ad-top / deck-ad-unlocked / insert）。
- Bundle B：A 再加「每次啟動的第一個廣告請求用無效 unit id」。
Log 讀取：`simctl spawn booted log stream`，過濾 `ads-e2e`。**不點任何廣告。**

| ID | 目的 | 步驟 | 預期可觀察結果 | 驗證位置 |
|----|------|------|----------------|----------|
| P0 | Preflight | 換 Bundle A、冷啟動、開 `aniseeker://trending`（送兩次） | 趨勢頁出現；log 有 `request` | 截圖 + log |
| D1 | 趨勢列表內嵌列 | 停在趨勢頁頂端 | 第 05 名與第 06 名之間有一列廣告：有「廣告」標記、標題、動作鈕；log `inline-shown variant=row` 與 `impression` | 截圖 + log |
| D2 | 詳情頁不滑動不請求 | 從趨勢點第 1 名進詳情，不滑動等 5 秒 | 進詳情後沒有新的 `request` | log（時間區間內無 request） |
| D3 | 詳情頁內嵌卡片 | 在詳情頁開始往下滑到「相關作品」上方 | 開始滑動後出現 `request` → `load-ok` → `inline-shown variant=card`；卡片在「聖地巡禮／觀看平台」之後、相關作品之前；媒體圖完整不裁切；滑到可見後有 `impression` | 截圖 + log |
| D4 | 類型頁內嵌列 | 探索首頁點一個類型 | 熱門榜第 5 名後有一列廣告；log `inline-shown variant=row` | 截圖 + log |
| D5 | 滑卡廣告停留 1.5 秒 | 類型頁點開始滑卡，滑 8 張到廣告 | `deck-ad-top` 與 `deck-ad-unlocked` 相差 1500ms（±150） | log 時間差 |
| D6 | 滑卡廣告媒體區 | D5 的廣告卡在頂端時截圖 | 媒體圖撐滿卡片寬、完整不裁切（對照上一輪只佔左側的截圖） | 截圖 |
| C3 | 失敗後 30 秒重試 | 換 Bundle B、冷啟動、開趨勢頁；等 35 秒後返回再進趨勢頁 | `request` → `load-fail`；30 秒內再進入為 `skip-backoff`；30 秒後 `request` → `load-ok` → `inline-shown` | log 時間戳 |

事先標記：
- 付費用戶不顯示廣告：UNVERIFIABLE（需要沙盒購買），只做 code review。
- 正式環境填充率與單價：UNVERIFIABLE。
- Android：不跑。

清理：還原 app 原本的 `main.jsbundle`；工作目錄無暫時程式；模擬器若無其他 session 使用則關機。

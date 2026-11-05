# Pro 匯出：E2E 計畫（2026-11-05）

**範圍**：比對分享卡（`app/compare/share.tsx`）和巡禮相簿（`app/(tabs)/pilgrimage/journey.tsx`）的匯出。目標是 Pro 多出去浮水印、新標記樣式、原圖解析度，免費版原有的選項一個都不少。

**環境**：iPhone 18 Pro 模擬器（iOS 27.2），使用主 checkout 在 11/4 編好的 debug dev client `kidneyweakx.aniseeker`，JS 從本 worktree 的 Metro :8081 載入。

**測試資料**：3 張用 ImageMagick 產生的 4032×3024 JPG，內容是 plasma 加棋盤格加「TEST n」字樣。用 `simctl addmedia` 加進相簿，再從「足跡 → 匯入照片」匯入。另外匯入 2 張模擬器內建照片。

**檢查方式**：
- 比對卡存到相簿後，從模擬器的 `data/Media/DCIM/100APPLE/` 取出最新的 PNG。
- 相簿分享時，從 app container 的 `tmp/ReactNative/` 取出最新的 JPG。
- 尺寸用 `sips` 讀。浮水印和標記用肉眼看裁切圖確認。
- 細節是否真實：同一區塊裁 700×500，看文字邊緣是銳利還是糊的。

**Pro 怎麼開**：沒有 RevenueCat 沙盒帳號。用既有的開發路徑：暫時把 `constants/FeatureFlags.ts` 的 `PREMIUM_ENABLED` 改成 `false`，`useSubscription().isPro` 就會是 true，Metro 熱更新。測完改回來，不 commit。Pro 案例因此都記為「強制 isPro」。

## 基準（改動前，免費）

| ID | 步驟 | 記錄 |
|---|---|---|
| B1 | TEST 1 → 預覽 → 分享，1:1 拍立得，分別存 1080p 和 4K | 檔案尺寸、有沒有 Aniseekr 浮水印、細節 |
| B2 | 11/5 相簿 → 分享 | 檔案尺寸、底部的 Aniseekr 字樣 |

## 案例

| ID | 身分 | 步驟 | 預期 | 在哪裡驗證 |
|---|---|---|---|---|
| F1 | 免費 | 開分享頁 | 「Aniseekr 標記」預設「不加」；文字可選；印章和日期＋地點有 Pro 鎖；720p／1080p／4K 可選，原圖有 Pro 鎖 | 截圖 |
| F2 | 免費 | 點「印章」 | 開出付費牆，裡面有「分享圖可去浮水印…」這一列；標記沒有變 | 截圖 |
| F3 | 免費 | 點「原圖」 | 開出付費牆；解析度維持原本的選擇 | 截圖 |
| F4 | 免費 | 標記選「文字」、1080p、存檔 | 1080×1080 PNG，照片右下角有 Aniseekr | DCIM + 裁切圖 |
| F5 | 免費 | 4K 存檔 | 2160×2160，細節比基準清楚，不是放大糊圖 | DCIM + 裁切圖對照 B1 |
| F6 | 免費 | 相簿頁 | 預設「文字」；印章、日期＋地點、不加、高解析度有 Pro 鎖；點了開付費牆 | 截圖 |
| F7 | 免費 | 相簿分享（標準） | 尺寸和 B2 一樣（1206 寬），底部有 Aniseekr | tmp JPG |
| P1 | 強制 isPro | 分享頁標記選「印章」，存原圖 | 原圖 = 3024×3024（照片短邊）；右下有印章 | DCIM + 裁切圖 |
| P2 | 強制 isPro | 標記選「日期＋地點」，1080p | 1080×1080；照片上有「日期 · Aniseekr」 | DCIM + 裁切圖 |
| P3 | 強制 isPro | 相簿：不加、高解析度，分享 | 2160 寬；底部沒有 Aniseekr；照片細節銳利 | tmp JPG + 裁切圖 |
| P4 | 強制 isPro | 相簿：印章、標準，分享 | 1206 寬；底部是印章 | tmp JPG |

**清理**：刪除測試產生的相簿照片（DCIM 新增的 PNG）和匯入的測試照。`PREMIUM_ENABLED` 改回 `true`。模擬器關機。worktree 的 `node_modules` 連結移除。

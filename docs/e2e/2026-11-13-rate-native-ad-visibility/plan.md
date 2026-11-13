# 滑卡原生廣告可見度 — E2E 計畫（2026-11-13）

範圍：`libs/services/ads/rate-native-ad-session.ts`（失敗退避）、`rate-native-ad-pool.ts`、`libs/services/rate/rating-deck.ts`（第一張廣告時機）。

裝置：iPhone 18 Pro 模擬器（既有的那台），Debug build + Metro（`__DEV__` → Google 測試原生廣告單元）。
入口：`aniseeker://rating`（季番牌組，與 2026-11-04 那次相同）。
驗證用暫時 log（跑完移除）：`[ads-e2e] insert at=<n> index=<currentIndex>`、`[ads-e2e] load ok|fail retryInMs=<n>`。

| ID | 目的 | 前置 | 步驟 | 預期可觀察結果 | 驗證位置 |
|----|------|------|------|----------------|----------|
| C0 | Preflight | 模擬器已開、app 已裝、Metro 連上 | 開啟 `aniseeker://rating` | 滑卡畫面出現照片卡；Metro log 顯示 bundle 來自這個 checkout（看到 `[ads-e2e]` log） | 截圖 + Metro log |
| C1 | 第一張廣告在第 8 張照片之後 | 全新啟動、進入滑卡 | 逐張左滑照片，數到第 8 張 | log `insert at=8`（index=4 時插入）；滑完 8 張照片後頂卡是廣告卡（Test Ad） | Metro log + 截圖 |
| C2 | 之後每 12 張一則 | 接續 C1 | 滑掉廣告，再左滑 12 張照片 | log `insert at=21`；第 2 張廣告出現在第 1 張廣告後的第 12 張照片之後 | Metro log + 截圖 |
| C3 | 載入失敗後短退避重試，不再沉默 30 分鐘 | 暫時故障注入：第一次請求用無效 unit id（跑完移除）；全新啟動 | 進入滑卡，持續慢速左滑超過 30 秒 | log 依序：`load fail retryInMs=30000` → ≥30 秒後 `load ok` → `insert at=<n>`；之後廣告卡出現 | Metro log（時間戳）+ 截圖 |

不在範圍／事先標記：
- 正式版 build 的 unit id 是否存在、AdMob 後台填充率：UNVERIFIABLE（需要正式 build 與後台）。
- Android：不跑。
- 舊版殘留的 MMKV 冷卻 key 不再被讀取：只做 code review，不上機。

清理：移除暫時 log 與故障注入，`xcrun simctl shutdown all`。

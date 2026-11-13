# 設定／個人頁／統計頁整理＋Pro 12 格捷徑 — E2E 結果

範圍與版本：iPhone 18 Pro 模擬器（iOS，既有裝置，全新安裝）。App 為 1.3.0 Release 模擬器版的副本，
JS 以 `expo export:embed` 從 commit `065962e` + 工作目錄重新打包後覆蓋 `main.jsbundle`。
未登入任何平台、未同步、未購買、未改遠端資料。Android、web 未跑。

**總判定：免費狀態的案例全部 PASS；Pro 狀態只做了版面確認（強制狀態），真實購買流程 UNVERIFIED。**

## 免費狀態（真實程式碼）

| 案例 | 預期 | 實際 | 判定 | 證據 |
| --- | --- | --- | --- | --- |
| C0 個人頁 | 「統計」標題列右側有完整統計按鈕 | 相符 | PASS | c0-profile.png |
| C1 設定首頁 | 置中標題；五個分區；無長按提示；列上無說明小字 | 帳號與同步／內容／外觀／通知與儲存／關於 皆在 | PASS | c1-settings.png、c1-settings-lower.png |
| C2 同步／匯入 | 從設定列點入可開啟 | 點「同步中心」「匯入精靈」各自開啟 | PASS | c2-sync-hub.png、c2-import-wizard.png |
| C3 開關 | 切換後狀態改變 | 「包含遊戲」關→開，再切回關 | PASS | c3-switch-on.png、c3-switch-restored.png |
| C4 進階頁 | 只有診斷與開發工具 | 相機診斷；設計代幣、即時預覽 | PASS | c4-advanced.png |
| C5 捷徑清單 | 含備份／觀看平台／熱門／年度回顧，不含條款等四項 | 相符 | PASS | c5-shortcut-picker.png |
| C6 捷徑排列 | 換成熱門並可開啟 | 第 8 格換成熱門，點入開啟熱門頁；重開 App 後仍在 | PASS | c6-slot-replaced.png、c6-trending-opened.png |
| C7 宅力 DNA 捷徑 | 開啟統計頁 | 點入後是統計頁 | PASS | c8-stats-exhibits.png |
| C8 統計頁（有資料） | 墨線卡、無漸層、無 Top N% | 數字卡、圓環、月長條、展品格狀卡皆相符 | PASS | c8-stats-data.png、c8-stats-exhibits.png |
| C9 統計子頁 | 置中標題、可返回 | 從展品點「名人堂」開啟 | PASS | c9-hall-of-fame.png |
| P1 免費捷徑 | 8 格＋「再多 4 格 · Premium」 | 相符 | PASS | p1-free-8-slots.png |
| P2 付費牆 | 點解鎖列開付費牆，列出 12 格這項 | 相符 | PASS | p2-paywall-row.png |

## Pro 狀態（暫時強制，僅確認版面）

| 案例 | 做法 | 實際 | 判定 | 證據 |
| --- | --- | --- | --- | --- |
| P3 購買後解鎖畫面 | 暫時把 `unlocked` 初始值設 true 重打包 | 「已升級 Pro」＋七項打勾＋「開始使用」 | 版面 PASS；觸發條件 UNVERIFIED | p3-unlocked-sheet-forced.png |
| P4 Pro 個人頁 | 暫時讓 `useSubscription` 回傳 isPro | 12 格、無升級橫幅、卡片強調色外框 | 版面 PASS；真實權益 UNVERIFIED | p4-pro-profile-12-slots-forced.png |

兩個暫時修改都已還原（`grep TEMP-E2E` 無結果），模擬器上最後裝回的是真實程式碼（z-final-free-profile.png）。

## UNVERIFIED 需要什麼

- 真實購買／還原後是否出現解鎖畫面、Pro 權益是否讓第三排出現：需要 StoreKit 沙盒帳號在實機或沙盒模擬器上買一次。我不能代為購買。

## 實跑中發現並修掉的

- 統計圓環中心是白底，白字總數看不見（修改前就存在）→ 中心改用卡片底色。
- 設定列沒有 `onPress` 時仍包在 `Pressable` 裡 → 改成純 `View`。

## 偏差

- 收藏資料不是從 UI 加的：對這台全新模擬器的 `user_anime` 直接寫入 12 筆 `e2e-*` 測試列。
- 一開始模擬器點擊工具不可用，第一輪只能用 deep link 截圖；工具恢復後補做了點擊案例。
- 模擬器的即時點擊切不動原生開關，改用短距離拖曳才切換（工具特性，不是 App 問題）。
- 冷啟動後第一個 deep link 會被吃掉，需要再送一次。
- 測試期間工作目錄另有不屬於這次任務的修改（廣告池、滑卡牌組相關 6 個檔案），打包時一併被包進去。

## 程式碼閱讀所見（未修、未測）

- 捷徑選擇清單項目多時會頂到狀態列下方（c5-shortcut-picker.png 上緣）。
- 成就名稱與說明仍是英文（資料本身，非 UI 字串）。

## 專案檢查（最終程式碼）

typecheck 通過；變更檔 eslint 0 錯誤（2 個既有 warning）；prettier 通過；unit test 1551 通過、0 失敗。
全專案 lint 未跑（既有大量錯誤）。

## 清理

模擬器已 `shutdown all`。沒有遠端變更。模擬器上留有測試列與改過的第 8 格捷徑。

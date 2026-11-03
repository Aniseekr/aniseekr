# 頁面 IA 重整 E2E 結果（2026-11-04）

範圍：類型入口、分數／卡片顯示、追番 ↔ 設定、收藏與個人頁空狀態。裝置：既有 iPhone 18 Pro（iOS 27），開發版 AniSeekr，JS 由本工作目錄的 Metro 載入（含未 commit 變更）。App 語言是英文，所以截圖都是英文；zh-Hant 字串已加，但沒有切語言實測。

| ID | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| G1 | 首頁兩欄類型封面 6 格＋「全部 N 個類型」，位於本週熱門之上 | 第一次跑時多個類型都是同一張進擊的巨人封面，修正後（每類型取前 6 名，跳過已用過的）6 格封面都不同；「All 17 genres」；區塊在 Trending 之上 | PASS（修正後重跑） | G1-discover-genres.png |
| G2 | 類型頁：標題、副標、封面、大按鈕、說明、最熱門列表（x.x 分） | Comedy／Ranked by AniList popularity／封面／Start swiping／說明行／列表 ★7.6 · 13 eps | PASS | G2-genre-page.png |
| G3 | 卡堆標頭顯示類型名；第一張有點看詳情；分數 x.x | 標頭 Comedy、Tap for info、★7.6。另外發現卡片寫「2026 · Anime」是假資料（年份用今年、類型寫死），修正後重開 Drama 卡堆顯示「2013 · TV」 | PASS（修正後重跑） | G3-deck.png、G3b-deck-real-year.png |
| G4 | 第二張卡沒有提示 | One-Punch Man 卡上沒有 Tap for info | PASS | G4-second-card.png |
| G5 | 返回後按鈕變「繼續滑卡 · 已滑 1 張」 | 「Continue swiping · 1 seen」 | PASS | G5-resume.png |
| S1 | 播出表設定有集數提醒、通知設定連結、資料來源；沒有成人內容開關 | 符合 | PASS | S1-schedule-settings.png |
| S2 | 播出表關掉提醒後，設定 → 通知的集數提醒也是關的 | 是關的；之後在設定頁開回去（橘色軌道已確認） | PASS | S2-settings-synced.png |
| S3 | 每列一行「Ep N · Today HH:MM」 | 「Ep 5 · Today 21:30」；非今天顯示「11/11 00:00」 | PASS | S3-schedule.png |
| L1 | 收藏 0 筆時：標題＋三個入口 | 符合 | PASS | L1-library-empty.png |
| P1 | 個人頁 0 資料時：一行引導＋去滑卡 | 符合 | PASS | P1-profile.png |

總判定：PASS（10/10）。

## 偏差
- 模擬器工具的點擊常被吃掉，同一個按鈕要點兩次才有反應。原生 Switch 用點的完全沒反應，改用拖曳。這些是工具的問題，不是產品 bug，App 的導航都正常。
- 有幾步用 deep link（`aniseeker://genre/Drama`、`/bangumi`、`/collection`、`/profile`）直接切頁，省掉點 tab。
- G4 左滑一張，會在本機記錄「已看過」，沒有碰遠端資料。

## 未驗證
- 類型頁與首頁的載入中、錯誤狀態（離線）沒有實測。
- 淺色模式、zh-Hant 介面沒有實測。
- 播出表鈴鐺在「提醒關閉」時的提示（程式邏輯已改成只看同一個開關）沒有點鈴鐺實測。
- Android 沒測。

# Pro 深度功能（統計、分頁、自動同步、追番自動提醒）— E2E 結果

範圍與版本：iPhone 18 Pro 模擬器（iOS 27.2，既有裝置），繁中。App 為 1.3.0 Release 模擬器版副本，
JS 以 `expo export:embed` 從 commit `065962e` + 工作目錄重新打包。Android、web 未跑。
沒有登入任何平台、沒有購買、沒有遠端變更。

**總判定：免費狀態 9 案全部 PASS。Pro 狀態 9 案 PASS，但都是暫時強制 `isPro` 跑的，真實購買後的權益 UNVERIFIED。自動同步實際執行、提醒到點跳出 UNVERIFIED。**

資料：對模擬器 `user_anime` 寫入 12 筆 `e2e-*` 列（分數 0–100、完成日在 2025 與 2026）。
SQL 預期值存在 [sql-expected.txt](sql-expected.txt)：平均 7.5；分數桶 4:1、6:1、7:1、8:2、9:2、10:1；2025 年 3 部 49 集、2026 年 5 部 73 集。

## 免費狀態（真實程式碼）

| 案例 | 預期 | 實際 | 判定 | 證據 |
| --- | --- | --- | --- | --- |
| S1 平均分刻度 | 10 分制，等於 SQL 平均 | 7.5（SQL 7.5） | PASS | s1-stats-free.png |
| S2 評分分佈鎖 | 點鎖定列開付費牆 | 相符 | PASS | s2-paywall-from-score-row.png |
| S3 歷年鎖 | 今年可看；2025 帶 Pro 標，點了開付費牆 | 2026：5 部 29 小時（73 集×24 分）；點 2025 開付費牆，仍停在 2026 | PASS | s3-year-free.png、s3-year-locked-tap.png |
| S4 年度圖卡 | 圖卡＋Logo；「不加」帶鎖；分享出圖 | 產出 1053×989 PNG，系統分享面板顯示該圖；點「不加」開付費牆 | PASS | s4-year-share-sheet.png、s4-year-card-exported.png、s4-year-system-share.png、s4-mark-locked-tap.png |
| S5 人格頁 | 沒有「稀有 x%」；分享面板有人格卡＋Logo | 相符 | PASS | s5-persona-free.png、s5-persona-share-sheet.png |
| S6 排行分數 | 10 分制 | 10.0／9.0／8.5／8.0／7.5／7.0 | PASS | s6-top-picks.png |
| T1 分頁上限 | 最多 4 個；第 5 個不能開；解鎖列開付費牆 | 相符 | PASS | t1-tab-editor-free.png、t1-tab-editor-free-lower.png、t1-unlock-tap.png |
| A1 自動同步鎖 | 帶 Pro 標，點了開付費牆 | 相符；付費牆 8 行、方案卡完整露出 | PASS | a1-sync-hub-free.png、a1-auto-sync-locked-tap.png |

## Pro 狀態（暫時強制 `isPro`，原始碼已還原）

| 案例 | 預期 | 實際 | 判定 | 證據 |
| --- | --- | --- | --- | --- |
| S7 評分分佈 | 每格數量等於 SQL | 4:1、6:1、7:1、8:2、9:2、10:1 | 版面與數字 PASS | s7-stats-pro.png |
| S8 歷年回顧 | 2025 的數字等於 SQL；差值正確 | 2025：3 部 20 小時；2026 顯示「比 2025 年 · +2 部 · +9 小時」 | 版面與數字 PASS | s8-year-pro-2026.png、s8-year-pro-2025.png |
| S9 去標記 | 選「不加」後圖卡沒有 Logo | 相符 | 版面 PASS | s9-share-mark-off-pro.png |
| T2 第 5 個分頁 | 分頁列 6 顆，不超出、可切換 | 開「相機」後 6 顆；切到收藏正常；第 6 個開關不能開 | 版面 PASS | t2-five-tabs-pro.png、t2-five-tabs-switch.png |
| T3 失效回退 | 存著 5 個，裝回免費版只顯示 4＋個人頁 | 相符 | PASS | t3-lapsed-four-tabs.png |
| A2 自動同步開關 | 打開後重開 App 仍開啟 | 相符 | 版面 PASS | a2-auto-sync-on.png、a2-auto-sync-after-relaunch.png |

## 追番自動提醒

資料：本季三部未播的番（ID、開播時間取自 App 的當季快取）：186742（22:30）、195516（23:00）為「在看」，205909（23:30）先設「已看完」當對照。

| 案例 | 預期 | 實際 | 判定 | 證據 |
| --- | --- | --- | --- | --- |
| R0 基準 | 未允許通知時 0 則、不跳權限框 | 0 項已排程，只有頁面上的「允許」橫幅；資料表 0 筆 | PASS（允許前的畫面沒存檔，只留下允許後的 r0-baseline-permission-granted.png） | 資料表查詢 |
| R1 免費鎖 | 列上帶 Pro 標 | 相符 | PASS | r1-auto-reminders-free.png |
| R2 自動排程（Pro 強制） | 只排兩部「在看」，開播前 15 分鐘，中文標題 | 22:15、22:45 各一則；對照那部沒排；標題「《…》15 分鐘後開播」 | PASS | r2-auto-reminders-list.png、r2-scheduled-rows.txt |
| R3 刪除後不加回 | 刪一則後重開仍一則 | 相符（之後又跑過兩輪也沒加回） | PASS | r3-after-delete.png、r3-after-relaunch.png、r3-scheduled-rows.txt |
| R4 清單時間 | 重開後時間不飄 | 修正後新排的顯示 11:15（等於資料表）；修正前排的那則同畫面顯示 10:20（實際 10:15） | PASS | r4-list-time-after-relaunch.png、r4-scheduled-rows.txt |

沒測：點「在看的番自動提醒」Pro 標會開付費牆（同一個元件在同步中心測過，這一列沒點）；關掉開關後不再新增。

## UNVERIFIED 需要什麼

- 提醒到時間真的跳出來：要把模擬器開到當晚 22:15，沒有等。

- 自動同步真的跑一輪：需要一個已連結的平台帳號（我不能登入）。這裡只確認了開關會存、未連結時 App 正常。
- 真實購買或還原後這些權益是否生效：需要沙盒帳號買一次。

## 實跑中發現並修掉的

- 統計頁把儲存的 0–100 分數當 10 分制：真實資料下平均分會顯示成 75.0、排行顯示 90，人格計算也因此失真。
  上一輪我寫的測試資料用了 1–10，剛好把這個問題蓋住。已在統計服務統一換算，加一個回歸測試。
- 付費牆加到 10 行後方案卡被擠出畫面：合併成 8 行。
- 人格卡上的「稀有 x%」是寫死的數字，沒有資料來源：拿掉。
- 提醒通知的標題和內文是寫死的英文：改走翻譯。
- 重開 App 後提醒清單的時間會越來越晚（iOS 把觸發條件回報成秒數，畫面用「現在＋秒數」算）：提醒本身帶上實際時間，清單改讀它。只對之後新排的提醒有效。

## 偏差

- 測試資料用 SQL 寫入，不是從 UI 加的。
- 冷啟動後第一個 deep link 會掉，都送兩次；原生開關用短拖曳切換（工具特性）。
- 測分享時滑動手勢誤觸系統面板的「儲存影像」，跳出相簿權限，選了「不允許」。
- 工作目錄同時有其他 session 的修改（廣告、離線包等），打包時一併包進去。

## 觀察到但沒動的（既有）

- 人格名稱、描述、向度名稱是英文；排行列上的狀態顯示原始字串 `completed`。
- 成就名稱是英文。
- 付費牆方案說明是英文（來自商店商品資料）。
- 「取消所有提醒」的確認框按鈕是英文「Cancel all」；而且這個確認框我用工具點不動（系統權限框點得動），無法判斷是工具還是 App 的問題，需要手動點一次確認。

## 專案檢查

typecheck 通過；unit test 1557 通過、0 失敗；spec:check 261/261；我改的檔案 prettier 通過，eslint 只有 3 個既有錯誤（`notification-service.ts` 的 `AndroidImportance`，HEAD 上就有）。
全專案 lint 未跑（既有大量錯誤）。另有 3 個別的 session 的檔案 prettier 未過，沒動。

## 清理

測試列與測試提醒都已清掉（各 0 筆），模擬器已 `shutdown all`，裝回的是真實程式碼。模擬器上留著：Seeker 頁面存了 5 個、自動同步偏好為開、通知權限已允許、三部測試番在靜音名單裡。

# 主畫面小工具「接下來」— E2E 結果

範圍與版本：iPhone 18 Pro 模擬器（iOS 27.2），繁中。這輪有原生變更：裝了 `expo-widgets` 58.0.28，
03:15 跑 `expo prebuild -p ios`（`ios/` 重新產生，多了 `ExpoWidgetsTarget`），再用 `xcodebuild` 編 Release 模擬器版。
之後的 JS 修改用 `expo export:embed` 重新打包進同一個 App。Android、web、實機、簽章版未跑。

**總判定：模擬器上 8 案全部 PASS。Pro 內容是把 `isPro` 暫時強制後看的（原始碼已還原），真實購買後 UNVERIFIED。到開播時間自動換下一筆、實機、上架簽章 UNVERIFIED。**

資料：`user_anime` 寫入本季未播的番，狀態「在看」。預期時間取自 App 的當季快取，存在 w3-cache-expected.txt。

| 案例 | 預期 | 實際 | 判定 | 證據 |
| --- | --- | --- | --- | --- |
| W0 編譯 | Release 模擬器版編譯成功，含小工具 | `BUILD SUCCEEDED`，App 內有 `PlugIns/ExpoWidgetsTarget.appex` | PASS | 編譯輸出 |
| W1 App 正常 | 新版能開個人頁、統計 | 正常顯示 | PASS | w1-app-profile.png、w1-app-stats.png |
| W2 免費鎖定 | 小工具清單裡有 AniSeekr；加到主畫面顯示升級那句話，沒有番名 | 相符（小、中尺寸預覽都看到） | PASS | w2-gallery-preview-free.png、w2-home-locked-free.png |
| W3 Pro 清單（強制） | 依時間列出在看的番，集數與時間等於快取 | 兩部：第 7 集 · 週五 23:30、第 7 集 · 週六 01:53；加第三部後三筆依序 17:00／23:30／01:53；標題是 App 內同樣的日文 | PASS | w3-home-pro-list.png、w3-home-pro-three-titles.png、w3-cache-expected.txt |
| W4 沒有在看 | 顯示「在看的番近期沒有新集數。」 | 相符 | PASS | w4-home-pro-empty.png |
| W5 點擊 | 開到追番頁 | 開到追番頁，頁面上同兩部番、同樣時間 | PASS | w5-tap-opens-schedule.png |
| W6 提醒回歸 | 載入邏輯共用後，在看的番各一則，開播前 15 分鐘 | 23:15、01:38；第三部 16:45，標題為日文 | PASS | w6-scheduled-rows.txt、w6-scheduled-rows-after-title-fix.txt |
| W7 退回鎖定 | 裝回免費版後小工具回到升級那句話 | 相符 | PASS | w7-back-to-locked-free.png |

沒測：小尺寸在 Pro 狀態只列一部（小尺寸只看過鎖定狀態的預覽）；深色模式下的小工具外觀。

## UNVERIFIED 需要什麼

- 到開播時間自動換下一筆、全部播完後顯示「打開 Aniseekr 更新。」：要把模擬器開到當晚。時間軸的順序只用樣本資料在本機算過。
- 實機與上架：extension（`kidneyweakx.aniseeker.ExpoWidgetsTarget`）和 App Group（`group.kidneyweakx.aniseeker`）要在 Apple 開發者帳號建立 App ID 與描述檔，需要你互動式跑一次 `eas credentials` 或 `eas build`。
- 真實購買後小工具解鎖。
- Android 小工具：沒開（`enableAndroid` 未設）。

## 實跑中發現並修掉的

- 小工具和提醒通知的標題用的是資料原始標題（英文），App 內顯示的是使用者選的標題語言（這台是日文）：改用同一個標題解析。

## 偏差與事故

- **03:25 我把新版裝到了另一個 session 正在使用的模擬器上**（它在測走路記錄）。已傳訊息通知它那一輪可能無效；它之後 commit 了重跑結果。那次截到的兩張圖是它的畫面，已刪，不算證據。之後等所有 session 停止才繼續。
- 測試資料用 SQL 寫入；Pro 狀態用暫時強制的打包。
- 模擬器不能貼文字，小工具是在清單裡捲動找到的。
- 清提醒時是從清單逐一刪除，所以三部測試番留在這台模擬器的靜音名單裡。

## 專案檢查

typecheck 通過；unit test 1565 通過、0 失敗；spec:check 269/269；小工具相關檔案 eslint 0 問題、prettier 通過。全專案 lint 未跑。

## 清理

測試列與測試提醒都清掉（各 0 筆），裝回真實程式碼，模擬器已 `shutdown all`。
主畫面上留著一個中尺寸的 AniSeekr 小工具（鎖定狀態）。

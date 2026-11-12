# 巡禮軌跡記錄＋行程路線 E2E 結果（2026-11-13，階段 3、4）

範圍與 build：iPhone 18 Pro 模擬器（iOS 27）。這次重新 `expo prebuild`（iOS）＋`xcodebuild` 的 Release 模擬器 build（Info.plist `UIBackgroundModes` = fetch、location；含 expo-task-manager）。JS 由工作目錄 `expo export:embed` 換入；F＝Pro 全開注入、B＝JS `fetch` 一律失敗注入，都只改匯出檔。走路用 `simctl location start --speed=3`。App 語言 zh-Hant（T16 切 English）。
基線：氷菓 現地 5 · 補記 1；2.5次元的誘惑 補記 1；沒有軌跡。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| P0 build | 有 location 背景模式；App 正常、資料還在 | plist 有 `location`；覆蓋安裝後資料容器換了路徑，統計仍是 7／1／5 | PASS | PlistBuddy 輸出、`P1a-timeline-stamp-days.jpg` |
| P1 到訪順序 | 只有章的日子也在時間流；相簿路線卡是虛線＋章的點＋「到訪順序 · 現地 4」，沒有距離 | 時間流出現「11月13日　現地 4」；相簿路線卡如預期 | PASS | `P1a-…jpg`、`P1b-album-visit-order.jpg` |
| T1 入口 | 首頁有「開始巡禮」；記錄頁有說明＋「開始記錄」 | 相符 | PASS | `T1a-home-entry.jpg`、`T1b-idle.jpg` |
| T2 開始 | 記錄中、0 m、時間在跳 | 「記錄中　0 m　0:06」；起點的本町通り立刻蓋了現地章（現地章 1） | PASS | `T2-recording-started.jpg` |
| T3 走路＋自動蓋章 | 路線、距離增加、現地章 ≥ 3 | 131 m、現地章 3，地圖跟著走 | PASS | `T3-walking.jpg` |
| T4 背景繼續 | 路線連到 D、約 430 m ±15%、現地章 4 | 回到前景：408 m、現地章 4、路線連續（同一個 process） | PASS | `T4a-backgrounded.jpg`、`T4b-back-in-foreground.jpg` |
| T5 暫停／繼續 | 暫停時距離不變；跳過去那段不畫線、只多約 60 m | 暫停後把位置移到 300 m 外，距離仍 408 m；繼續走 60 m → 468 m，兩段之間沒有線 | PASS | `T5a-paused-moved-away.jpg`、`T5b-resumed-walked.jpg`、`T9b-saved-walk-fit.jpg` |
| T5c 暫停時的時間 | 停在按暫停的時刻 | 第一次：暫停後時間從 3:04 退回 2:42（FAIL，停在最後一個點的時間）。修正後重跑：0:52 → 暫停 1:04，6 秒後仍 1:04 | PASS（修正後重跑） | `T5a-…jpg`（修正前）、`T5c-paused-clock-1.jpg`、`T5c-paused-clock-2.jpg` |
| T6 結束摘要 | 日期、距離、移動時間、4 筆現地章、「你也路過了」中橋＋蓋章 | 468 m、3:05、本町通り／コンベンション協会／バグ・パイプ／喫茶去かつて（冰菓）、中橋（四季櫻）＋「蓋章」 | PASS（內容） | `T6-finish-summary.jpg`、`T6b-summary-passed.jpg` |
| T6m 摘要的地圖 | 看得到整條路線 | 第一次：只看到最後一小段，其餘在面板後面（FAIL）。修正後重跑：兩段都在面板上方 | PASS（修正後重跑） | `T6-…jpg`（修正前）、`T9b-saved-walk-fit.jpg` |
| T7 補蓋路過的章 | 中橋移到上面、現地章 5、「你也路過了」消失 | 相符；重開後仍是 5（存檔有更新） | PASS | `T7-passed-stamped.jpg`、`T9b-…jpg` |
| T8 集章帳與足跡 | 氷菓現地 +4（11/13）；岐阜県景點數增加 | 氷菓「現地 9 · 補記 1 · 10 / 44」；全部走完後岐阜県 12 個景點、格子變最深一級、沒有「還沒歸類」（軌跡蓋的章有被補上市區町村） | PASS | `T8a-stamp-book-after-walk.jpg`、`T8b-footprint-after-walks.jpg` |
| T9 時間流 | 摘要有距離・時間・現地數；有軌跡列可點 | 「468 m · 3:05 · 現地 9」＋一列軌跡，點進去是摘要 | PASS | `T9a-timeline-with-walk.jpg`、`T9b-…jpg` |
| T10 相簿路線卡 | 實線＋起訖點＋章的點＋距離・時間・現地數；點卡片開軌跡頁 | 第一次：第一段路線被畫成虛線（FAIL：先畫「到訪順序」再換成軌跡時沿用了虛線）。修正後重跑：三段都是實線；點卡片開軌跡頁；分享面板的縮圖裡有路線與摘要 | PASS（修正後重跑） | `T16c-album-route-en.jpg`（修正前）、`T10c-album-route-solid.jpg`、`T10b-card-opens-walk.jpg`、`T10d-album-share-sheet.jpg` |
| T11 記錄中殺掉 App | （E2E 計畫寫）被收尾存成一筆 | `simctl terminate` 後重開：仍是「記錄中」，85 m → 100 m 繼續記完；之後手動結束，存成第二筆 | 見偏差 | `T11b-recording-before-kill.jpg`、`T11c-after-relaunch.jpg`、`T11d-second-walk-saved.jpg` |
| T12 沒有定位權限 | 出現說明＋開啟設定 | 「定位沒有開啟」＋「開啟設定／稍後再說」 | PASS | `T12b-start-without-permission.jpg` |
| T13 GPX：非 Pro | Paywall | Paywall 出現 | PASS | `T13-gpx-paywall.jpg` |
| T14 GPX：Pro | 分享面板；檔案通過 xmllint；段數、點數相符 | `aniseekr-walk-20261113-0257.gpx` 5 KB；`xmllint --noout` 通過；trkseg 2＝存檔 2 段、trkpt 41＝41 點、wpt 5＝5 個章 | PASS | `T14b-gpx-share-sheet.jpg`、xmllint 輸出 |
| T15 離線 | 照常記錄；現地章 1 | 109 m、0:44、宮川朝市（冰菓）蓋了現地章 | PASS | `T15b-offline-recording.jpg`、`T15c-offline-summary.jpg` |
| T16 英文 | 英文字串、沒有截字 | Walk／Start recording／Past walks；時間流「677 m · 4:30 · On site 10」；相簿 Share | PASS | `T16a-idle-en.jpg`、`T16b-timeline-en.jpg`、`T16c-…jpg` |

整體：有一個案例（T11）和 E2E 計畫寫的預期不同，其餘 PASS（T5c、T6m、T10 是修正後重跑才過）。

## 偏差

- T11：E2E 計畫只寫了「被收尾」，核准的實作計畫寫的是「記錄還在或正確收尾」。模擬器上終止 App 後定位任務還在，重開就接著記，走的是「記錄還在」這條路；「任務不在了就收尾」這條路沒有被跑到（UNVERIFIED）。真機上用手滑掉 App 會是哪一種，要實機才知道。
- T10 的路線卡把同一天稍早蓋的章（不在這次路線上）也畫成點，所以路線在卡片裡偏小。這是照設計（當天所有現地章），不是錯誤，但值得之後看要不要只畫路線附近的章。

## 修正（這輪發現）

- 暫停時的時間改成停在按暫停的時刻。
- 軌跡摘要的地圖改成等地圖掛好再對齊一次，並把範圍往南拉，讓路線落在面板上方。
- 路線卡等軌跡讀完才畫，線條依類型重建（react-native-svg 會沿用舊的虛線設定）。
- 同一天多段軌跡分不出來：清單與標題加上開始時間；時間流的軌跡列也加。
- 記錄頁沒有快取位置時，用系統最後已知位置置中（不會跳權限詢問）。

## 沒跑／無法確認

- 定位精度不足的狀態、12 小時自動結束、60 分鐘沒移動的提醒：模擬器做不出來。UNVERIFIED。
- 自動蓋章的系統通知：沒有看到通知橫幅，也沒有確認模擬器的通知權限；只驗了 App 內的數字。UNVERIFIED。
- 刪除軌跡（垃圾桶 → 確認框）：模擬器工具點不到 RN 的 Alert 按鈕，沒跑。UNVERIFIED。
- 「這次沒有記錄到路線」（不到兩個點就結束）：沒跑。UNVERIFIED。
- 軌跡的備份與還原：沒在裝置上跑。UNVERIFIED。
- 作品頁頂端的軌跡按鈕：沒截到。UNVERIFIED。
- 真機：鎖屏放口袋 1–2 小時、耗電、被系統中途停掉的機率。需要 Kidney 的實機。
- Android（前景服務、常駐通知、`POST_NOTIFICATIONS`）：沒有重新打包 Android。BLOCKED。

## 狀態變更與清理

- 模擬器上的 App 換成這次的新 build；JS 是工作目錄的未注入匯出檔（確認不含注入字串）。舊 build 的 `ios/build` 被這次 prebuild 清掉了。
- App 資料多了 3 段軌跡、氷菓 5 個現地章、四季櫻 1 個現地章（測試資料）。
- 語言改回跟隨系統；定位權限恢復為允許；`simctl location clear`；`simctl shutdown all`。

## code review，未測

- Paywall 的福利清單沒有列「匯出 GPX」。
- iOS 定位用途說明（英文與四個語系）已改成含「記錄巡禮路線」；送審時 App Store 審核備註要說明背景定位用途。Play Console 要申報「前景服務・位置」。

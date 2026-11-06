# 巡禮 UX 重整 — E2E 結果（2026-11-04）

範圍與 build：(1) iPhone 18 Pro 模擬器（iOS 27.2），今天 02:02 編的 dev client（無原生改動），JS = 分支 `claude/pilgrimage-ux-85ef2a`，App 語言 zh-Hant。Metro 由 worktree 啟動，node_modules 以 symlink 指向主 checkout（未提交）。沒有 `.env`（建連結被拒），巡禮與 Atlas 不受影響。模擬器沒有相機畫面，所以預覽本身是黑的。
(2) 實機 Samsung S20 FE（SM-G781B，Android 13）：從這個 worktree prebuild 出 debug dev client，套件名加 `.e2e` 後綴（`com.kidneyweakx.aniseekr.e2e`，只修改 gitignored 的 `android/`），跟手機上的正式版 1.3.0 並存，沒動到正式版資料。JS 由 Metro 透過 `adb reverse` 提供。參考圖是推到 `Pictures/` 的測試橫圖，測完已刪除。手機放在桌上沒有實際轉成橫拿。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| C1 無參考圖開相機 | 只有頂列、匯入膠囊、焦段、快門列；沒有 REF 框、疊圖輪播、子模式、chip 列 | 符合；膠囊顯示「第 1 集」，有時間碼的景點顯示「第 1 集 · 25:22」 | PASS | `C1-camera-no-reference.png`、`C1b-hint-with-time.png` |
| C2 點膠囊 | 直接開相簿，沒有中間 sheet | 膠囊轉圈 → 系統相簿 | PASS | `C2-library-direct.png` |
| C3 匯入橫圖 | 原地換參考圖、出現 REF 與疊圖輪播、轉橫拍 | 符合；相機沒重新進場（沒走 `router.replace`）。橫拍沉浸模式下子控制不再浮在畫面中央 | PASS | `C3-after-import.png`、`C3-landscape-immersive.png` |
| C3b「已切成橫拍」提示 | 匯入時出現 toast | 模擬器沒截到。實機連拍幾張後，在轉向後第一張看到「橫向場景，已切成橫拍」 | PASS（實機） | `C3b-device-landscape-toast.png` |
| C4 同景點再開 | 直接帶出同一張參考圖 | 關相機再開、以及 App 重啟後再開都帶出，且直接橫拍 | PASS | `C4-reopen-remembered.png`、`W4-card-to-camera.png` |
| C5 橫向開設定 | 不崩潰；有「方向」列 | 第一次：App SIGABRT（`UIApplicationInvalidInterfaceOrientation`，RN Modal 只支援直向）。修好後重跑：sheet 正常、「方向」選中「橫向」 | FAIL → 修正後 PASS | `C5-first-run-crashed-to-home.png`、`C5-settings-landscape.png` |
| W1 作品頁預設 | 地圖約佔 2/3；列只有「第 N 話」；標頭不重複數量 | 符合；圖例只列地圖上真的有的種類，移到左上 | PASS | `W1-work-page.png` |
| W2 點地圖標記 | sheet 頂端出現景點卡；地圖飛過去且標記不被 sheet 擋住；標記放大 | 符合 | PASS | `W2-pin-selected.png` |
| W3 點列表列 | 同上，從列表觸發 | 第一次點擊被模擬器吞掉，第二次成功；卡片出現、地圖飛到 EP 1，標記在 sheet 上方 | PASS | `W3-row-selected.png` |
| W4 卡片 → 相機 | 一步進相機 | 符合，並帶出記住的參考圖 | PASS | `W4-card-to-camera.png` |
| W5 關相機回作品頁 | 回到直向、選取狀態保留 | 符合 | PASS | `W5-back-portrait.png` |
| H1 Hub 無定位 | 日本地圖＋一顆「開啟定位」，沒有文字卡 | 符合 | PASS | `H1-hub-no-location.png` |
| H2 Hub 有定位（模擬器設在高山） | 以使用者為中心、真實附近聖地、「3 km 內 N 處」 | 第一次：說明文字對，但地圖停在全日本（engine 只吃初始 center）。改成拿到定位時重建後：中心在高山、cluster 有數字 | FAIL → 修正後 PASS | `H2-hub-nearby.png` |
| H3 點地圖卡 | 進全螢幕地圖 | 符合 | PASS | `H3-hero-opens-map.png` |
| DW1 實機作品頁 | 地圖為主、列只有一行副標 | 符合 | PASS | `DW1-device-work-page.png` |
| DW3 實機點列表列 | 卡片釘在 sheet 頂、地圖飛過去、標記不被擋 | 第一次點到時 sheet 被拉高（點擊落在拖曳區）；第二次符合，sheet 停在 34% | PASS | `DW3-device-row-selected.png` |
| D1 實機開相機（無參考圖） | 即時預覽滿版，控制項只佔上下邊 | 符合；預覽從狀態列下延伸到快門列，中間只有匯入膠囊和 1× | PASS | `D1-device-camera-fullbleed.png` |
| C2 實機點膠囊 | 直接開系統相片挑選器 | 符合（Android 照片挑選器，選一張後要按「完成」） | PASS | 截圖含使用者私人相簿，未存 |
| D2 實機匯入橫圖並拍照 | 轉橫拍、疊圖鋪滿；拍得到；預覽頁正常 | 第一次：拍照後紅屏 `Cannot read property 'forEach' of null`（ShutterRow 圖示 transform 由陣列變 undefined）。修正後重跑：轉橫拍、REF＋輪播＋疊圖正確，拍照後進「對照結果」（直向），「你的照片」是橫向照片 | FAIL → 修正後 PASS | `D2-device-landscape-reference.png`、`D2-device-preview-after-capture.png` |
| D3 實機預覽頁「儲存」 | 存進相簿 | 第一次：靜默失敗，log `ERR_PERMISSIONS … PHOTO permission … not declared`。修正後：按鈕變「已儲存」，MediaStore 新增 2 筆（原照＋合成圖） | FAIL → 修正後 PASS | `D3-device-save-after-fix.png` |
| D4 實機從預覽頁返回相機 | 相機恢復預覽、仍橫拍、縮圖是剛拍的 | 符合 | PASS | `D4-device-back-to-camera.png` |
| DW5 實機關相機回作品頁 | 回直向、選取保留 | 符合；但標記被擠到畫面頂端（地圖中心在橫向時算的） | PASS（附註） | `DW5-device-back-portrait.png` |
| DW6 實機列表捲到底 | 最後一列與頁尾按鈕不被 Android 導覽列蓋住 | 修正前頁尾被三鍵導覽列蓋住；補上 safe-area 底部間距後符合 | FAIL → 修正後 PASS | `DW6-device-list-bottom.png` |
| D5 實機實際橫拿手機對齊 | 疊圖與實景對齊 | 手機放桌上，沒有實際轉成橫拿 | UNVERIFIED | — |

整體：模擬器與實機的 in-scope 案例都 PASS（三個 FAIL 都已修正並重跑）。只剩 D5「真的橫拿手機對齊」UNVERIFIED，需要使用者手持測一次。

## 過程中修掉的 bug
- 橫向鎖定時開任何 `ThemedBottomSheet`（設定、參考圖 sheet）或角色選擇器 → iOS 直接 abort。舊 LAND 模式就有，自動橫拍讓它變常見。Modal 加上 `supportedOrientations`。
- 從相機深連結到別頁時，橫向鎖沒解除（作品頁整頁橫過來）。方向鎖改成只在相機 focus 時生效。
- Hub 地圖卡拿到定位後沒移過去。
- （實機）拍照後紅屏：方向鎖跟著 focus 走之後，相機在預覽頁底下會以直向重新 render，`rotateGlyphs` 由 true 變 false，`transform` 從陣列變成 undefined，Android Fabric 會當成 null 處理而 throw。現在 transform 一律給陣列（`0deg`／`90deg`）。
- （實機，既有 bug，正式版也有）Android 存照片一律失敗：預覽頁、分享頁、獨立相機都用 `usePermissions({ granularPermissions: ['photo'] })`，但 app.json 的 `blockedPermissions` 刻意移除了 `READ_MEDIA_IMAGES`。expo-media-library 會在 Android 13+ 直接 throw。三處都只用來存檔，改成 `writeOnly: true`（Android 13+ 存檔不需要權限；iOS 改要「僅新增照片」權限）。
- （實機）作品頁 sheet 列表底部被 Android 三鍵導覽列蓋住，補上 `insets.bottom`。

## 偏差
- 實機第一次紅屏後 App 整個 reload，回到 onboarding（`.e2e` 是新安裝）；按略過後用 deep link 回作品頁重跑。dev 工具浮動按鈕擋到右上角，已先拖開。
- 模擬器點擊有延遲，偶爾整個被吞（W3 第一次、C5 第一次在橫向座標下點到系統區）。重點一次即可。
- C5 第一次的 App 消失是真的崩潰（SIGABRT，系統 log 有原因），不是點擊問題。

## 需要實機確認（code review，未測）
- 拍完進預覽頁：實機確認橫拍後預覽頁是直向、可用（D2）。
- 手機平放時 `orientationSource='device'` 可能存成錯的方向（PhotonCamera 會忽略平放）。沒改。
- 前鏡頭：預覽有鏡像、疊圖沒鏡像。沒改。
- 比例：預覽永遠 cover，存檔比例（16:9／4:3）跟畫面不同，邊緣會比看到的多；1:1 實際存 4:3。比例選項只是移到設定裡，所見即所得裁切沒做。
- 實機觀察（未改）：
  - 相機頁底部的 Android 導覽列是淺灰底，在相機上很突兀，可改成透明或黑底。
  - 景點很遠時，相機的定位 chip 和預覽頁都顯示 `196973m`／`191089.4 m`，應該用 km。

# 巡禮 UX 重整 — E2E 結果（2026-11-04）

範圍與 build：iPhone 18 Pro 模擬器（iOS 27.2），今天 02:02 編的 dev client（無原生改動），JS = 分支 `claude/pilgrimage-ux-85ef2a`，App 語言 zh-Hant。Metro 由 worktree 啟動，node_modules 以 symlink 指向主 checkout（未提交）。沒有 `.env`（建連結被拒），巡禮與 Atlas 不受影響。模擬器沒有相機畫面，所以預覽本身是黑的。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| C1 無參考圖開相機 | 只有頂列、匯入膠囊、焦段、快門列；沒有 REF 框、疊圖輪播、子模式、chip 列 | 符合；膠囊顯示「第 1 集」，有時間碼的景點顯示「第 1 集 · 25:22」 | PASS | `C1-camera-no-reference.png`、`C1b-hint-with-time.png` |
| C2 點膠囊 | 直接開相簿，沒有中間 sheet | 膠囊轉圈 → 系統相簿 | PASS | `C2-library-direct.png` |
| C3 匯入橫圖 | 原地換參考圖、出現 REF 與疊圖輪播、轉橫拍 | 符合；相機沒重新進場（沒走 `router.replace`）。橫拍沉浸模式下子控制不再浮在畫面中央 | PASS | `C3-after-import.png`、`C3-landscape-immersive.png` |
| C3b「已切成橫拍」提示 | 匯入時出現 toast | 截圖時沒看到（可能已消失） | UNVERIFIED | — |
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
| D1 實機開相機 | 即時預覽滿版 | 沒跑 | BLOCKED（要實機） | — |
| D2 實機橫拿對齊並拍照 | 疊圖填滿、拍得到、預覽頁正常 | 沒跑 | BLOCKED（要實機） | — |

整體：模擬器範圍內 PASS；D1、D2 BLOCKED，C3b UNVERIFIED。不能說「相機已測過」。

## 過程中修掉的 bug
- 橫向鎖定時開任何 `ThemedBottomSheet`（設定、參考圖 sheet）或角色選擇器 → iOS 直接 abort。舊 LAND 模式就有，自動橫拍讓它變常見。Modal 加上 `supportedOrientations`。
- 從相機深連結到別頁時，橫向鎖沒解除（作品頁整頁橫過來）。方向鎖改成只在相機 focus 時生效。
- Hub 地圖卡拿到定位後沒移過去。

## 偏差
- 模擬器點擊有延遲，偶爾整個被吞（W3 第一次、C5 第一次在橫向座標下點到系統區）。重點一次即可。
- C5 第一次的 App 消失是真的崩潰（SIGABRT，系統 log 有原因），不是點擊問題。

## 需要實機確認（code review，未測）
- 預覽本身：模擬器沒有相機畫面，預覽滿版只能從程式確認（VisionCamera `resizeMode` 預設 `cover`）。
- 拍完進預覽頁：方向鎖改成跟 focus 走後，橫拍後的預覽頁會回到直向。以前是橫向。要實機看預覽頁直向是否 OK。
- 手機平放時 `orientationSource='device'` 可能存成錯的方向（PhotonCamera 會忽略平放）。沒改。
- 前鏡頭：預覽有鏡像、疊圖沒鏡像。沒改。
- 比例：預覽永遠 cover，存檔比例（16:9／4:3）跟畫面不同，邊緣會比看到的多；1:1 實際存 4:3。比例選項只是移到設定裡，所見即所得裁切沒做。

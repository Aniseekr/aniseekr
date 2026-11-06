# P1a 一台相機：紀錄／動漫 — 實機結果（2026-11-05）

**環境**
- 裝置：Samsung S20 FE（Android 13）。
- Build：debug dev client `com.kidneyweakx.aniseekr.e2e`，JS 是分支工作目錄（P1a 的改動）。
- 截圖只存在本機。toast 的截圖取自暫存的螢幕錄影（`screencap` 一張要 2 秒，抓不到 1.6 秒的 toast），錄影已刪除。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| R1 自由相機預設 | 「自由拍攝」；紀錄被選中；沒有匯入膠囊、REF、距離 chip | 符合 | PASS | `R1-record-default.png` |
| R2 紀錄快門 | 留在相機；「已記錄」；縮圖更新 | 符合。按下後約 2.5 秒出現 toast，大部分時間花在拍照本身 | PASS | `R2-recorded-toast.png` |
| R3 縮圖 | 開剛拍那張，底部有分享 | 第一次點到相簿挑選器：我改程式觸發 Fast Refresh，相機重新掛載後本次拍攝清空，縮圖變空。重拍後再點：開預覽「你的照片」，底部有分享 | PASS（第一次 INVALID） | `R3-thumb-opens-latest.png` |
| R4 切到動漫 | 不換頁、出現匯入膠囊 | 符合 | PASS | `R4-anime-mode-in-place.png` |
| R5 從景點進入 | 開在動漫；切紀錄拍照，toast 帶景點名 | 開在動漫模式；紀錄後顯示「已記錄・加茂荘花鳥園」 | PASS | `R5-spot-opens-anime.png`、`R5-recorded-at-spot.png` |
| R6 手帳歸檔 | R5 的照片歸在作品底下 | 「冰菓・1 個場景・2 張」，「去過的場景」1 | PASS | `R6-journal-filed-under-work.png` |
| R7 相機 tab | 沒有關閉鈕；快門不被 tab 列擋住；離開 tab 時相機停止 | 第一次：版面對，但預覽只畫到上方 45%，下面黑。原生層 `PreviewView` 是 1080×2400，裡面的 `SurfaceView` 卻停在 1440×1080、沒被縮放。改成 TextureView（`implementationMode="compatible"`）後全螢幕。切到別的 tab 時 `dumpsys media.camera` 顯示 DISCONNECT | FAIL → 修正後 PASS | `R7-tab-camera-before-fix.png`、`R7-tab-camera-after-fix.png` |
| R8 動漫快門 | 照舊進入預覽頁 | 符合 | PASS | 截圖未存 |

整體：PASS（R7 修正後重跑通過）。

## 一起修掉的
- **景點的照片被歸到「自由拍攝」**：preview 存檔時判斷歸檔位置，沒有拿到 `targetSpotId`；Atlas 的景點都沒有場景圖，所以一律被歸成自由拍攝。已修，並加了 regression test（64f6433）。
- **相機 tab 下方的大黑邊**：就是 R7 的 SurfaceView 問題。這應該就是使用者回報的那個黑邊；前一個修正（a308558）處理的是 `/pilgrimage/capture` 的排版問題。

## 手機上的變動與清理
- 測試時存進系統相簿 7 張照片，已依 `_id` 刪除並查詢確認。
- `.e2e` 測試 app 的模式被切成 Explorer（為了測 R7），只影響測試 app。

## 還沒做（P1b／P1c）
- 16:9 所見即所得的觀景窗：已在下方 P1b 完成。
- 拍照到「已記錄」要 2.5–3.5 秒，快門轉圈期間不能連拍。可改成拍完立刻放開快門，EXIF 和歸檔放到背景做（P1c）。
- 相機 tab 會記住上次的模式（例如停在「動漫」）。要不要每次回到紀錄，還沒決定。

## P1b 版面重整（使用者：「匯入這一幕的位置讓下面很擠，要整體做更好的設計」）

改了什麼
- **16:9 所見即所得觀景窗**：預覽、疊圖、水平儀、對焦框和角色都放在一個與存檔同比例的框裡，合成時也用框的座標。直向時框從狀態列下方開始，下面剩下的黑帶放快門。橫向時框置中，左右黑帶放關閉鈕、相簿和翻轉鏡頭。
- **匯入移到左上角的參考圖位置**，匯入後同一格變成 REF 縮圖。底部只留快門、紀錄／動漫和縮放。
- **紀錄／動漫改成純文字分頁**（選中的是主色字加一個小點），不再用一整條膠囊。
- **橫向**：沉浸模式先收起模式字樣；點一下展開時，EV 條和疊圖細項也不出現（只在直向顯示），避免把約 400pt 的高度塞滿。
- **距離 chip** 從 `191088m` 改成 `191 km`。

| 案例 | 判定 | 證據 |
|---|---|---|
| L1 紀錄模式 16:9：框從狀態列到快門上緣，底部只剩 1×、紀錄／動漫、快門 | PASS（`PreviewView` 1080×1920） | `L1-record-16x9.png` |
| L2 動漫模式：匯入在左上角 | PASS | `L2-anime-import-top-left.png` |
| L5 從景點進入：左上匯入和右上距離 chip 並排、不重疊；距離顯示 km | PASS | `L5-spot-import-and-distance.png` |
| L3 匯入橫圖後橫拍沉浸：疊圖只畫在框裡，底部只有疊圖模式和快門 | PASS | `L3-landscape-immersive.png` |
| L4 橫向點一下展開 | 第一次：EV 條蓋住標題，疊圖細項浮在頂端，非常擠（FAIL）。修正後：只剩縮放／透明度、疊圖模式、紀錄／動漫、快門（PASS） | `L4-landscape-revealed-crowded.png`、`L4-landscape-revealed-after.png` |
| L6 直向點擊對焦：對焦框落在點的位置（框內座標正確） | PASS | 截圖未存 |

偏差與觀察
- **Fast Refresh 後相機全黑**：改了 hook 結構後熱更新，相機不會重新連線。重開 app 就正常。只發生在開發階段。
- **作品頁偶爾冒出一個空白 sheet**：Explorer 模式下冷啟動，連續點擊時出現兩次，往下拉就消失。原因未查，和相機無關。
- 橫向剛進相機時，前兩次點畫面沒有反應，第三次才展開。可能是相機還在暖機，未確認。
- 測試時推到手機的參考圖已刪除。

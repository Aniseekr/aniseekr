# 滑卡原生廣告可見度 — E2E 結果（2026-11-13）

整體判定：**BLOCKED**（C3 未完成）。C0–C2 PASS。

## 範圍與 build

- 裝置：iPhone 18 Pro 模擬器（793562A3）。
- 原生殼：模擬器上既有的 Release build（1.3.0 / build 1，2026-11-11 編譯）。
- JS：`expo export:embed --dev false` 從工作目錄匯出後換進 app（HEAD `065962e` + 未提交變更）。匯出的 bundle 內確認有 `FIRST_AD_AFTER = 8` 與暫時 log。
- `__DEV__ = false`，所以請求的是**正式** iOS 原生廣告單元（log 顯示尾碼 `…3635473770`）；模擬器被 AdMob 當測試裝置（畫面出現 AdMob native ad validator）。
- 與計畫的差異：計畫寫 Debug build + Metro；實際沒有 Debug build，改用上面的 Release 殼 + 匯出 bundle，暫時 log 用 `console.error` 經 `simctl log stream` 讀取。

## 判定表

| ID | 預期 | 實際 | 判定 | 證據 |
|----|------|------|------|------|
| C0 | 進入滑卡、bundle 含這次變更 | 滑卡畫面出現；`request unit=3635473770` → 6.2 秒後 `load-ok` | PASS | `c0-rating-open.png`、`c1-c2-log.txt` 第 1–2 行 |
| C1 | 第 8 張照片後出現第一張廣告（`insert at=8`） | index=4 時 `insert at=8`；依序滑掉 8 張照片（賽博朋克、藥屋、黑色五葉草、テムパル、轉生就是劍、ホタルの嫁入り、青之箱、JoJo SBR）後頂卡是廣告卡 | PASS | `c1-c2-log.txt` 第 4 行、`c1-s1…s10`（`c1-s10-after-ad-on-top.png`） |
| C2 | 第一張廣告後隔 12 張照片出現第二張（`insert at=21`） | index=17 時 `insert at=21`；滑掉廣告後依序 12 張照片（追放…、來自深淵、魔法使いの夜、氷の城壁、東京リベンジャーズ、青春豬頭、歸還者、藥屋劇場版、ドラゴンボール超、轉生貴族、青之蘆葦、探偵はもう）後頂卡是廣告卡 | PASS | `c1-c2-log.txt` 第 7 行、`c2-s0…s13`（`c2-s13-ad-settled.png`） |
| C3 | 載入失敗後約 30 秒重試成功並補上廣告 | 故障注入生效：`request` → 2.8 秒後 `load-fail`。但同一時間另一個 session 在同一台模擬器上跑設定頁 E2E，把畫面導離滑卡，重試沒有被觀察到 | INVALID → BLOCKED | `c3-log-invalid.txt`、`c3-s0-open.png`（畫面是「進階」頁，不是滑卡） |

## 未通過／未驗證

- **C3（失敗後 30 秒重試）沒有實機證據。** 目前只有單元測試涵蓋退避時間計算。需要模擬器空下來後重跑（重新加故障注入、匯出 bundle、冷啟動、滑卡 30 秒以上）。
- 正式環境的實際填充率、AdMob 後台狀態：未驗證。
- Android：未跑。

## 偏差

- 有 3 次滑動手勢沒有前進一張（`c1-s5`、`c1-s7`、`c2-s06` 與前一張畫面相同）。照片數改以畫面上的作品名稱逐張核對，不以手勢次數計。原因未查（工具或 app 皆有可能）。
- 第一次啟動時 app 在 onboarding，我點了「略過 → 開始使用」，模擬器上的 onboarding 狀態因此變成已完成。
- **干擾了另一個 session：** 01:06–01:14 之間我把 app 的 `main.jsbundle` 換成自己的版本、終止並重啟 app 三次；01:13:35–01:13:55 我的 6 次左滑打在對方的畫面上。對方 01:13:29–01:14:03 的截圖（`c1-settings`、`c4-advanced`、`c8-*`、`c0-profile`）是在我的 bundle 上、且可能受我的滑動影響，需要對方重拍確認。
- 模擬器沒有關機（另一個 session 還在用）。

## 清理狀態

- 暫時 log 與故障注入已全部移除（`grep E2E-TEMP` 無結果）。
- app 內的 `main.jsbundle` 已還原成我開始前的那一份（`cmp` 一致）。
- 滑卡時的左滑（略過）寫入模擬器本機的已看紀錄，未還原。

## 範圍外觀察（實機看到，未處理）

- 廣告卡的媒體圖沒有填滿卡片寬度：第一則約佔 3/4 寬靠左，第二則只佔左側約 4 成（`c1-s10-after-ad-on-top.png`、`c2-s13-ad-settled.png`）。AdMob validator 顯示「No implementation issues found」。

## Code review（未上機）

- 舊版寫進 MMKV 的 `@aniseekr/ads/rate-native/suppressUntil` 不再被讀取，升級後舊冷卻不會延續。
- 原生模組不存在時不再設冷卻，直接不請求。
- 11/7 上架的 `build-1793981883847.ipa`（1.3.0）bundle 內含四個正式 iOS 廣告單元 ID，所以「正式版沒包 ID」不成立。

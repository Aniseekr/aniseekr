# Android 1.3.1：不含定位前景服務 — E2E 計畫（2026-11-13）

範圍：commit `f939e47` 之後的 Android 正式版 aab。確認前景服務權限拿掉了、App 開得起來、走路記錄入口不顯示、Play 內測軌收件。
走路記錄本身在 Android 上不測（這版不提供）。廣告、Pro、小工具在 Android 上的行為不在這份計畫內。

裝置：既有的 AVD `aniseekr_test`。
Build：`build:android:local` 產出的 aab，用 `bundletool build-apks --mode=universal` 轉成 apk，以本機 debug keystore 簽名後安裝。
（簽名和上架版不同，其餘位元組相同。）

| ID | 目的 | 步驟 | 預期可觀察結果 | 驗證位置 |
|----|------|------|----------------|----------|
| A0 | 權限拿掉了 | 解開 aab 的 `base/manifest/AndroidManifest.xml`，列出 `FOREGROUND_SERVICE*` | 只有 `FOREGROUND_SERVICE`，沒有 `FOREGROUND_SERVICE_LOCATION`（與 1.3.0 相同） | 指令輸出 |
| A1 | App 開得起來 | 安裝 apk、冷啟動 | 出現 onboarding 或首頁，沒有閃退 | 截圖 + `pidof` |
| A2 | 聖地首頁沒有走路捷徑 | 進聖地分頁首頁 | 搜尋列下方沒有「開始走路」按鈕；頁面其餘內容正常 | 截圖 |
| A3 | 作品頁沒有走路按鈕 | 開一部有聖地資料的作品頁 | 右上角按鈕列沒有走路圖示，其餘按鈕在 | 截圖 |
| A4 | Play 收件 | `bun run submit:android <aab>` | 上傳成功，沒有前景服務的 403 | 指令輸出 |

事先標記：
- 從備份還原的走路紀錄在 Android 上能打開：UNVERIFIABLE（這台沒有 iOS 匯出的備份），只做 code review。
- A2、A3 需要走完 onboarding 才到得了；模擬器操作不了就標 BLOCKED，不推論成產品問題。

清理：移除測試 apk，`adb emu kill`。

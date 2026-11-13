# Android 1.3.1：不含定位前景服務 — E2E 結果（2026-11-13）

範圍與版本：`build-1794559051817.aab`，1.3.1 / versionCode 115，從 commit `f939e47` 之後的程式 build。
裝置：AVD `aniseekr_test`（Android API 36），英文介面，全新安裝。
安裝方式：`bundletool --mode=universal` 轉 apk，本機 debug keystore 簽名（和上架簽名不同）。

**總判定：5 案全部 PASS。只驗了「開得起來、走路記錄入口不見、Play 收件」；廣告、Pro、其他聖地功能在 Android 上沒測。**

| 案例 | 預期 | 實際 | 判定 | 證據 |
| --- | --- | --- | --- | --- |
| A0 權限拿掉了 | 只有 `FOREGROUND_SERVICE`，沒有 `FOREGROUND_SERVICE_LOCATION` | aab manifest：`FOREGROUND_SERVICE` ×1、`FOREGROUND_SERVICE_LOCATION` ×0；裝到模擬器後 `dumpsys package` 也是 0 | PASS | 指令輸出（和 1.3.0 的 aab 相同） |
| A1 App 開得起來 | 出現 onboarding 或首頁，沒有閃退 | onboarding 第一頁；`dumpsys` 顯示 1.3.1 / 115；行程存活，crash log 為空 | PASS | a1-launch.png |
| A2 聖地首頁沒有走路捷徑 | 搜尋列下方沒有「開始走路」，其餘正常 | 捷徑列只有 Camera、Journal；地圖、Popular、Anime 88 都有真實資料 | PASS | a2-pilgrimage-home.png |
| A3 作品頁沒有走路按鈕 | 右上角沒有走路圖示，其餘按鈕在 | Laid-Back Camp 作品頁右上只有相簿、更多兩顆；地圖和 244 個點正常 | PASS | a3-work-page.png |
| A4 Play 收件 | 上傳成功，沒有前景服務的 403 | `Submitted your app to Google Play Store!`（內測軌） | PASS | 指令輸出 |

對照：含前景服務的 114（`build-1794554997873.aab`）同一個指令被 Play 以 403 拒絕。

## 未驗證

- 從備份還原的走路紀錄在 Android 上能打開：沒有 iOS 匯出的備份可測，只看過程式。
- Android 上的廣告新版位、Pro 功能、集章／足跡地圖／照片蓋章：都沒跑。
- 上架簽名版本身沒裝過（模擬器裝的是同一個 aab 用 debug key 重簽的 apk）。

## 偏差

- A1 第一次用 `monkey` 啟動沒有起來（它只印了一行 `SYS_KEYS` 訊息），改用 `am start` 啟動成功。當時 crash log 是空的，判斷是啟動指令的問題，不是 App 閃退。
- A2 沒有走完 onboarding，用 deep link `aniseeker://pilgrimage` 直接進頁面。

## 清理

測試 apk 已移除，模擬器已關（`adb emu kill`）。

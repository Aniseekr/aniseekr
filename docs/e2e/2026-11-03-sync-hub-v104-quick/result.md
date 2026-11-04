# Android 104 Sync Hub 快速測試結果

## 範圍與 build

2026-11-03，Samsung SM-G781B，ADB 連線；Google Play 安裝版 1.3.0／104，見 `Q0-version.txt`。依 `plan.md` 測試啟動後的 Sync Hub、唯讀平台檢查及佇列診斷；沒有執行會寫入作品的同步或衝突選擇。

## 判定

| 測項 | 預期／實際 | 判定與證據 |
|---|---|---|
| Q0 版本與畫面 | 預期 Play 版 104；ADB 顯示 versionCode 104、installer 為 Play，畫面已有 App | PASS：`Q0-version.txt`、`Q0-before.jpg` |
| Q1 Hub UI | 預期可進入並看到立即同步、平台檢查、衝突、佇列；實際均可見；檢查期間同步按鈕停用 | PASS（限畫面和停用狀態）：`Q1-hub.jpg`、`Q2-start.jpg`、`Q2-middle.jpg`、`Q3-scroll.jpg`；未執行 Sync now |
| Q2 平台檢查結果回饋 | 預期八平台有結果；兩次均顯示 AniList 11、MAL 13、Bangumi 3、Annict 0、Shikimori 0、Kitsu 11、SIMKL 0，Kavita 無法讀取 | UI 結果回饋 PASS：`Q2-top.jpg`、`Q2-middle.jpg`、`Q2-repeat-middle.jpg`；七平台筆數和空清單是否正確完整 UNVERIFIED，未獨立核對遠端；Shikimori 此次顯示 0，只證明 App 回報成功而非全部資料正確 |
| Q2 Kavita 讀取 | 預期連線有效時能取回清單；兩次均顯示無法讀取，未顯示具體原因 | UNVERIFIED：`Q2-middle.jpg`、`Q2-repeat-middle.jpg`；未獨立確認服務和憑證有效，無法判斷根因或歸類為產品 FAIL |
| Q3 佇列診斷 | 預期可讀取數量與失敗工作，或明確顯示錯誤；實際顯示「Unable to read the local queue」，下拉重新整理後相同 | FAIL（可用的診斷資料未呈現；錯誤提示有顯示）：`Q3-scroll.jpg`、`Q3-repeat.jpg`；未證實根因，`Q2-Q3-filtered-log.txt` 無符合條件的診斷日誌 |
| Q4 真實雙向同步 | 預期可獨立核對並還原；既有佇列無法讀取、遠端基準尚未建立 | BLOCKED：沒有按 Sync now、改作品或操作衝突；不能宣稱雙向同步通過 |

**整體：FAIL，且雙向同步 BLOCKED。** 測試只能證明畫面和平台檢查的上述觀察，不能推斷遠端清單完整、同步寫入成功或已連結帳號均有效。

## 失敗與後續需要

- 佇列讀取失敗已重現；需要在不修改使用者佇列的前提下取得錯誤原因，修正後以包含修正的新版本重測。
- Kavita 需要確認服務是否在線、登入資訊是否有效，再重測平台讀取與實際作品內容。
- 遠端同步需要逐平台與測試作品基準，以及可獨立讀回和還原的方式。此前紀錄提到 12 筆 dead-letter，本輪無法讀取，數量或歸屬不能沿用舊結果。

## 遠端狀態、清理與偏離

本輪只執行兩次 Check platforms、下拉重新整理及導覽；未按 Sync now，未選衝突，未修改作品、帳號設定或佇列。平台檢查可能刷新 OAuth 憑證；未檢查各平台全部遠端欄位，不能保證其狀態。測後停留 Hub 底部。

與原計畫「一次檢查」不同：因 Kavita 失敗而按協定重跑一次；為重測佇列曾下拉重新整理，會清除畫面上的先前檢查結果。裝置日期指令未輸出細部時間，使用截圖上 13:50–13:53 作觀察範圍；未清除共用 logcat，按 app PID 與時間過濾後沒有符合 SQLite／Kavita 等關鍵字的日誌，沒有完整逐動作日誌。這些偏離不影響截圖可見的結果，但限制根因判斷。

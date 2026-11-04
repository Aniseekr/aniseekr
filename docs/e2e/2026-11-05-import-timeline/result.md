# P1c／P2／P3 匯入照片、時間流、巡禮相簿：實機結果（2026-11-05）

**環境**
- 裝置：Samsung S20 FE（Android 13，Photo Picker 模組 361153920）。
- Build：debug dev client `com.kidneyweakx.aniseekr.e2e`，包含原生模組 `AniseekrPhotoImport`。
- JS：分支 `claude/pilgrimage-ux-85ef2a`，從 620ffcd 到 c5be4a7。
- 截圖只存在本機。有個人照片的畫面（文件挑選器、11/5 的測試照片）不存證據；toast 從暫存的錄影取影格，錄影已刪除。

## 用戶故事的步數（實際操作）

| 故事 | 步驟 | 結果 |
|---|---|---|
| 去靜岡隨手拍，回來匯入 | 足跡 → 右上「匯入照片」 → 長按選照片 → 「選取」 | 卡片列出「3 張在聖地」，並寫出是哪部作品、哪個景點 |
| 在現場記錄 | 相機預設就是「紀錄」 → 按快門 | 約 1.1 秒後可以再按快門，約 1.3 秒出現「已記錄」；不用離開相機 |
| 整理成相簿 | 足跡「時間流」 → 那趟旅程的「整理成相簿」 → 「分享」 | 依作品分章節，整本相簿是一張圖 |

## 結果

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| C1 紀錄快門 | 快門很快就能再按；toast 比 P1a 的 2.5 秒快；系統相簿有副本，且 EXIF 有 GPS | 快門轉圈約 1.1 秒；按下到 toast 約 1.3 秒；DCIM 有副本，裡面有 DateTimeOriginal、GPS 和 Software=Aniseekr | PASS | 錄影影格（已刪）；EXIF 檢查只確認欄位存在，沒有記下座標 |
| I1 匯入入口 | 開系統挑選器，可以多選 | 開 DocumentsUI；長按可以多選，「已選取 4 個檔案」 | PASS | 未存（畫面有個人照片） |
| I2 匯入 4 張 | 匯入 4 張・3 張在聖地・1 張沒有位置，並列出作品 | 第一次：4 張都沒有位置。原因是測試圖的 EXIF 格式壞了，見下方說明，判 INVALID。修好測試圖再跑：「匯入 4 張・3 張在聖地・1 張沒有位置」；ラブライブ！サンシャイン!! 2 張（沼津港深海水族館），冰菓 1 張（加茂荘花鳥園） | 第一次 INVALID，重跑 PASS | `I2-import-result.png` |
| I3 不重複 | 4 張已在手帳裡，沒有新增 | 「4 張已在手帳裡」，重複的副本已刪掉。標題原本是「匯入 0 張」，改成直接顯示「1 張已在手帳裡」後重跑 | PASS | `I3-duplicates.png` |
| I4 點作品 | 開啟該作品的資料夾 | Love Live 資料夾，2 張，有景點名和第 5 話 | PASS | `I4-work-folder.png` |
| T1 時間流 | 11/1–11/2 一趟旅程，4 張・2 部作品，每天標出景點 | 符合；11/5 那天的照片自成另一趟 | PASS | `T1-timeline-trip.png` |
| T2 時間 | 依 EXIF 時間分天 | 11/1 一張（掛川），11/2 三張；匯入那天是 11/5 | PASS | `T1-timeline-trip.png` |
| A1 整理成相簿 | 日期、「2 部作品・2 個場景・4 張」，章節依序是冰菓、Love Live、隨手拍 | 符合 | PASS | `A1-trip-album.png` |
| A2 分享 | 出現系統分享面板，分享的是整本相簿的圖 | 出現 `chooser_header`（沒有送出）；分享的圖是 1080×2109，整本相簿 | PASS | `A2-shared-album-image.jpg` |
| C2 相機縮圖匯入（紀錄模式） | 走同一套匯入，不用手機現在的 GPS | 開 DocumentsUI；選了已匯入過的照片，toast 顯示「1 張已在手帳裡」 | PASS | 錄影影格（已刪） |
| C3 自己相機拍的照片再匯入 | 讀得到 GPS | 修正前 `hasPlace [false]`。修正後新拍的照片每個 IFD 結尾都是 next=0，匯入時 `hasPlace [true]` | 修正前 FAIL，修正後 PASS | logcat（只記錄有沒有座標） |

整體：PASS。I2 第一次是 INVALID，C3 修正前是 FAIL，兩者重跑都通過。

## 過程中找到並修掉的問題
- **自己相機拍的照片，Android 讀不到 GPS**（7d12c6e）：piexif-ts 寫 Exif、GPS 這兩個 IFD 時漏了結尾 4 個 byte 的 next-IFD offset，第一個值就疊在那個位置上。Android 的 ExifInterface 因此丟掉 GPS。這表示 app 拍的照片存進相簿後，Google 相簿等程式也可能讀不到位置。改法是用 `bun patch` 修正 library，並加了 regression test（先確認沒修時會失敗）。
- **紀錄模式從相機縮圖匯入時，用了手機「現在」的 GPS 和時間**（c5be4a7）：改成走同一套匯入流程，時間和位置都讀照片本身的 EXIF。
- 時間流的縮圖只排成兩欄，改成三欄。只有一天的旅程不再重複顯示日期。匯入完成後畫面會捲回頂端，讓結果卡片看得到。

## 沒驗證或做不到的
- **iOS**：用 expo-image-picker 加上 `exif: true`，讀 `{GPS}` 和 `{Exif}`。解析邏輯有單元測試，但沒有在實機或模擬器上跑。UNVERIFIED。
- **Android 新版 Photo Picker 的「包含位置」選項**（`EXTRA_PICK_IMAGES_REQUEST_LOCATION_METADATA_ACCESS`）：這支手機的模組版本裡沒有這個字串，SDK 37 也還沒收錄常數，所以目前改用文件挑選器加 `ACCESS_MEDIA_LOCATION`（不會跳出權限對話框，系統直接授予）。文件挑選器的畫面沒有 Photo Picker 好看。等這支手機收到 2026 年 8 月的 Mainline 更新後，可以改成 Photo Picker 加這個 extra。
- 用 `getMediaUri` 加 `setRequireOriginal` 讀原始檔的那條路這次沒走到（`originalAccess=false`），但從文件 URI 直接讀，GPS 也還在。
- 只有 2 張以上照片的相簿分享測過；很長的相簿（幾十張）產生的圖片大小沒有測。

## 手機上的變動與清理
- 推到手機的 4 張測試圖，以及 C1、C3 存進相簿的 4 張照片（`_id` 1001069138–141、143、145、147、148），都已依 `_id` 刪除並查詢確認。`Pictures/AniseekrE2E` 資料夾也已刪除。
- 手帳裡測試產生的紀錄（4 張匯入、4 張相機照片）已從 app 內刪除。匯入資料夾是空的，手帳回到測試前的 10 張。
- `.e2e` 測試 app 已授予相片寫入權限和 `ACCESS_MEDIA_LOCATION`。
- 為了讓 Metro 讀到修過的 piexif-ts，清了 `$TMPDIR/metro-cache` 和 `metro-file-map-*`（都是快取）。
- `node_modules` 是主 checkout 共用的，裡面的 piexif-ts 已經套用修正。主 checkout 的 lockfile 還沒有 `patchedDependencies`，所以那邊重新 install 會還原，合併這個分支後就會一致。

## 偏差
- I2 第一次的測試圖是用 piexif-ts 產生的，格式本身就壞了（正是上面那個 bug），判 INVALID。之後改用自己寫的 TIFF 寫入程式產生測試圖重跑。
- 清理時誤觸 dev tools 的齒輪，打開了開發選單，關掉後繼續，沒有其他影響。

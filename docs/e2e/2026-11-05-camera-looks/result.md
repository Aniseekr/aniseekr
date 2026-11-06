# 相機底片色調：實機結果（2026-11-05）

**環境**
- 裝置：Samsung S20 FE（Android 13）。
- Build：debug dev client `com.kidneyweakx.aniseekr.e2e`，含原生模組 `AniseekrCameraLook`。
- JS：分支 `claude/pilgrimage-ux-85ef2a`，未提交的工作區（就是這次 commit 的內容）。
- 截圖只存在本機，`docs/e2e/**` 的 png 不提交。

## 做法

**預覽**
- 把 colour matrix 掛在預覽 TextureView 的 layer paint 上（`TextureView.setLayerPaint`），每幀多一次 GPU 運算，JS 不參與。

**存檔**
- 用同一個 `ColorMatrixColorFilter` 在背景執行緒重畫 JPEG。

**沒選的方案**
- frame processor 加 Skia：每幀都要經過 worklet，會吃掉觀景窗的流暢度。
- 只在存檔時套 LUT：預覽看不到效果。

## 過程中找到並修掉的 bug

- 第一版把 hardware layer 掛在包住預覽的父 View 上。只要開了色調，預覽就整片黑；選「原色」（沒有 layer）就正常。
- 原因：父 View 的 layer 會快取住 TextureView。
- 修正：改把 paint 直接掛在 TextureView 上，並在 layout 時重新套用，因為 session 重啟時 PreviewView 會換掉 TextureView。
- 修正後重新 build，重跑下面所有案例。

## fps（`dumpsys gfxinfo`，每次 10 秒，紀錄模式）

| 場景 | 色調 | 10 秒內的幀數（3 次） | 約略 fps | jank | p90 |
|---|---|---|---|---|---|
| 後鏡頭、亮處 | 原色（沒有 layer，等於改動前） | 333 / 339 / 341 | 33.8 | 5.3–5.9% | 14–15 ms |
| 後鏡頭、亮處 | 黑白 | 326 / 324 / 328 | 32.6 | 5.2–6.5% | 13–14 ms |
| 後鏡頭、亮處 | 暖底片 | 335 / 333 / 333 | 33.4 | 5.1–6.3% | 12–14 ms |
| 後鏡頭、亮處 | 原色（對照） | 339 / 322 / 326 | 32.9 | 4.3–7.8% | 14–15 ms |
| 前鏡頭、亮處 | 原色 | 272 / 286 / 275 | 27.8 | 7.3–11.4% | 14–16 ms |
| 前鏡頭、亮處 | 盛夏 100% | 274 / 293 / 281 | 28.3 | 9.9–13.2% | 16 ms |
| 後鏡頭、暗處 | 盛夏 50% / 原色 | 181, 189 / 186, 188 | 18.5 / 18.7 | 13–16% | 16–17 ms |

**結論**
- 開色調和不開的差距都落在同一場景前後兩次的波動內（±1 fps），p90 也沒有變大。
- 暗處 fps 只有 18–19，是低光時感光元件自己降下來的，跟色調無關，兩組一樣。
- 有一組前鏡頭原色的量測，量的時候通知欄被拉下來了，這組判 INVALID 不採用，上表的前鏡頭原色是重量的那一組。

## 案例

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| L0 / L1 fps | 開色調後下降少於 2 fps，jank 沒有明顯增加 | 見上表，沒有可量到的差距 | PASS | gfxinfo 輸出（上表）、`L1-front-original-vs-summer.png` |
| L2 Free 色調匣 | 原色、暖底片、黑白可以選；三個 Pro 色調有 PRO 標；強度鎖住 | 符合；選暖底片後出現「強度調整（Pro）」，按鈕顯示「暖底片」 | PASS | `L2-free-tray.png` |
| L3 點鎖住的項目 | 跳出 PaywallSheet，裡面有色調那一列；色調不變 | PaywallSheet 列出「全部相機底片色調，可調強度」和「一次匯入整趟旅程的照片」；色調仍是原本的 | PASS | `L3-paywall.png` |
| L4 Pro（模擬） | PRO 標消失；可以選盛夏；強度可以拖 | 符合；拖到 50% | PASS | `L4-pro-summer-50.png` |
| L5 存檔和預覽一致 | 同一區域的平均 RGB，預覽和照片的差距跟原色時一樣 | 原色 預覽 83/75/71、照片 84/76/73；暖底片 92/76/62、94/78/64；黑白 72/72/72、73/73/73；盛夏 50% 81/71/66、83/73/69。各組差距都在 1–3 之內 | PASS | `L5-preview-warm.png`、`L5-photo-warm.jpg` |
| L6 存檔後 EXIF | 相簿副本有 GPS、DateTimeOriginal | 盛夏 50% 那張的相簿副本：DateTimeOriginal、GPS（只確認欄位存在）、Software=Aniseekr；IFD 的 next 都是 0 | PASS | 解析拉回的檔案（沒有記下座標） |
| L7 動漫模式 | 動漫模式也會套用色調 | 前鏡頭、黑白 100%：照片 129,600 個像素全部 R=G=B；預覽只有約 1% 的像素不是灰的，就是水平線那條綠線 | PASS | `L7-anime-mono-100.png`、log「look graded in 202ms」 |
| L8 失去 Pro 時退回 | 存的是盛夏，Free 時預覽回到原色 | 重開 app 後按鈕顯示原色（沒有標籤） | PASS | `L8-free-fallback.png` |

整體：PASS。

## 其他實測數字
- 存檔時套色調多花的時間：後鏡頭 4K 是 353–383 ms，前鏡頭是 202–227 ms（log 的 `look graded in`）。紀錄模式下這段時間發生在快門釋放之前。
- 強度是所有色調共用一個值。黑白在 50% 時照片和預覽都只褪一半色，這是設計，不是 bug；切換色調時會看到滑桿上的數字。

## 沒驗證或做不到的
- **iOS**：沒有公開 API 可以對相機預覽套濾鏡，所以 iOS 不顯示色調按鈕（`isCameraLookAvailable()` 回傳 false）。沒有在 iOS 上跑。UNVERIFIED。
- **真正的購買流程**：Pro 是用 `FeatureFlags.PREMIUM_ENABLED=false` 模擬的（只改 Metro bundle，測完已改回 true，沒有 diff）。這支 build 沒有設定 RevenueCat key，PaywallSheet 只會顯示提示。
- 薄暮藍、褪色賽璐璐沒有單獨量 fps；它們跟其他色調走同一條路徑，只差在矩陣數值。
- 鏡頭切換時的凍結畫面（ImageView）也會套同一個濾鏡，但這次沒有實際觸發切換去看。UNVERIFIED。

## 手機上的變動與清理
- 拍的測試照片（相簿 `_id` 1001069157–160）已依 `_id` 刪除，並查詢確認。
- 手帳裡測試產生的 7 筆紀錄已在 app 內刪除，手帳回到 10 張。
- app cache 裡的 `nitro_image_*` 已刪除。
- 色調設回原色，拍攝模式設回 Single。中途誤觸切到 Auto，已改回。
- Metro 已停止，`adb reverse` 已移除。

## 偏差
- **黑畫面**：手機曾經背面朝下或被移動過（USB 有斷線兩次），這段時間的預覽是黑的。之後改用前鏡頭（朝向天花板）完成 L7 和前鏡頭的 fps 對照。
- **誤觸**：通知欄被拉下來時誤觸了幾下，打開過 Google Lens 和相機設定。含有個人通知的截圖已立刻刪除，那一組量測判 INVALID。

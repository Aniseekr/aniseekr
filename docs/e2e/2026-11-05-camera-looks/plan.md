# 相機底片色調：實機測試計畫（2026-11-05）

**範圍**
- 相機在紀錄、動漫兩種模式下的色調選擇。
- 預覽與存檔要一致。
- 預覽 fps 要量。
- Free / Pro 的分級。

**裝置**
- Samsung S20 FE（Android 13）。
- Build：debug dev client `com.kidneyweakx.aniseekr.e2e`，要包含原生模組 `AniseekrCameraLook`。
- JS 版本：分支 `claude/pilgrimage-ux-85ef2a` 目前未提交的狀態。

## 做法（選擇與理由）

**選了預覽 GPU 色彩矩陣，加上存檔套用同一個矩陣。**

**預覽端**
- 預覽原本就是 TextureView（`implementationMode="compatible"`）。
- 外面包一個原生 View，用 hardware layer，Paint 掛 `ColorMatrixColorFilter`。
- 每幀只在 GPU 合成時多做一次矩陣運算，JS 完全不參與。

**存檔端**
- `gradeJpeg` 在背景執行緒用同一個 `ColorMatrixColorFilter`，經 Canvas 畫一次後重新壓 JPEG。
- 兩邊都是 Android 的 Skia、同一個矩陣、同樣在 sRGB 數值上運算，所以照片的色調就是預覽的色調。

**沒選的方案**
- Frame processor 加 Skia 逐幀重繪：每幀要經過 worklet 和 Skia 畫布。S20 FE 上會吃掉預覽的流暢度，而且要另外接一條渲染路徑。
- 只在存檔時套 LUT：預覽看不到效果，違反「存檔要和預覽一樣」。

**限制**
- 矩陣做不到曲線、顆粒、暗角。所以挑的色調只用飽和度、對比、白平衡、提亮暗部。
- iOS 的 `AVCaptureVideoPreviewLayer` 沒有公開的濾鏡 API，所以 iOS 不顯示色調按鈕。這一點不在這次實機範圍內。

## 案例

| ID | 目的 | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|---|
| L0 | 基準 fps | 紀錄模式，色調是「原色」（沒有 layer），對著靜止場景 10 秒 | 記下 fps 和 jank 比例 | `dumpsys gfxinfo` 的 framestats |
| L1 | 開色調後的 fps | 同一個場景，分別開暖底片、盛夏 10 秒 | fps 跟 L0 差不多（下降少於 2 fps），jank 沒有明顯增加 | 同上 |
| L2 | Free 的分級 | 用沒有 Pro 的帳號打開色調匣 | 原色、暖底片、黑白可以選；薄暮藍、褪色賽璐璐、盛夏有 PRO 標；強度那一列是鎖住的 | 截圖 |
| L3 | 點鎖住的項目 | 點盛夏 | 跳出 PaywallSheet，裡面有「全部相機底片色調」那一列；色調沒有被換掉 | 截圖 |
| L4 | Pro（模擬） | 暫時把 `FeatureFlags.PREMIUM_ENABLED` 設成 false（這是 dev 的模擬 Pro，只改 Metro bundle，不提交），選盛夏並把強度拉到 50% | 預覽色調會變；可以拖強度條；數字顯示 50% | 截圖 |
| L5 | 存檔和預覽一致 | 每個色調各拍一張，同時截預覽 | 照片中央區域的 RGB 平均值，相對「原色」的變化方向和比例，跟預覽一致；照片本身也要看得出色調 | 從手機拉回照片，用 Python 比較平均值 |
| L6 | 存檔後 EXIF 還在 | 紀錄模式開著色調拍一張 | 相簿副本有 GPS 和 DateTimeOriginal | `ExifInterface`（logcat）或拉回檔案解析 |
| L7 | 動漫模式 | 動漫模式開著色調拍一張 | 色調有套用 | 截圖或拉回檔案 |
| L8 | 失去 Pro 的退回 | 選了盛夏之後，把 flag 改回來（Free） | 預覽回到原色；色調按鈕顯示原色 | 截圖 |

**清理**
- 依 `_id` 刪掉拍的照片和存進相簿的副本。
- 刪掉手帳裡測試產生的紀錄。
- 把 `PREMIUM_ENABLED` 改回 true。
- 停掉 Metro，刪掉 `android/`。

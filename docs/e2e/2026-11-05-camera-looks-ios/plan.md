# iOS 相機底片色調：測試計畫（2026-11-05）

**範圍**
- iOS 上的色調要能用，而且預覽和存檔一致。
- Free / Pro 的分級跟 Android 相同。

## 做法（選擇與理由）

**為什麼不能照 Android 的做法**
- iOS 的 `AVCaptureVideoPreviewLayer` 沒有公開的濾鏡 API（`CALayer.filters` 在 iOS 不能用）。所以沒辦法像 Android 那樣直接在預覽上套 GPU 濾鏡。

**預覽**
- 開了色調之後，在 session 加一個預覽尺寸的 frame output（YUV、實體旋轉成直的、忙的時候丟幀）。
- worklet 只負責把 frame 轉給原生的 `LookFrameFilter`（Nitro，Swift）。
- `LookFrameFilter` 用 Core Image 的 `CIColorMatrix`（GPU）套色，結果送進 VisionCamera 的 `FrameRenderer`（`AVSampleBufferDisplayLayer`），疊在原本的預覽上面。
- 每一幀的工作都不經過 JS 執行緒。

**存檔**
- 用同一個 `CIColorMatrix` 重壓 JPEG。

**一致性**
- 兩條路都關掉 Core Image 的色彩管理（working space 設為 null），矩陣直接作用在編碼後的數值上。這跟 Android 的 `ColorMatrixColorFilter` 是同一種算法。

**成本**
- 沒開色調時完全不加 output，所以原色的相機沒有額外成本。
- 開了色調之後，每幀多一次 GPU 套色，再加一次 display layer 合成。

## 案例

| ID | 目的 | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|---|
| S1 | iOS build 包含模組 | 模擬器 build、開相機 | 色調按鈕有出現（`isCameraLookAvailable()` 為 true） | 截圖 |
| S2 | 付費牆那一列 | Free 點鎖住的色調 | PaywallSheet 有「全部相機底片色調」那一列 | 截圖 |
| S3 | Free 的分級 | 打開色調匣 | 三個 Pro 色調有 PRO 標；強度鎖住 | 截圖 |
| S4 | 模擬器相機 | 開相機 | 如果模擬器沒有相機，記成 BLOCKED，並寫下改用了什麼 | 截圖、log |
| D1 | 實機預覽套色 | iPhone 實機，選黑白 | 預覽變成灰階 | 截圖 |
| D2 | fps | 實機，原色 10 秒對照黑白、盛夏 10 秒 | 開色調後下降少於 2 fps | Instruments 或 log |
| D3 | 存檔和預覽一致 | 實機各拍一張 | 同一區域的平均 RGB，預覽和照片一致（黑白要剛好 R=G=B） | 拉回照片解析 |

D1 到 D3 需要 iPhone 實機。模擬器沒有相機的話，這三案就要用到使用者的 iPhone XR（iOS 18.7），要先問過使用者。

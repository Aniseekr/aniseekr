# iOS 相機底片色調：結果（2026-11-05）

## 範圍與測試環境

**受測 build**
- 分支 `claude/pilgrimage-ux-85ef2a`，基準是 `feat/uiux-cleanup`（6e5b919），加上這次的 iOS 色調變更。
- 模擬器：`iPhone 18 Pro`（iOS 27.2 模擬器）。
- Debug dev client，在本機 `xcodebuild` 編譯，內含 `AniseekrCameraLook` Nitro pod。
- JS 由這個 worktree 的 Metro 提供。

**怎麼確認跑的是這次的 build**
- 在畫面上暫時印出 `createHybridObject('LookFrameFilter')` 的結果，得到 `{"os":"ios","ios":true}`、`avail=true`。
- 確認後已經移除這段程式。

## 結果表

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| S1 | iOS 相機出現色調按鈕 | 1× 旁邊出現色調按鈕（三圓圖示） | PASS | `S1-camera-look-button.png` |
| S2 | Free 點 Pro 色調會跳付費牆，而且有相機色調那一列 | 點「薄暮藍 PRO」後付費牆打開，列出「全部相機底片色調，可調強度」 | PASS | `S2-paywall-camera-looks.png` |
| S3 | Free 的分級 | 原色、暖底片、黑白可以選；薄暮藍、褪色賽璐璐標 PRO；點 Pro 色調後仍維持原色；選黑白之後強度顯示「強度調整（Pro）」並鎖住 | PASS | `S3-free-look-tray.png`、`S4-mono-selected-sim-no-camera.png` |
| S4 | 模擬器相機 | 模擬器沒有相機，觀景窗一直停在暖機的脈動。選了黑白（iOS 的 look output 接上 session）之後 app 沒有崩潰，log 也沒有錯誤。但沒有幀可以套色。 | BLOCKED | `S4-mono-selected-sim-no-camera.png` |
| P1 | 存檔路徑（`gradeJpeg`，Core Image）的結果等於 Android 公式 | 8 色測試圖分別套黑白、暖底片、盛夏，每個色塊和「矩陣直接作用在 sRGB 編碼值」的預期比，最大差 **1.19/255**；黑白剛好 R=G=B | PASS | `P1-gradejpeg-vs-android-formula.txt` |
| D1 | 實機預覽套色 | 沒有跑 | BLOCKED | 需要 iPhone XR |
| D2 | fps：開色調前後各量一次 | 沒有跑 | BLOCKED | 需要 iPhone XR |
| D3 | 預覽和存檔的平均 RGB 一致 | 只驗了存檔那一半（P1） | BLOCKED | 需要 iPhone XR |

**整體判定：BLOCKED。** 模擬器上能驗的都 PASS。和真實相機幀有關的三個案例（D1–D3），要用實機才能驗。

## P1 的做法

`gradeJpeg` 的程式路徑不需要相機，所以在模擬器上用真的 app 跑：
1. 用 Swift 產生一張 800×400、8 個純色塊的 sRGB JPEG（quality 1.0）。
2. 複製三份放進 app 的 Documents。
3. 加一段暫時的 effect，用 `gradeJpeg(uri, lookMatrixAt(look, 1), 100)` 分別套黑白、暖底片、盛夏。
4. 把檔案拉回來，用 CoreGraphics 解碼，取每個色塊中央 100×100 的平均值。
5. 和 JS 的 `lookMatrixAt` 矩陣直接乘原圖數值（也就是 Android `ColorMatrixColorFilter` 的算法）比對。

**結果**
- 最大誤差 1.19/255，來源是 JPEG 量化。
- 如果 Core Image 的色彩管理沒有關掉，誤差會是兩位數。這證明 working space 設成 `NSNull` 確實有生效。

**耗時**（800×400）
- 第一次 1123 ms，是 Metal 和 CIContext 的暖機。
- 之後每張約 5 ms。

暫時的程式碼和測試檔都已經刪除。

## 被擋住的案例：還需要什麼

- **D1–D3 要用 iPhone 實機。** 模擬器沒有相機，所以不會有 frame output 的幀，也就量不到 fps，沒有「開色調前後」的數字可以比。
- **改用了什麼：** 用 P1 驗證存檔那一半，並且確認 output 接上 session 之後不會崩潰（S4）。
- **還沒驗證的：**
  - 預覽幀實際的套色效果。
  - 預覽幀的 YUV 轉 RGB 和照片是否一致。
  - 開了色調之後的 fps。
  - Auto 模式下 scene analyzer 的 frame output 和 look output 同時存在是否沒問題。
- **使用者的 iPhone XR**（iOS 18.7，已配對、開發者模式已開）可以補這三案，但要先經過使用者同意，而且需要把手機連上並解鎖。

## 對遠端或狀態的變更

- 沒有。
- 測試圖已經從模擬器的 Documents 刪除。
- `FeatureFlags` 沒有改動，維持 Free 的狀態。

## 偏差

**Metro 一開始送的是別的 worktree 的程式碼**
- 一開始 8081 的 Metro 送出的 bundle，裡面 `app/` 是 `pro-export-43852f` worktree 的。
- 原因：各個 worktree 都用 symlink 指向同一個 `node_modules`，又共用系統 TMPDIR 底下的 `metro-cache`。`expo-router/_ctx` 轉譯後的結果被快取了，帶著別的 worktree 的 app root。
- 改用獨立的 TMPDIR 並加 `--clear` 重新啟動 Metro 之後才正常。
- 在這之前的觀察都作廢，S1–S4 和 P1 都是在修正之後重跑的。

## 讀程式碼的發現（沒有測過）

- **只在 iOS 加 output：** 色調關閉時不會加 output，所以原色相機沒有額外成本。但每次在「原色」和「有色調」之間切換，session 都要重新設定一次，預覽可能會頓一下。這要用實機確認。
- **Android：** `useIosLookPreview` 在 Android 上也會建立一個 FrameRenderer 和 frame output，但不會接上 session。VisionCamera 的 Android `HybridFrameRenderer` 建構時不配置任何資源。這次沒有在 Android 實機上重跑（S20 FE 給別的 session 用了）。

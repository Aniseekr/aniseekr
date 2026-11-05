# Pro 匯出：E2E 結果（2026-11-05）

**範圍與 build**
- 裝置：iPhone 18 Pro 模擬器（iOS 27.2）。使用主 checkout 在 11/4 編好的 debug dev client `kidneyweakx.aniseeker`，JS 從 worktree `claude/pro-export-43852f` 的 Metro :8081 載入（這次改動只有 JS）。
- 測試資料：3 張 4032×3024 的測試照（plasma 加棋盤格加「TEST n」），從「足跡 → 匯入照片」匯入。
- Pro 的開法：沒有 RevenueCat 沙盒。暫時把 `constants/FeatureFlags.ts` 的 `PREMIUM_ENABLED` 改成 `false`，`useSubscription().isPro` 就會強制為 true。測完已改回，沒有 commit。所以 P 案例都是「強制 isPro」，沒有測過真的購買。
- 中途使用者要求：浮水印改成小 logo，大小像 Gemini 的星星。免費的「文字」改成 Seekr 頭像 logo（16pt），印章也縮小成「logo＋巡禮」。F4 的檔案是改之前存的（文字版），F5 之後的都是 logo 版。

## 使用者決定（2026-11-05，經主 session 轉達）
1. **iOS 解析度 bug 要修，Pro 多「原圖」。** 720p／1080p／4K 在 iOS 上輸出標示的像素，跟 Android 一樣；三個都留給免費。Pro 的「原圖」用原尺寸解碼，細節是真的。
2. **比對卡也加浮水印。** 以前免費的比對卡沒有 Aniseekr 浮水印。依使用者要求，這一項刻意不遵守「不拿走免費既有的東西」，改成：
   - 免費匯出預設帶小 logo。
   - 拿掉 logo 是 Pro。Pro 選「不加」時，經典模板頁尾的 `aniseekr` 也一起拿掉。
   - 自訂文字浮水印仍然免費。
   - logo 放在整組圖片的外側右下角，不放在動畫格和實拍格中間的接縫上。

### 解析度前後對照（iOS，1:1 拍立得，同一張 4032×3024 照片）
| 選項 | 改動前 | 改動後 |
|---|---|---|
| 1080p | 3240×3240，34.7 MB | 1080×1080，4.5 MB |
| 4K | 6480×6480，121 MB，放大後是糊的 | 2160×2160，17.6 MB，比改動前清楚 |
| 原圖（Pro） | 沒有這個選項 | 3024×3024，33 MB，細節是真的 |

## 基準（改動前，免費）

| ID | 實際 | 證據 |
|---|---|---|
| B1 | 1:1 選「1080p」存出 **3240×3240**（34.7 MB PNG），選「4K」存出 **6480×6480**（121 MB）。卡片上沒有 Aniseekr 浮水印，因為自訂浮水印預設是空的。放大看是糊的，真正的細節只有大約 1200px | `B1-4k-6480-crop.png` |
| B2 | 相簿分享 1206×1421 JPG（螢幕 3x），底部固定有「Aniseekr」字樣 | （tmp 檔，未存） |

B1 是既有 bug。iOS 的 view-shot 把 `width`/`height` 當成 point，再乘上螢幕倍率 3。expo-image 又是照畫面大小解碼，所以多出來的像素都是放大出來的。Android 輸出的就是標示的像素。

## 結果

| ID | 身分 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|---|
| F1 | 免費（第一輪規則） | 標記預設「不加」；Logo 可選；印章、日期＋地點有 Pro 鎖；720p／1080p／4K 可選，原圖有 Pro 鎖 | 符合 | PASS | `F1-share-mark-free.png`、`F1-share-resolution-free.png` |
| F2 | 免費 | 點印章 → 付費牆，有新的一列；標記不變 | 付費牆出現「原圖畫質分享圖，可去浮水印」；標記仍是「不加」 | PASS | `F2-seal-locked-paywall.png` |
| F3 | 免費 | 點原圖 → 付費牆，解析度不變 | 第一輪沒跑，第二輪補跑後 PASS（見下方） | — | — |
| F4 | 免費 | 1080p ＋ 標記 → 1080×1080，照片右下有標記 | 1080×1080，4.5 MB（基準 34.7 MB），右下有「Aniseekr」字樣（logo 版之前） | PASS | `F4-1080-text-mark-v1.png` |
| F5 | 免費 | 4K → 2160×2160，比基準清楚 | 2160×2160，17.6 MB。同一區塊比基準 6480 銳利；右下是小 logo | PASS | `F5-4k-logo.png`、`F5-detail-vs-B1.png`、`F5-logo-zoom.png` |
| F6 | 免費 | 相簿：預設 Logo；印章、日期＋地點、不加、高解析度都有 Pro 鎖；點了開付費牆 | 符合 | PASS | `F6-album-free-options.png`、`F6-album-locked-paywall.png` |
| F7 | 免費 | 相簿標準分享，寬 1206，和 B2 一樣，底部有標記 | 1206×1430，底部是小 logo（文字版時是 1206×1421） | PASS | `F7-album-standard-logo-bottom.png` |
| P1 | 強制 isPro | 原圖 → 3024×3024；右下印章；細節清楚 | 3024×3024，33 MB；印章是小的「logo＋巡禮」；plasma 紋理清楚 | PASS | `P1-full-seal.png`、`P1-full-detail.png` |
| P2 | 強制 isPro | 日期＋地點，1080p → 1080×1080 | 1080×1080，右下「2026.11.05 ＋ logo」。這張是自由拍攝，沒有地點，所以只顯示日期，沒有編造地點 | PASS | `P2-1080-dateline.png` |
| P3 | 強制 isPro | 相簿不加＋高解析度 → 2160 寬，無標記，細節清楚 | 2160×2344，底部沒有標記；和標準版放大到同尺寸相比，文字和棋盤格明顯銳利 | PASS | `P3-album-no-mark-bottom.png`、`P3-album-detail-standard-vs-high.png` |
| P4 | 強制 isPro | 相簿印章＋標準 → 1206 寬，底部印章 | 1206×1436，底部印章 | PASS | `P4-album-seal-bottom.png` |

## 第二輪：比對卡浮水印依使用者決定修改（15:04–15:10）

測試資料：3/30 的花照片（有 GPS），配瀑布照片當參考圖，得到兩格的比對卡。

| ID | 身分 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|---|
| G1 | 免費 | 預設帶小 logo，在整組外側右下角，不壓到接縫；淺色、深色照片都看得清楚 | 1080×1080。logo 在實拍格的外角，不在中間接縫。深色身體加白描邊，在暗處也看得到 | PASS | `G1-free-default-logo-pair.png`、`G1-logo-corner-zoom.png` |
| G2 | 免費 | 標記預設 Logo；「不加」有 Pro 鎖，點了開付費牆；自訂文字浮水印仍免費 | 符合 | PASS | `G2-share-mark-free-v2.png`、`G2-none-locked-paywall.png` |
| F3 | 免費 | 點「原圖」開付費牆，解析度維持 1080p | 符合（第一輪沒跑，這輪補上） | PASS | `F3-full-locked-paywall.png` |
| G3 | 免費 | 經典模板保留頁尾 aniseekr | 頁尾和照片角落的 logo 都在 | PASS | `G3-classic-free-footer.png` |
| P5 | 強制 isPro | 經典模板加「不加」，logo 和頁尾都要消失 | 1080×1080，沒有 logo，也沒有頁尾 | PASS | `P5-classic-none-pro.png` |

過程中修掉一個既有 bug：從預覽頁進分享頁時，分享卡永遠只有實拍那一格。原因是分享頁要求 `referenceKind === 'imported'`，但預覽頁從來不傳這個參數；預覽頁本來就只在匯入參考圖時才帶 `imageUrl`。現在分享頁直接用預覽頁給的 `imageUrl`。G1 和 P5 的卡片都有兩格。

整體：**PASS**。兩輪合計 16 案全部 PASS（F3 在第二輪補跑）。Pro 是用旗標強制開的，沒有走真正的訂閱。

## 驗證指令
- `bun run typecheck` 通過。`bun run test:unit` 1512 pass。`bun run spec:check` 100%。
- 改到的檔案跑 eslint：0 error。warning 都是舊程式裡本來就有的 hex 顏色。
- 一個舊測試（「只有三個解析度」）因為多了原圖而過期。已改成檢查「三個免費＋一個 Pro」，並加上原圖尺寸的上下限。

## 偏差與清理
- 模擬器跟 pro-themes session 共用。13:41–13:53 對方的 app 搶到前景兩次，我都切回自己的 app 再跑。已經互相傳訊協調，受影響的步驟都重做了。
- 依 pro-themes 的要求，模擬器沒有關機。
- 測試照片和匯出圖都留在模擬器相簿裡：IMG_0010–0012 是測試照，IMG_0013–0019 是匯出圖。simctl 沒有刪除相簿照片的指令，直接刪 DCIM 檔案會讓 Photos 資料庫壞掉，所以沒刪。
- worktree 的 `node_modules` 連結和 Metro 已移除。

## 程式碼閱讀（不是測試結果）
- Skia 濾鏡（選了濾鏡或自動配色）的照片格，在 4K／原圖下可能仍然是螢幕解析度。Skia 的 Canvas 照畫面大小畫，這次只改了 expo-image 路徑的 `allowDownscaling`。這個情況沒有測。
- Android 沒有跑。`captureSizeForPixels` 在 Android 會原樣傳入像素，行為應該和改動前一樣。

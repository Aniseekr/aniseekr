# P0 分享看得到 — 實機結果（2026-11-05）

**環境**
- 裝置：Samsung S20 FE（SM-G781B，Android 13）。
- Build：worktree 編的 debug dev client `com.kidneyweakx.aniseekr.e2e`（只修改了 gitignored 的 `android/`），JS 透過 Metro 載入。
- 程式版本：分支 `claude/pilgrimage-ux-85ef2a`，包含 e435d01、6061a26，以及本次的修正。
- App 語言：zh-Hant。截圖只存在本機，依 branch 規則不追蹤。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| S1 比對預覽頁底部 | 重拍（圖示）、儲存、分享（主色）；右上沒有分享 | 符合 | PASS | `S1-preview-footer.png` |
| S2 比對照分享 | 分享頁正常；按「更多」叫出系統分享面板 | 第一次：面板會出現，但分享卡的「ANIME」格是一片黑（這個景點沒有場景圖，卡片照樣留了空格）。改成沒有場景圖就只放照片後重看：卡片只剩照片。系統分享面板「1 個項目」，已取消 | FAIL → 修正後 PASS | `S2-share-page-empty-anime.png`、`S2-share-page-photo-only.png`；面板截圖有聯絡人，沒存 |
| S3 自由相機縮圖 | 點縮圖直接開這張的預覽，底部有分享 | 符合，副標「自由拍攝」 | PASS | `S3-thumb-opens-shot.png` |
| S4 自由照分享 | 沒有參考圖也能進分享頁並叫出系統面板 | 符合，卡片只放照片，沒有紅屏 | PASS | `S4-free-shot-share-page.png` |
| S5 從手帳進入 | 預覽頁底部有分享 | 符合。標題原本是「對照結果」，沒有參考圖時已改成「你的照片」，重看正確 | PASS | `S5-journal-entry-title-share.png` |

整體：PASS（S2 先 FAIL，修正後重跑通過）。沒有實際分享到任何第三方 app。

## 過程中修掉的
- 沒有場景圖時，分享卡會留一格黑色的「ANIME」（`ShareCard` 的 `ImagePair` 和漫畫模板）。現在只放照片。Atlas 換掉 anitabi 之後，多數景點都沒有場景圖，所以這是常態。
- 沒有參考圖的照片，預覽頁標題寫「對照結果」。現在改成「你的照片」。

## 手機上的變動與清理
- 存檔測試和分享各在相簿留下了照片：1 張原照、2 張分享卡快照。已依 `_id` 刪除，並查詢確認已不存在。
- `.e2e` debug app 先留著，P1 要用。

## 觀察（未改，留給後續階段）
- 自由相機的預覽只佔上半部（4:3），下面一大塊黑。→ P1 排版。
- 用比對相機在景點拍的照片，在手帳裡被歸到「自由拍攝」，「去過的場景」是 0。→ P2 手帳。
- 分享頁會先把卡片存進相簿再分享（既有設計，IG 需要）。
- 分享頁的 toast 是寫死的英文（「Saved to camera roll」等），違反 Rule 11。
- 從手帳開的預覽頁，「重拍」其實是返回手帳。

# 第二輪 E2E 結果（2026-11-04）

範圍：播出表季別版面（排行／期待榜／過去季）、挑選書籤、鈴鐺與通知、滑卡單一模式、♥ 進收藏、個人頁網點。裝置：iPhone 18 Pro（模擬器被每小時清理排程抹掉，從 `ios/build/dd` 02:02 的建置重裝），JS 由本工作目錄的 Metro 載入。App 語言英文，系統語言繁中。

| ID | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| R1 | 本季「排行」：沒有星期列，有說明，每列有名次、加入清單人數、書籤 | Cyberpunk 2「116.3k on AniList lists · ONA」排第 1 | PASS | R1-ranking.jpg |
| R2 | 點書籤 → 實心、snackbar、Following +1 | 書籤變實心、「Added … to Wishlist」可 Undo、Following 0→1 | PASS | R2-picked.jpg |
| R3 | 2027 冬（未開播）：沒有星期列與模式切換、依期待排序、有開播日 | 58 部，第 1 名 41.7k、「Starts 1/1」 | PASS | R3-upcoming.jpg |
| R4 | 2026 夏（已結束）：依分數排、meta 是 ★ x.x | BLEACH ★8.8 排第 1 | PASS | R4-past.jpg |
| R5 | 卡堆沒有模式鍵，底部 ✕ ♥ 🔖 | 符合 | PASS | R5-deck-single-mode.jpg |
| R6 | 按 ♥ 後收藏出現該作品（看完＋最愛） | 收藏 2 titles、Completed 1、Favorites 1（SAO） | PASS | R6-library-completed.jpg |
| R7 | 個人頁頭像卡有網點；統計是真實數字 | 右上網點漸層；Rated 1、Liked 1 | PASS | R7-profile.jpg |
| R8 | 點鈴鐺 → 先問通知權限 → 鈴鐺亮起 → 系統真的排程 | 權限只在點鈴鐺時才問；允許後鈴鐺亮、Following 2；設定 → 通知顯示「1 scheduled」，時間 21:15＝21:30 開播減 15 分鐘 | PASS | R8-bell.jpg、R8b-scheduled.jpg |

總判定：PASS（8/8）。

## 未驗證
- 書籤、鈴鐺的彈跳與晃動動畫：截圖只拍得到最終狀態，動畫本身沒錄影。
- 取消挑選（在 Want to watch 狀態移除、在 Watching 狀態改開編輯面板）沒實測。
- 通知實際送達沒等（排在 21:15）。
- 淺色模式、zh-Hant 介面沒測。

## 偏差
- 模擬器點擊常被吃掉，需要點第二次（工具問題）；原生 Switch 用拖曳。
- 用 deep link 切頁。
- 在模擬器上允許了通知權限、建立了 3 筆本機追蹤（Cyberpunk 2、Detective S2、SAO），沒碰遠端。

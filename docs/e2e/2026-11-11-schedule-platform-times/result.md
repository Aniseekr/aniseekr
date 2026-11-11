# 結果 — 番劇表平台時間 / 整季格狀 / 巴哈官方連結 (2026-11-11)

範圍與 build：iOS Release，iPhone 18 Pro 模擬器，`SIMCTL_CHILD_TZ=Asia/Taipei`，feat/uiux-cleanup 工作樹（commit 前）。
Run 1 = 第一次 build；Run 2 = 修正後重新 build（同一份 app 資料，主要平台 = 動畫瘋）。
對照資料：AniList GraphQL + bangumi-data@0.3（`reference.txt`）。

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| C1 七天時間表 | 今天·三 起 7 個日標題、依時間排序 | 符合 | PASS | C1-timetable.png |
| C2 週列跳日 | 點 五 → 捲到 五 11/13、週列固定 | 符合 | PASS | C2-C5-jump-friday-jojo.png |
| C3 日本時間基準 | 千歲 ep6 11/17 22:00 | 11/17 22:00 | PASS | C3-chitose-jp-time.png |
| C4 平台時間 | 千歲 巴哈 ep5 11/12 00:30（日本 11/10 22:00） | Run1：ep6 11/19 00:30 放在 11/12 區 → **FAIL**；修正後 Run2：「第 5 集 · 明天 00:30 · 動畫瘋 / 日本首播 11/10 22:00」 | PASS（Run2） | C4-run1-FAIL-*.png, C4-run2-PASS-chitose-ep5-bahamut.png |
| C5 JoJo SBR 在週表 | 五 11/13 16:00 ep8 | 符合 | PASS | C2-C5-jump-friday-jojo.png |
| C6 整季格狀 | 3 欄、排序/類型 chips、人氣遞減 | 121.6k→111.8k→107.9k… | PASS | C6-season-grid-popular.png |
| C7 評分排序 | ★ 遞減 | 8.8→8.6→8.5 | PASS | C7-season-grid-score.png |
| C8 巴哈官方連結 | 開 acgDetail.php?s=140852 | SpringBoard log 同 URL，Safari 顯示「彈珠汽水瓶裡的千歲同學」 | PASS | C8-openurl.log, C8-bahamut-page.png |

Run 1 另外發現並已修正（Run 2 驗證）：
- 週列顯示週一~週日，時間表是今天起 7 天 → 點「二 10」跳到 11/17。改成週列也從今天起（run2-strip-today-first.png）。
- 超過 7 天的集數（愚者之夜 11/26）被放在本週「四 11/12」下 → 新增「之後」區（run2-later-section.png）。
- 切換 時間表/整季 保留舊捲動位置，排序 chips 在畫面外 → 切換時捲回頂端（run2-mode-switch-scroll-top.png）。

未驗證：
- 巴哈連結是巴哈 ACG 資料庫頁，不是動畫瘋播放頁（bangumi-data 只提供這個 id），要再點一次才到播放。
- 沒有測 Android；沒有測提醒通知是否在巴哈時間觸發（程式上用同一個 airingAt）。
- 平台延後 >7 天、或日本停播週，episode 推算假設每週播出，可能錯一集。

清理：模擬器已 `shutdown all`；測試 app 內的平台設定（動畫瘋）留在模擬器，無真實帳號資料。

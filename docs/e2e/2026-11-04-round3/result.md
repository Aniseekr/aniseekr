# 第三輪 E2E 結果（2026-11-04）：減字、平衡、接下來、收藏狀態列、吉祥物頭像

裝置：iPhone 18 Pro 模擬器（同一個裝置，重開機），JS 由本工作目錄的 Metro 載入。

| ID | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| T1 | 播出表頂部「接下來」只列我在追且有下一集的作品，倒數 24 小時內用 accent 色；模式切換在標頭右側變成圖示 | Detective S2「Ep 5 · in 17 h」(accent)；Cyberpunk 2 是 ONA、沒有下一集時間，所以沒列；標頭是季別鈕＋排行圖示＋⋯ | PASS | T1-schedule-upnext.png |
| T2 | 收藏狀態不用橫滑，全部看得到 | 兩行顯示 Watching／Want to watch／Completed／Favorites／My lists | PASS | T2-library-chips.png |
| T3 | 沒同步平台：名稱是「Rookie Seeker」、頭像是吉祥物 | 符合；統計是真實數字 | PASS | T3-profile.png |
| T4/T5 | 點頭像 → 4 個 Seekr 可選 → 選了立刻換 | 換成閱讀姿勢 | PASS | T4-mascot-picker.png、T5-mascot-picked.png |
| T6 | 類型頁沒有說明文字 | 只剩標題、封面、開始滑卡、最熱門列表 | PASS | T6-genre-less-text.png |
| T7 | 排行用圖示＋數字取代說明句 | 「👥 116.3k · ONA」、沒有說明段落 | PASS | T7-rank-icons.png |

總判定：PASS（7/7）。

## 觀察（未驗證）
- 模擬器關機重開後，通知權限變回「Not set」、已排的 1 則提醒消失；鈴鐺顯示空心，跟系統狀態一致。實機重開機會不會一樣，沒驗證。
- 選吉祥物的動畫、鈴鐺晃動只拍到最終狀態。

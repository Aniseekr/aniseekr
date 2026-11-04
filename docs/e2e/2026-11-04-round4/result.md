# 第四輪 E2E 結果（2026-11-04）：多語言、搜尋、裁切、評分入口、設定、分享

裝置：iPhone 18 Pro 模擬器，系統語言 zh-Hant-JP，App 語言「自動」。JS 由本工作目錄的 Metro 載入。

| ID | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| L1 | 系統中文時介面是中文；沒有中文名的作品顯示日文原名，不顯示羅馬字 | 介面全中文（原本一直是英文）；「探偵はもう、死んでいる。Season2」 | PASS | L1-zh-auto.jpg |
| S1 | 搜尋空白時有本週熱門可以直接點 | 8 部，有中文名的顯示中文（航海王），其他顯示日文 | PASS | S1-search-trending.jpg |
| P1 | 巡禮縮圖不再是灰框 | 列表縮圖都有圖 | PASS | P1-pilgrimage.jpg |
| R1 | 收藏長按 → 編輯面板讀到現有狀態、未評分 | 想看（沒被重設成在看）、「未評分」、0/13 | PASS | R1-sheet-seeded.jpg |
| R2 | 評 8.5 存檔 → 卡片角落顯示我的評分 | ★ 8.5，狀態維持想看 | PASS | R2-library-myscore.jpg |
| S2 | 播出表「還沒決定」改成一顆次要按鈕 | 符合 | PASS | S2-schedule-triage.jpg |
| ST1 | 設定頁頭像卡有名字與吉祥物；沒有長說明 | 「見習 Seeker」＋閱讀姿勢；副標拿掉 | PASS | ST0-settings.jpg（修前）、ST1-settings.jpg（修後） |
| SH1 | 分享模式操作列不被 tab bar 蓋住；分享產生圖片 | tab bar 隱藏；系統分享面板出現「儲存影像」 | PASS | SH1-share-sheet.jpg |
| H1 | 探索首頁中文介面正常 | 類型「動作／冒險」、作品中文名 | PASS | H1-discover-zh.jpg |

總判定：PASS（9/9）。

## 未驗證
- 韓文、簡體中文介面沒有實際切換測試（ko 只有 46/1914 個 key，缺的照設計退回英文；zh-Hans 由繁中經 OpenCC 轉）。
- 分享後沒有真的存進相簿。
- Android 讀系統語言的路徑沒改也沒測。

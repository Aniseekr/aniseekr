# 1.3.0 送審前：合規字串、狀態列、商店截圖 — 結果

範圍：iOS Release build（`xcodebuild -derivedDataPath ios/build/dd`，模擬器），iPhone 18 Pro 與 iPad Pro 13-inch (M5)，zh-Hant／en。Android 只做 release build（`assembleRelease` 成功，22 分鐘），沒有上機。

| ID | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| S1 狀態列 | 深色畫面上白字 | 修前黑字壓在深色背景；`UIViewControllerBasedStatusBarAppearance=false` + LightContent 後白字 | PASS | `marketing/raw/ios/*/01-discover.png` |
| P1 定位權限說明（zh-Hant） | 系統對話框是中文 | 「AniSeekr 使用你的位置來顯示附近的動畫聖地。」 | PASS | `location-prompt-zh-Hant.png` |
| P2 4 個語系 InfoPlist.strings 進 bundle | app 內有 ja／ko／zh-Hans／zh-Hant.lproj | `plutil -p` 讀到中文字串 | PASS | build log |
| P3 Face ID 提示文字 | 走 i18n | 改用 `t('settings.adultContentAuthPrompt')`；沒有在機上觸發 Face ID | UNVERIFIED | — |
| D1 詳情頁狀態／標籤 | 已完結；動作／劇情／科幻 | 同預期 | PASS | `raw/ios/zh-Hant/04-detail.png` |
| D2 熱門列表類型 | 動作／喜劇 | 同預期 | PASS | `raw/ios/zh-Hant/06-trending.png` |
| D3 搜尋結果狀態／標籤 | 翻譯後顯示 | 程式已改；沒有在機上看搜尋結果 | UNVERIFIED | — |
| M1 Metro 快取放在 checkout 內 | `.expo/metro-cache/` 有內容 | Release build 打包後有 `00 01 02 …` | PASS | — |
| C1 商店截圖 | iPhone＋iPad × en／zh-Hant × 6 | 24 張原圖，render 出 63 張 | PASS | `marketing/out/` |

## 觀察到、沒修（code review / 觀察）
- **返回探索頁後，第一下點擊常被吃掉**（tab 或海報），iPhone 和 iPad 都重現約 6 次，第二下才有效。原因未查。
- 詳情頁「相關作品」的關係類型顯示英文 `Other`；製作團隊的職稱是英文（AniList 資料）。
- 簡介是 AniList 英文原文（資料，沒有翻譯來源）。
- iPad 版面就是手機版拉寬（類型卡很大），沒有 iPad 專用排版。
- 從「開啟定位」點下去，第一次沒有跳出權限詢問（之前狀態可能是拒絕）；重設權限後正常跳出。

## 清理
模擬器已全部關閉（`simctl shutdown all`）；狀態列 override 會隨關機清掉。iPhone 18 Pro 模擬器語言留在 zh-Hant、外觀深色。

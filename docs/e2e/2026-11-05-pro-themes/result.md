# Pro 主題包＋外觀層＋付費牆文案 — E2E 結果（2026-11-05）

## 範圍與 build
- 分支 `claude/pro-themes-7b0f3e`，commits `0ffd581` `35ecaee` `864193e` `a7a23b1`。
- iPhone 18 Pro 模擬器（共用、已開機）。Debug dev client 用**獨立** bundle id `kidneyweakx.aniseeker.themes`、scheme `aniseekerthemes` / `exp+aniseekr-themes`（未 commit 的 `app.config.js`），Metro :8082 用獨立 TMPDIR + `--clear`；確認 bundle 內含本分支字串（`Twilight Platform`、`resolveGrandfatheredTheme`）。字型與 6 個 alternate icon 已打進 `.app`（`UIAppFonts`、`CFBundleAlternateIcons` 驗過）。
- 模擬器無法購買 → 實際狀態是**非 Pro**。
- 截圖在 `shots/`（git 忽略，只追蹤 md；已縮成 50%）。

## 升級情境怎麼重現
Phase A（模擬 1.3.0 以前）：暫時的未 commit patch：`PREMIUM_ENABLED=false`＋關掉祖父條款寫入；全新安裝、從第一次啟動就套用。在 A 階段用卡片點選 Cyberpunk。
Phase B：patch 全部還原成分支程式碼，冷啟動 → 遷移第一次執行（就是使用者升級的路徑）。
主題巡覽用暫時的 E2E harness（未 commit、已刪）：呼叫真實的 `setTheme`/`setThemeMode`/router，每步請本機 helper 跑 `simctl io screenshot`。卡片點擊、鎖、付費牆全部用手點。

## 結果
| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| A1 build 正確 | 14 張主題卡；attackOnTitan 顯示 Frontier | 有 Washi…Natsuzora；顯示「Frontier」 | PASS | `A-*-appearance.png`、`B2-locked-new-themes.png` |
| A2 6 主題 dark | 色盤套到畫面 | 6 個都套上（強調色、底色、卡片邊） | PASS | `A-<id>-dark-*.png`、`B-<id>-dark-*.png` |
| A3 6 主題 light | 淺色表面、文字可讀 | 6 個都切到淺色表面；文字可讀 | PASS | `A-<id>-light-*.png`、`B-<id>-light-*.png` |
| A4 外觀層在真實畫面（收藏、巡禮 hub、個人頁） | 卡片邊、紋理、標題字型 | 邊框：Washi 朱紅印框、Screentone/Cel 墨線、其餘玻璃細邊 ✔。字型（英文 UI）：Washi/Yozakura DM Serif、Screentone Bangers、Cel Righteous ✔。紋理：Yozakura 花瓣、Natsuzora 雲在個人頁卡片明顯；和紙纖維／網點／顆粒／掃描線刻意很淡 | PASS（見下方限制） | `B-<id>-<mode>-{collection,pilgrimage,profile}.png` |
| A5 備好祖父條款 | 免費時代點 Cyberpunk | 已套用 Cyberpunk | PASS | `A5-cyberpunk-picked.png` |
| B1 祖父條款保留 | 還原後冷啟動仍是 Cyberpunk、卡片不鎖 | 仍是 Cyberpunk；卡片顯示緞帶（不是鎖） | PASS | `B1-grandfathered-cyberpunk.png` |
| B2 鎖定狀態 | 非 Pro：6 新主題＋Frontier 上鎖 | 7 張都顯示鎖 | PASS | `B2-locked-new-themes.png`、`B1-…top.png` |
| B3 鎖 → 付費牆 | 點 Washi 開 PaywallSheet、主題不變 | 開了，副標「Travel tools for your pilgrimages, and a look that's yours.」，兩列：Premium themes & skins…／No ads；主題仍是 Cyberpunk | PASS | `B3-paywall-from-washi.png` |
| B4 祖父條款可來回 | 換 Midnight 再點 Cyberpunk 不跳付費牆 | 直接套用 | PASS | `B4-switched-to-midnight.png`、`B4-back-to-cyberpunk-no-paywall.png` |
| B4b 重開仍保留 | 停在 Midnight 冷啟動，Cyberpunk 仍解鎖 | 仍顯示緞帶 | PASS | `B4b-relaunch-on-midnight-cyberpunk-still-unlocked.png` |
| B5 App 圖示 | 主題圖示區塊對非 Pro 上鎖，點了開付費牆 | 6 個圖示都有鎖；點 Washi 開付費牆 | PASS | `B5-app-icons-locked.png`、`B5-app-icon-locked-paywall.png` |

## E2E 中發現並已修
- 「Twilight Platform」＋Premium 標籤溢出、選取的勾勾被擠掉（Cyberpunk 也是）。標籤移到色塊那一列（`a7a23b1`），重拍 `B2` 確認。App 圖示英文名改成「Twilight」避免截斷。

## 沒驗到 / 限制
- **UNVERIFIED** 真的切換成新 alternate icon：要 Pro，模擬器不能購買（沒有 RevenueCat key）。只驗到 icon 有註冊進 `Info.plist`。
- **UNVERIFIED** 購買流程本身（同上）。
- **UNVERIFIED** Android：字型 `fontFamily`、adaptive icon 都沒在 Android 跑。
- zh-Hant 付費牆沒截圖（字串在 json，i18n parity 測試過）。
- 限制（設計如此，不是 bug）：外觀字型只用在拉丁字；中文 UI 的標題仍是系統字（`A-*` 截圖）。紋理只畫在 `ThemedSurface` 裡；收藏、巡禮 hub 的整頁背景各自畫，所以紋理主要出現在卡片／個人頁，整頁背景要另外做共用容器。
- 小觀察（非本次範圍）：「加入收藏」sheet 的狀態名稱在中文 UI 是英文寫死。

## 清理
- 已解除安裝 `kidneyweakx.aniseeker.themes`，刪 `ios/`、`app.config.js`、`node_modules` symlink、Metro :8082、helper。pro-export 的 `kidneyweakx.aniseeker` 沒碰。
- 偏差：13:41–13:53 跟 pro-export 同時操作模擬器，有幾下點到對方 app；當時沒截任何本次證據，之後等對方釋放才重跑，全部 case 都是釋放後的乾淨執行。

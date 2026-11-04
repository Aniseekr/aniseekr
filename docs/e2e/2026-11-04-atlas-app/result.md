# Run A E2E — 巡禮改用 Atlas（2026-11-04）

範圍與 build：iPhone 18 Pro 模擬器，dev client（11-04 02:03 native build）+ Metro 跑工作樹。Atlas `20261104-6584d5e-f2`。
模擬位置：高山 36.1408,137.2522。預期值見 `expected.txt`（curl Atlas 算出）。

## 最終結果（第 4–9 輪）

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| A1 氷菓作品頁 | Atlas 44 點、集數、可信度、無場景圖 | 44 點；第21話等；已確認／單一來源比對；最近 46 m（= curl 0.05 km）；靠近打卡橫幅；地圖 EP 1 | PASS | `A1-r2-hyouka-work.png` |
| A2 續作 ゆるキャン△ SEASON２ | 透過 AniList 前作找到 `yuru-camp` | 作品頁出現「搖曳露營△ 244 個場景」卡，區域 chip「山梨県 身延町」 | PASS | `A2-r3-yurucamp-s2-card.png`、`A2-r4-city-chip.png` |
| A3 首頁附近 | 高山附近氷菓景點 | 3 km 內 32 處；最近 飛騨高山観光案内所 46 m | PASS | `H1-hub-top.png` |
| A4 匯入參考圖 | 點擊後可匯入截圖並疊圖，有集數提示 | REF → 「選擇參考圖／第 21 集・22:00／匯入截圖」→ 相簿選圖 → 75% 疊圖 | PASS（見下方 UX 備註） | `A4-ref-tap.png`、`A4-ref-imported.png` |
| A5 致謝頁 | Aniseekr Atlas，無 anitabi | 「Aniseekr Atlas／聖地巡禮資料」 | PASS | `A5-attribution.png` |
| B88 88 選開作品 | STEINS;GATE 開出 Atlas 40 點 | 40 個地點、標題正確 | PASS | `B88-r4-steins-gate.png` |
| H1–H3 首頁改版 | 附近緊湊列、各區「全部」、完整列表 | 附近 3 列 + 全部；熱門／88 選／集章活動 橫列；88 選全部頁按地區分組，返回鍵「巡禮」 | PASS | `H2-r2-hub-rails.png`、`H3-r2-list-88.png` |

整體：PASS（範圍內案例）。

## 過程中抓到並修好的問題
1. 信心標籤顯示原始 key；地圖 EP 0；無資料時標題「—」。
2. 88 選只用 Bangumi id 開頁（67/88 → 修後 82/88；其餘 6 部 Atlas 沒有或只有續作）。
3. route params 物件進 useMemo 依賴 → 無限 render（紅屏）。
4. Atlas 型別假設 zh／en 一定存在 → 69 部作品崩潰（`hant of undefined`）。
5. 作品頁只傳 id+browseSource；PREQUEL 查詢沒指定平台被當成 MAL id 查。
6. 卡片區域 chip 顯示市町村代碼 19365。

## 未驗證
- 快門拍照：模擬器沒有相機。
- 舊資料遷移（Run B）、付費牆（Run C）不在本輪。
- release build 效能：dev 模式下點擊有延遲，在修好無限 render 後改善，未在 release build 量測。

## UX 備註（未修，排入後續）
- 匯入參考圖入口藏在左上小 REF 框；匯入後 REF 縮圖仍顯示空圖示。

## 偏差
- 模擬器點擊偶爾延遲生效，改用 `simctl io screenshot` 加等待；`simctl privacy grant` 會結束 app（模擬器行為）。

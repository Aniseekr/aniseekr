# E2E plan — 集章活動／88 改成 R2 遠端資料

Build：aniseekr `feat/uiux-cleanup` 工作樹（未 commit），內建資料 = atlas `54697b2`；atlas-api 工作樹（未部署）。
裝置：既有 `iPhone 18 Pro` 模擬器、dev client + Metro。

| ID | 目的 | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|---|
| E1 | Worker 路由：R2 沒檔案時 | `wrangler dev --local`，curl `/api/v1/locality` | 503 `unavailable` | curl 輸出 |
| E2 | Worker 路由：R2 有檔案 | `wrangler r2 object put --local aniseekr-id-mappings/locality/latest.json --file dist/locality.json`，再 curl | 200、`format=1`、`commit=54697b2`、12 個活動、88 共 146 筆、`cache-control: public, max-age=600` | curl 輸出 + jq |
| E3 | App 活動清單出現新集章 | 開聖地 → 活動／新聞頁的活動區 | 看得到 日本三國（進行中）、中野×杉並×豊島（進行中）、文スト ヨコハマ降誕祭（即將開始 11/14） | 截圖 + 頁面文字 |
| E4 | App 88 是 2026 年版 | 開 88 清單 | 出現 2026 新條目（例：ざつ旅、千歳くんはラムネ瓶のなか） | 截圖 + 頁面文字 |
| E5 | App 真的從遠端抓 | — | — | **UNVERIFIABLE**：App 寫死正式網址，路由未部署、R2 未上傳。由單元測試 `locality-remote-loader.test.ts` 覆蓋，上線後再測 |

清理：停 wrangler dev、Metro；`xcrun simctl shutdown all`。

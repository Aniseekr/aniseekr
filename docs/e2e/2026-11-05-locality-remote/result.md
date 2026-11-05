# E2E 結果 — 集章活動／88 改成 R2 遠端資料（2026-11-05）

範圍與 build：aniseekr 工作樹（內建資料 = aniseekr-atlas `54697b2`），aniseekr-atlas-api 工作樹（本機 `wrangler dev --local`，未部署）。

**總判定：BLOCKED**（App 畫面兩項沒跑成）

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| E1 R2 沒檔案 | 503 `unavailable`，不快取 | 503、`Cache-Control: no-store` | PASS | `e1-curl.txt` |
| E2 R2 有檔案 | 200、format 1、commit 54697b2、12 活動、88 共 146 筆、max-age=600 | 完全相符（128,580 bytes） | PASS | `e2-curl.txt` |
| E3 App 活動清單出現新集章 | 日本三國／中野杉並豐島進行中、文スト 即將開始 | 沒跑 | BLOCKED | — |
| E4 App 88 是 2026 年版 | 出現 ざつ旅、千歳くん 等 2026 新條目 | 沒跑 | BLOCKED | — |
| E5 App 真的從遠端抓 | — | — | UNVERIFIABLE | 正式路由未部署、R2 未上傳 |

## Blocked 原因與需要什麼

- E3/E4：唯一的 `iPhone 18 Pro` 模擬器正被另一個 session（`pro-export` worktree，自己的 Metro 在 8081）拿來測巡禮相簿分享。我用 deep link 叫 dev client 連我的 Metro（8085）時跳出系統的「要在 AniSeekr 中打開嗎？」，**兩次點「取消」都沒反應**，所以停手沒再動。**那個對話框可能還在，請按「取消」。** 等那個 session 用完模擬器再重跑 E3/E4。
- E5：要先 push aniseekr-atlas（觸發 publish-locality）、在 aniseekr-atlas repo 加 `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`、部署 atlas-api，然後用 App 冷啟動確認。

## 遠端狀態變更

無。只寫了本機 miniflare 的 R2（`.wrangler/state`），正式 R2、Worker 都沒動。

## 偏差

- Metro 8081 被另一個 worktree 占用，改用 8085。

## Code review / 單元測試（不是 E2E）

- `__tests__/unit/pilgrimage/locality-remote-loader.test.ts` 9 項：新資料可替換、88 跟著換版、下次冷啟動同步讀快取、不比內建新的快取不採用、網路錯誤／503／非 JSON／未知 format／驗證不過都保留原資料、6 小時內只抓一次。
- `bun run typecheck`、範圍 eslint（0 error）、`bun run test:unit` 1520/1520、`bun run spec:check` 100%。

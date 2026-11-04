# Run B E2E — 舊紀錄遷移（2026-11-04）

範圍與 build：iPhone 18 Pro 模擬器，同一個 dev client native build、同一個 app container。
舊 JS = commit `ab60131`（最後一個 anitabi 版本，暫時 worktree，不 commit），新 JS = 工作樹（Run A 已 commit + Run B 未 commit）。

## 資料怎麼來
- 這台機器在日本，anitabi API 403，舊版 UI 載不到任何地點，無法用點擊產生紀錄。
- 改在暫時 worktree 加一個 seed 畫面，呼叫舊版自己的 `recordCapture` / `checkInSpot` / `saveSpotIntents` / `CacheService.set` / `LocalDB.savePilgrimage` 寫入，格式與舊版完全相同。
- 舊 spot id 是合成的（`27364_a1` 等）；`.raw` 參考資料不在本機。座標取自 Atlas 真實景點加 11–25 m 位移。預期對應見 `expected.txt`。

## 結果

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| M-a 照片 a1 | 搬到 `hyouka-hida-takayama-tourist-information`，清掉舊圖 URL | 相同；`spotImage` 已移除；uri 不變 | PASS | `M1-stores-after.txt` |
| M-b 收藏 a2 | 搬到 `hyouka-hanasato-overpass`（25 m） | 相同；`meta.image` 已移除 | PASS | `M1-stores-after.txt` |
| M-c 去過 a1 + v3（v3 只有 id，無座標） | a1 → 觀光案內所；v3 從 `anitabi_points_v2_` 恢復座標 → `hyouka-at-19-66` | 兩個都搬過去，保留最早時間；legacy visited = [] | PASS | `M1-stores-after.txt`、`M1-hyouka-visited.png`（已去 2） |
| M-d 照片 far（2.9 km 內無 Atlas 點） | 保留舊 id、標 legacy、相簿顯示「舊景點」 | 相同 | PASS | `M1-album.png` |
| 照片檔 | 不刪不動 | 兩個檔 SHA 前後相同 | PASS | `M0-files-before.txt` |
| 舊快取清理 | `anitabi_points_v2_*` 刪除、`pilgrimage_spots` drop、完成旗標 | cache 0 筆、表已 drop、flag = done、journal 清掉 | PASS | 對話中 sqlite / strings 輸出 |
| M-e 重開一次 | 不變 | MMKV 內容 hash 前後相同 | PASS | `M2-idempotent.txt` |

整體：PASS（範圍內）。

### M5 重跑（加入 `anitabi_spots`）
重新安裝 → 舊 JS seed（多一筆只在 `anitabi_spots` 有座標的去過 v4）→ 新 JS。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| v4 去過（座標只在 `anitabi_spots`） | 搬到 `hyouka-ipp-sugi-hakusan-jinja` | 相同 | PASS | `M3-rerun-after.txt` |
| 舊表清理 | `anitabi_spots`、`pilgrimage_spots` 都 drop，cache 0 筆 | 相同，flag = done | PASS | `M3-rerun-before.txt`、`M3-rerun-after.txt` |

## 過程中抓到的問題
- M1 遷移期間新增的紀錄會被舊快照覆蓋（已改成先算對應、再同步重讀＋寫入）。
- M2 離線延後時新建的 Atlas id 會被誤標舊景點（改用 Atlas spot shard 精確判斷）。
- M3 只用 Bangumi id 找作品（加入標題比對）。
- M4 去過紀錄讀錯舊快取 key（`anitabi_detail_` 是 1.1.5 前的；實際是 `anitabi_points_v2_<bgm>` 與 `pilgrimage_spots`）。單元測試用了同樣錯的 key 所以沒抓到；本次實機抓到。

## 未驗證／備註
- 舊 id 是合成格式；真實 anitabi point id 格式不影響比對路徑（比對靠 animeId + 座標）。
- 相簿頂部「去過的場景 1」與作品頁「已去 2」數字不同；舊版遷移前也顯示 1，看起來是統計口徑不同，不是遷移問題，未追。

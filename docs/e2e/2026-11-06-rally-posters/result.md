# 集章活動卡片沒有圖 — 2026-11-06

裝置：Galaxy S20 FE（`RFCR81WHKWJ`），`com.kidneyweakx.aniseekr.e2e` dev client + 本機 Metro（watch 模式，`--clear`，獨立 TMPDIR）。

## 根因

活動資料（`local-intel.data.json` 的 event）本來就沒有圖片欄位；所有活動畫面都是用活動的
`bangumiIds` 去拿 Bangumi 海報（`/v0/subjects/{id}/image`）。

- 聖地資訊 hub 活動列表、活動詳情頁、標籤 chip：用 `RallyPoster`，直接拿 `event.animeIds[0]` → 本來就有圖。
- **探索頁「集章活動」rail（`RallyDiscoverCard`）**：只透過 Atlas `works` 清單找海報，沒有 Atlas 場景的作品
  （例如《日本三國》623851）找不到 → 掉到純文字卡。這是 bug。

修正：`RallyDiscoverCard` 找不到 Atlas work 時，改用活動自己的 Bangumi id（跟 `RallyPoster` 同一來源）。
沒有任何關聯作品的活動（中野×杉並×豐島 數位集章，`bangumiIds: []`）維持原本的文字＋票券圖示卡，不放假圖。

## 實機結果

| # | 案例 | 預期 | 結果 | 證據 |
|---|------|------|------|------|
| 1 | 修正前：探索 rail《日本三國》 | 重現無圖 | 純文字卡（重現） | `03-discover-rail-before.png` |
| 2 | 修正後：探索 rail《日本三國》 | 顯示真實海報 | PASS | `04-discover-rail-after.png` |
| 3 | 修正後：中野×杉並×豐島（無關聯作品） | 誠實空狀態，不放假圖 | PASS（文字＋票券圖示） | `04-discover-rail-after.png` |
| 4 | 聖地資訊 hub 活動列表 | 有關聯作品者顯示海報；無者顯示圖片 glyph | PASS | `01-event-hub-posters.png` |
| 5 | 活動詳情頁 hero | 顯示海報 | PASS | `02-rally-detail-hero.png` |

## 追加：印章造型圖（使用者：「還有蓋章的印章造型 如果有就給吧」）

結論：**來源沒有印章圖**，不接、也不做佔位圖。查過：

- App 內嵌資料 `libs/services/pilgrimage/local-intel/local-intel.data.json`：event 欄位只有
  `id/kind/bangumiIds/category/name/description/venue/geo/schedule/sourceUrl/officialUrl/verifiedAt/stampSpots`；
  236 個 `stampSpots` 的欄位只有 `name/address/geo/sourceUrl`。
- 型別 `local-intel/types.ts` 的 `StampSpot`、`locality/types.ts` 的 `stamp_stop` role（`sourceLabel/sourceAddress/animeIds/availability`）：沒有任何圖片欄位。
- Atlas 原始資料 `aniseekr-atlas/atlas/locality/local-intel.json`：欄位跟內嵌的一樣，沒有圖。
- 遠端 `https://atlas.aniseekr.moe/api/v1/locality`：目前回 404（app log 也是 `remote fetch failed; keeping current data`）。
- Bangumi / Anitabi：沒有集章活動或印章資料的端點；Bangumi 只提供作品海報（已用在活動卡）。

實機：活動詳情的集章點列表維持編號虛線章框（`StampMark`），沒有假印章圖 → `05-rally-stamp-stops.png`。
要真的顯示印章造型，得先在 Atlas 資料替每個 stamp spot 補上有授權的圖片欄位，app 端才有東西可接。

## 排除的假設

一開始懷疑 api.bgm.tv 會擋 Android 圖片載入的 User-Agent（curl 用 `okhttp/4.12.0` 或空 UA 會回 403）。
實機 A/B：用 hot update 加可見標記確認程式碼已生效，再用沒載過的 URL、不帶 UA 去載 → 海報照常顯示
（裝置實際送的 UA 會過，curl 用 `Dalvik/2.1.0` 也回 302）。所以 UA 改動沒必要，已全部還原。

注意：第一次跑 Metro 用了 `CI=1`，會關掉檔案監看，裝置一直跑舊 bundle，那時拍的 A/B 截圖都不算數，已刪除並重做。

## 未驗證

- iOS 沒跑。
- 日記頁集章冊（`StampBookSection`）本來就是集章格設計、沒有海報，這次沒改。
- 測試時把 app 模式切到 Explorer 看畫面，結束後已切回 Collector。

## 檢查

`bun run typecheck` ✅ · `bunx eslint components/pilgrimage/home/RallyDiscoverCard.tsx` ✅ · `bun run test:unit` 1545 pass / 0 fail。
沒動 data-sources / repositories / pilgrimage services，所以沒跑 `spec:check`。

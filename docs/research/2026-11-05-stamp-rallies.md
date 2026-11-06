# 動漫集章活動盤點（2026-11-05）

> **更新（同日）**：資料已搬到私有 `aniseekr-atlas/atlas/locality/`，由 publish-locality workflow 上傳 R2，App 從 `https://atlas.aniseekr.moe/api/v1/locality` 更新（內建檔當備援）。已加入：日本三國 四都市巡覧記（20 處）、中野×杉並×豊島（9 處）、文スト ヨコハマ降誕祭（6 處，其中 神奈川近代文学館、中華街インフォメーションセンター 查不到座標 → 不標點）；88 升級到 2026 年版（146 筆）。下面「為什麼只看到 4 個」描述的是改動前的狀態。
>
> 沒加的：京スマ×推しの子（點數制任務，沒有固定集章點清單）、逃げ若 諏訪（官網 403，日期未親自確認）、JAL 88 集章（集章點就是 88 各地，沒有獨立清單）。

## 為什麼 App 只看到 4 個

- 資料來源：`libs/services/pilgrimage/local-intel/local-intel.data.json`（由 `build-stamp-rallies.ts` 產生，`VERIFIED_AT = 2026-07-18`），打包在 App 裡。
- `BundledLocalityDataLoader.loadLatest()` 只回傳打包資料 → **沒有遠端更新**，活動只能跟著發版更新。
- 資料共 7 個 `stamp_rally`；Discover 只顯示 `active` / `upcoming`（`stamp-rally.ts` `isJoinableRally`）：

| id | schedule | 2026-11-05 狀態 | 顯示 |
|---|---|---|---|
| numazu-machiaruki-stamp | ongoing | active | ✅ |
| yuru-meguri-stamp | ongoing | active | ✅ |
| oarai-gup-mini-event-stamp | ongoing | active | ✅ |
| ll-sunshine-jr-central-stamp | ongoing | active | ✅ |
| yohane-jr-central-numazu-stamp | fixed 2023-11-03〜12-25 | ended | ❌ |
| watakon-chiyoda-sakura-stamp-2026 | fixed 2026-03-11〜04-22 | ended | ❌ |
| jujutsu-jr-central-nagoya-stamp | annual(5月), confirmed=[] | unannounced | ❌ |

結論：顯示的 4 個全是常設；短期活動一個都沒有，因為 7 月以後就沒再補資料。

## 長期／常設（≥ 半年或無期限）

| 活動 | 作品 | 地區 | 期間 | 來源 | 是否已在資料內 |
|---|---|---|---|---|---|
| ゆる巡りスタンプ | 搖曳露營△ | 山梨・靜岡 26 處 | 常設 | https://yurumeguristamp.com/spot/ （2026-11-05 仍列 26 處） | ✅ |
| JR東海 LL!サンシャイン!! スタンプラリー | Love Live! Sunshine!! | 沼津 9 處 | 常設（地圖附在「沼津旅のしおり」） | https://recommend.jr-central.co.jp/oshi-tabi/lovelive_sunshine/stamprally/ （頁面仍在） | ✅ |
| 沼津まちあるきスタンプ | Love Live! Sunshine!! | 沼津 | 常設 | （既有資料） | ✅ |
| 大洗ガルパン ミニイベント | 少女與戰車 | 大洗 8 處 | 2014〜 常設 | https://www.oarai-info.jp/essay/postid_4868/ | ✅ |
| JAL「あなたのアニメ聖地巡礼」2026年度 | 多作品（アニメ聖地 88） | 全國 | 2026-04-01〜2027-03-31，每處每季可蓋一次 | https://smartstamprally.digital/jalanime_jp/NpZXAgpAGHSyw | ❌ |
| 日本三國 四都市巡覧記 | 日本三國 | 大阪・石川・福井・愛媛（共 20 章） | 大阪 2026-04-28〜12-31；其他三地 5〜6 月起〜12-31（部分「予定」） | https://www.nipponsangoku.com/news/detail.html?id=296 | ❌ |

## アニメ聖地88（アニメツーリズム協会）

- App 現況：`libs/services/pilgrimage/anime-tourism-88.data.json` 是 **2025 年版**（`year: 2025`，124 筆，生成於 2026-05-13）。`migration.ts` 把它轉成 `areaDestinations`，**不是活動**，所以不會出現在集章清單。
- **2026 年版**已在 2026-02-13 公布：作品聖地 146 筆＋設施 29 筆（共 175 筆），有效到 2026 年 12 月。
  來源：https://animetourism88.com/topic/『訪れてみたい日本のアニメ聖地-88』2026年版-選定について/ ；「2026年版の聖地選定は、2026年12月まで」見 https://manganime-niigata.jp/news/6559/
- 2026 年版新增的條目，例如：ざつ旅（青森、岩手、宮城、福島、栃木、東京、新潟、富山、三重、和歌山、島根、廣島、香川，共 13 處）、mono（山梨縣央）、日々は過ぎれど飯うまし（八王子）、千歳くんはラムネ瓶のなか（福井）、Summer Pockets（男木島・女木島）、ウマ娘 シンデレラグレイ（笠松）、MFゴースト（小田原）、四月は君の嘘（練馬）等。
- 2027 年版：投票已在 2026-09-20 截止，依往年慣例會在 2027 年 2 月公布（推測，尚未公告）。
- 跟集章有關的有兩種：
  1. **88 御朱印（實體章）**：協會發給認定地點的「ご朱印スタンプ」，放在各地觀光案內所、市公所等（例：宇部市公所、白川村、呉市觀光案內所）。常設，但**不是每個聖地都有**，放置地點要逐筆查。
  2. **JAL「あなたのアニメ聖地巡礼」**（見上表）：以 88 為主題的數位章，2026-04-01〜2027-03-31。
- 建議：88 本身不適合當「一個集章活動」，比較適合 (a) 把資料升級到 2026 年版地點資料；(b) 有御朱印放置點的地點才標上「可蓋章」。

## 短期（現正進行或即將開始）

| 活動 | 作品 | 地區 | 期間 | 來源 | 驗證 |
|---|---|---|---|---|---|
| 京スマ×【推しの子】デジタルスタンプラリー | 我推的孩子 | 京都市（太秦、桂・松尾、修學院、御所・下鴨） | 2026-11-02〜12-14 | https://newscast.jp/smart/news/1984240 | 已讀全文 |
| 中野×杉並×豊島デジタルdeスタンプラリー | 多作品（動畫・漫畫地點 9 處） | 東京中野・杉並・豐島 | 2026-11-01〜2027-01-11 | https://www.city.tokyo-nakano.lg.jp/kanko/city-promotion/stamp.html | 已讀全文（9 處地址齊） |
| 「逃げ上手の若君」諏訪めぐり 第2弾 | 逃走上手的若君 | 長野諏訪（含諏訪大社） | 2026-11-06〜12-20 | https://www.edith.co.jp/lp/nigewaka.run-suwa2/ | ⚠️ 只看到搜尋摘要，頁面 403 |
| 文豪ストレイドッグス ヨコハマ降誕祭2026 | 文豪野犬 | 橫濱 6 處 | 2026-11-14〜12-25 | https://event.sukiplus.com/bungo-yokohama2026 | 已讀全文（6 處名稱齊） |

## 最近結束（可當 annual 候選，不該當進行中）

| 活動 | 期間 | 來源 |
|---|---|---|
| TVアニメ mono 聖地巡礼スタンプラリー（山梨・長野） | 2026-04-11〜11-03 | https://x.com/mono_stamprally |
| TOKYOアニメツーリズム2026（鬼滅の刃） | 2026-01-24〜03-15（東京都每年辦） | https://www.metro.tokyo.lg.jp/information/press/2026/01/2026011520 |
| スノウボールアース×小田急 三島 | 2026-05-11〜07-12 | https://www.emot.jp/campaign/snowballearth2026/ |
| 氷の城壁×小田急 江の島・鎌倉 | 2026-04-27〜07-12 | https://www.emot.jp/campaign/korinojoheki2026/ |

## 待決定

1. 是否把上表「❌」的加進 `build-stamp-rallies.ts`（每處要地址 → 跑 geocode audit）。
2. 結構問題：短期活動壽命 1〜2 個月，跟發版節奏對不上。要讓 `loadLatest()` 從遠端（atlas-api / R2，同 id-mappings 那條）拉活動，否則清單永遠會偏少。
3. anime-tourism-88 資料要從 2025 年版（124 筆）升級到 2026 年版（175 筆）；2027 年 2 月又要再換一次。
4. 已結束的 `yohane-*`（2023）可刪；`jujutsu-*` 是 annual 但從沒有 confirmed 日期，要查今年有沒有辦。

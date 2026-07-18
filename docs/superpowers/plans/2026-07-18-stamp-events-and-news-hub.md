# Stamp rallies + more events + news hub tabs

**Date**: 2026-07-18 · Branch `feat/motion-unification`
**Goal**: many more real pilgrimage events (esp. 蓋章/stamp rallies with spot
locations), unified with news under one tabbed hub. Feature parity + rule 8.

## Grilled decisions (locked 2026-07-18)

1. **Stamp coordinate sourcing**: build a REAL curated dataset from the official
   stamp sites (spot name + full address + provenance), coords via geocoding the
   real address. NEVER fabricate a coordinate (rule 8).
2. **"tag" tab** = filter by anime/work (ゆるキャン / LL / ガルパン …).
3. **Stamp detail UX** = in-app map with all stamp pins + "open in Google Maps"
   per point.

## Architecture (already supports this — no schema rewrite)

`libs/services/pilgrimage/local-intel/types.ts` already has:
- `EventCategory = 'stamp_rally' | 'festival' | 'collab_cafe' | 'exhibition' | 'other'`
- `LocalIntelEvent`: `bangumiIds`, `name`/`description` (LocalizedText),
  `geo:[lat,lng]|null`, `spotRefs?: SpotRef[]`, `category`, `schedule`.
- `IntelProvenance` (REQUIRED on every entry): `sourceUrl`, `officialUrl?`,
  `verifiedAt` — the schema itself enforces rule 8.
- Data file: `libs/services/pilgrimage/local-intel/local-intel.data.json`
  (currently only **14 entries**, 1 stamp_rally — that's the "太少").
- `getHubRailEvents(now, horizonDays)` in `local-intel-repository.ts` surfaces
  events for the rail.

**Gap for stamp rallies**: a single `LocalIntelEvent` has ONE geo/spotRefs set,
but a stamp rally has MANY stamp points. Need a per-event `stampSpots?` array of
`{ name: LocalizedText; address: string; geo: [lat,lng] | null; sourceUrl }`
(rule-8 provenance per spot). Add to the `LocalIntelEvent` type + a spec/test.

## Rule-8 data rules (binding for the data build)

- Every spot's `name` + `address` copied verbatim from the official site;
  `sourceUrl` = that page; `verifiedAt` = build date.
- `geo` ONLY from geocoding the real address (a real geocoder, e.g. Nominatim).
  If geocoding is ambiguous/fails → `geo: null`, keep the address. The spot still
  appears in the list with a navigate link; it just gets NO map pin.
- "Open in Google Maps" = `https://www.google.com/maps/search/?api=1&query=<address>`
  — works from the real address, needs no stored coordinate.
- Never invent a spot, coordinate, date, or count. Unconfirmed annual dates →
  `schedule.kind:'annual'` unconfirmed (the existing state machine renders
  `unannounced`, never an invented date).

## Confirmed real sources (spike done 2026-07-18)

- **ゆるキャン△**: yurumeguristamp.com/spot/ — 26 stamp spots WITH full JP
  addresses + character. Verified fetchable.
- **ガールズ&パンツァー / 大洗**: oarai-info.jp — 8-spot stamp rally
  (大洗シーサイドステーション, ガルパンギャラリー, マリンタワー, アクアワールド大洗,
  大洗磯前神社, 大洗駅 …). Named landmarks, geocodable.
- **LL Sunshine!! / 沼津**: llsunshine-numazu.jp — to fetch.
- **anime88 stamps**: animetourism88.com/en — 88 official spots; the app already
  has the anitabi index + Tourism88Rail. Cross-link, don't duplicate.

## Phases

### Phase A — News hub tabs (self-contained UI, no data dependency) — Codex
Turn `app/(tabs)/pilgrimage/news/index.tsx` into a tabbed hub with a segmented
control (reuse `components/rate/ModeSelector`, the house segmented pill):
- **活動 (event)**: list from `getHubRailEvents(new Date())` (already sync).
- **標籤 (tag)**: filter events + news by anime/work (from bangumiIds).
- **新聞 (news)**: the existing RSS stream.
Keep rule 10 (sync first paint), rule 11 (t() — add `news.tabs.*` keys en-first).
No data-layer changes; the event tab reads existing local-intel.

### Phase B — Stamp/event DATA build (rule-8 critical) — Claude leads
1. Extend `LocalIntelEvent` with `stampSpots?` (+ type test).
2. Gather spots from the confirmed sources (Yurucamp 26, GuP 8, LL Sunshine,
   anime88 subset, + more anime with documented rallies).
3. Geocode real addresses → coords (null on failure). Verify a sample.
4. Append entries to `local-intel.data.json` with full provenance.

### Phase C — Stamp detail UI — after Phase B
Tap a stamp event → screen/sheet with an in-app map (pins for spots with geo)
+ a spot list (name + address + "open in Google Maps" per point). Reuse the
existing map surface + SpotImage patterns.

**Stamp points MUST be visually distinguished from regular Anitabi scene spots**
(decided 2026-07-18). Stamp-collection points and scene-pilgrimage points are
different KINDS of location; when they appear on the same map (anime detail /
stamp detail), the stamp pins get a distinct marker — a stamp/checkmark-style
icon + a different accent color from the scene-spot pins — so the user can tell
"collect a stamp here" apart from "a scene was set here" at a glance. Keep it a
LIGHT separation within one map (a distinct marker style + a small legend or an
optional layer toggle), NOT a wholly separate screen. On the anime detail map,
stamp points are an additive overlay layer on top of the existing scene spots,
not a replacement.

## Phase B addendum — anime88 + more rallies (aligned 2026-07-18)

- **anime88**: the app already has `anime-tourism-88.data.json` (124 entries,
  work + prefecture/city + external ids, NO exact coords) surfaced only via
  `Tourism88Rail`. Surface these in the consolidated hub too (as an "88 official
  pilgrimage" category), each linking to the anime detail; navigate-by-city, NO
  fake pins (rule 8). Claude researches the 88 official stamp-passport exact
  coordinates in the background and adds pins progressively as verified.
- **More rallies**: Claude web-researches additional real, documented anime
  stamp rallies + spots/coords (Codex shell DNS is blocked — see
  [[codex-implements-claude-reviews]]); Codex integrates the supplied dataset.
- Data-supply → Codex-integration split; integration sequenced AFTER Phase A.

### anime88 image bug (diagnosed 2026-07-18) — Codex fixes
Root cause: `Tourism88Rail` loads posters from `bangumiSubjectImageUrl(id)` =
`https://api.bgm.tv/v0/subjects/{id}/image?type=large`, which is a **302 redirect
to `lain.bgm.tv`** through the **rate-limited Bangumi API**. Under the rail's
burst load, some redirects 429/fail → intermittent blank posters ("偶爾不出現"),
and the raw `expo-image` has no `onError` fallback (silent blank).
Fix (Codex): (1) add a `posterUrl` field to `anime-tourism-88.data.json` with the
DIRECT `lain.bgm.tv` CDN url — Claude has resolved all 88 (job tmp
`anime88-poster-urls.json`, 88/88 ok) — and load that instead of the API redirect;
(2) add an `onError` fallback (themed placeholder / one retry, never a silent
blank — rule 8 error state). Apply the same direct-CDN pattern anywhere else that
feeds `bangumiSubjectImageUrl` into many concurrent images.

## Phase D — Backend-ready data architecture (Codex builds; Claude reviews)

Aligned 2026-07-18. Reorganize the event+stamp+news data into a clean,
migration-ready architecture so a later move to a backend/`Aniseekr-source`
release is a source swap, not a rewrite. **anitabi scene-spot index is NOT
touched** (it has its own pipeline).

Requirements (locked):
- **Backend-API shape**: normalized entities with **stable ids** and a top-level
  **`schemaVersion`**. Events, stampRallies, stampSpots, newsSources as distinct
  entity collections, referenced by id (not deeply nested duplication).
- **Loader boundary**: a single loader/repository module that today reads the
  bundled JSON but can later swap to a remote source **without any UI change** —
  the app imports from the loader, never from the raw JSON.
- **Provenance preserved** on every entity (sourceUrl/verifiedAt — rule 8).
- Migrate the current `local-intel.data.json` events/stamps + `news-sources.data.json`
  into the new shape; keep all existing readers (IntelEventsRail,
  getHubRailEvents, news stream, the new news hub tabs) working by pointing them
  at the loader. No behavior change, no data loss (11 originals + 7 rallies +
  201 stamp spots must all survive).
- Add a schema/round-trip unit test + keep spec:check green.

Sequencing: do Phase D AFTER Phase A (news tabs) lands and is reviewed — both
touch the news screen + data readers, so running them together conflicts.

## Phase A addendum — screen title

Rename the news hub's screen/title from "News" to **聖地資訊** (Pilgrimage Info):
the screen is now Events + Tags + News, not just news. Add/adjust the i18n key
(en first: e.g. `news.hubTitle` = "Pilgrimage Info"; zh-Hant = "聖地資訊"); update
the Stack title + any header. Fold into the Phase A review pass.

## Verify gate (unchanged)
typecheck + test:unit + spec:check + scoped eslint/prettier on changed files.
Repo-wide `bun run lint` is broken (887 pre-existing) — do not use it.
Device smoke test is the real gate for the UI + real coords on the map.

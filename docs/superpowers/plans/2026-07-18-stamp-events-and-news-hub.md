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

## Verify gate (unchanged)
typecheck + test:unit + spec:check + scoped eslint/prettier on changed files.
Repo-wide `bun run lint` is broken (887 pre-existing) — do not use it.
Device smoke test is the real gate for the UI + real coords on the map.

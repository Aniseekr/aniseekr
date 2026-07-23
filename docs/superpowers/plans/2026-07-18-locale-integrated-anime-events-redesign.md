# Locale-integrated anime events — re-design spec

**Date**: 2026-07-18 · Branch `feat/motion-unification` · Codex builds, Claude
reviews ([[codex-implements-claude-reviews]]). Supersedes the UI/model ambition
of `2026-07-18-stamp-events-and-news-hub.md` (its real geocoded stamp DATA stays
— 7 rallies / 201 spots, commit 301fe38 — this deepens the model + surfaces).

## First principle

**Make anime events deeply integrated with the locale (在地).** The original
"spot" only meant an anime SCENE location. The depth is the locale mechanisms
tied to anime — **stamp rallies, collab/merch shops, festivals** — which must
become first-class geo spots. Map, list, calendar, and collection all read one
spot source, and the whole thing carries an **anime aesthetic** (the app
currently has none).

## Locked decisions (grilled 2026-07-18)

1. **Unified typed Spot model** — one geo entity for all:
   `Spot { id, type: 'scene'|'stamp'|'shop'|'festival', geo, animeIds[], name,
source(provenance), ...typeSpecific }`. Map / list / calendar / collection
   read this one source. Scene spots keep coming from the anitabi index but are
   projected into this shape; stamp/shop/festival come from the curated event
   data. This is the Phase-D backend-ready architecture (normalized, stable ids,
   schemaVersion, loader swappable bundled↔remote).
2. **Event UI = integrated vertical list + map, NOT a horizontal-scroll rail.**
   Retire the `IntelEventsRail` horizontal rail for the hub's events surface;
   events become an integrated list that fits the screen, with the map showing
   stamp/shop/festival pins **visually distinct** from scene pins (per the Phase
   C decision — distinct marker + light layer, additive overlay, one map).
3. **Real anime-styled Calendar** — a new **【日曆】tab** in the 聖地資訊 hub
   (alongside 活動/標籤/新聞). Month grid; days with events are marked/"circled"
   by the anime; tap a day → that day's events. Uses the unified Spot/event
   date windows.
4. **Anime aesthetic = clean Japanese + accents** (NOT garish): rounded cards,
   seasonal accent colors, character mini-stamps, washi-tape / mounting-frame
   motifs, soft gradients. Load `.claude/skills/ui-polish` — Codex designs with
   it. Keep theme-correctness (rules 1–5); accents are additive, theme-driven.
5. **Attribution (was missing)** — event/stamp/festival/news data must SHOW a
   source/copyright credit in the UI even though it opens via browser redirect.
   Reuse the `AnitabiAttributionFooter` / `AnitabiOriginCredit` pattern; every
   Spot carries provenance (sourceUrl/verifiedAt) and the surfaces display it.
6. **Data: more sources, JP-first** — deeper merge of LL / Yuru Camp / Girls und
   Panzer / anime88, PLUS more real anime events (not only stamps — collab
   cafes/shops, festivals, exhibitions). Source text may stay **Japanese only**
   (no need to translate everything); still real + provenanced (rule 8).
   Claude supplies web-fetched + geocoded data (Codex shell DNS is blocked).

## Surfaces

- **聖地資訊 hub tabs**: 活動 (integrated event list) / 標籤 (by-anime filter) /
  日曆 (month calendar) / 新聞 (RSS). All theme + anime-accented.
- **Map**: unified spots; type-distinct markers (scene vs stamp vs shop vs
  festival); tap a stamp/festival → detail with all its points + "open in Google
  Maps" per point.
- **Anime detail**: the anime's spots across all types (scenes + its stamps +
  collab shops + festivals) — the locale story for that work, in one place.
- **Collection**: visited/collected state extends to stamp points (collect
  progress per rally).

## Phasing (finalize after the gap-review lands)

- **P0 (now)**: finish anime88 poster image fix (in flight).
- **P1 Data model + loader (Phase D)**: unified `Spot` schema + normalized data +
  swappable loader; migrate existing events/stamps + project anitabi scenes;
  attribution carried through. Keep all readers green.
- **P2 Event list + map integration**: retire the rail → integrated list;
  type-distinct map markers; attribution footer.
- **P3 Calendar tab**: anime-styled month calendar over the unified event dates.
- **P4 Data expansion**: Claude researches + geocodes more JP anime events
  (stamps + shops + festivals + anime88 exact coords); Codex integrates.
- **P5 Anime-aesthetic polish pass** across the hub (ui-polish skill).

### Build progress (uncommitted chain)

- **P1a complete:** canonical Place / PlaceRole / Event schema and repository
  interfaces.
- **P1b implemented:** deterministic migration + validation + bundled loader +
  swappable repository + Anitabi scene projection + compatibility-reader
  cutover. Conservation result: 203 Places / 209 bundled roles / 9 events / 124
  area destinations / 1 guide / 17 news sources; all 201 stamp memberships
  survive. `gamers-numazu` is one Place with four roles and four source credits.
- **Next:** P2. Per user direction, do not commit or run the batch code review
  between phases; review once after P5.

## Review gates (must verify before batch commit — user-reported)

- **Stamp landmarks MUST render distinctly on the map** (user observed they
  don't). Wiring exists end-to-end: `migration.ts` (stampSpots→Place geo +
  stamp_stop role) → `locality/map-markers.ts` `buildCanonicalLocalityMarkers`
  (kind: stamp/shop/festival) → `map.tsx` merges into `markers` → `MapSurface` →
  `NativeMapMarker` distinct visuals. Verify on device that: (a) migrated stamp
  places actually carry geo (not filtered by `if(!place.geo)`), (b) the stamp
  markers are visually DISTINCT from scene pins, (c) they appear on BOTH the hub
  map and the anime-detail map. If P5's marker polish doesn't deliver this,
  Codex gets a targeted follow-up (do NOT run it concurrently with P5 — same
  files).

## Constraints

- CLAUDE.md rules 1–11 binding (esp. rule 8 real data + provenance, rule 10
  sync first paint, rule 11 i18n — JP-only source text is data, not UI chrome).
- Codex implements; Claude aligns + supplies network data + reviews. Verify gate:
  typecheck + test:unit + spec:check + scoped eslint/prettier (repo-wide lint is
  broken — 887 pre-existing). Device smoke test is the real gate for UI.
- Sequence to avoid working-tree conflicts (data-model, list, calendar, hub all
  overlap) — one phase lands + reviewed before the next.

## Gap-review findings → phase mapping (Codex review, 2026-07-18)

**Reframing insight (Critical):** the 201 committed stamp stops are DEAD DATA —
no production reader (`stampSpots` read nowhere; event taps open generic anime
detail `news/index.tsx:133`; `SpotMapView` only accepts `AnitabiPoint[]`). And
the same place duplicates across roles (Gamers Numazu = shop `data.json:134` AND
stamp stop `:300`, divergent coords). So the model AND a surface are both needed.

Mapping:

- **P1 (canonical model + loader)** ← findings 1, 3, 9. A canonical **Place**
  identity (stable id, geo, provenance) that accumulates typed **roles**
  (scene / stamp-stop / shop / festival-venue) and anime links, above the
  Anitabi + local-intel ingestion. Events/campaigns become first-class entities
  with stable ids + occurrence date windows; `schemaVersion`; swappable loader.
  Dedupe co-located places (Gamers Numazu).
- **P2 (event detail + list + map)** ← findings 2, 5, 6, 8. First-class
  **event/campaign detail route** (stop list + map layer + per-stop "open in
  Google Maps" + collected progress). Retire the horizontal rail → occurrence/
  range-queried vertical list with date/venue/anime/stop-count/status. Map
  markers type-distinct (scene vs stamp vs shop vs festival). **Anime88: city-
  only records render as labelled AREAS/city destinations, NOT precise pins**
  (rule 8 — centroids must not read as official visitable points); promote to a
  pin only with a verified exact coord.
- **P2 (attribution)** ← finding 7. Show source identity + link + verifiedAt +
  license beside every event/stop/program/article (extend `IntelProvenanceLine`
  / `AnitabiAttributionFooter` beyond Anitabi-only).
- **P3 (calendar)** ← finding 4. Month calendar sharing date/anime/category/
  selection state with the list + map (one event surface, three modes).
- **P4 (data)** ← findings 8, 11. More JP events; per-stop anime ties; resolve
  shops by explicit anime↔place relation first, proximity only as labelled
  secondary (finding 11 — proximity-only can show a wrong-anime shop).
- **Cross-cutting** ← findings 10, 12. News↔anime/event/place relations (tag
  cross-link); fix rule-10 (news stream must start only on the News tab, not
  before tab selection) + rule-11 (hardcoded 常設/Always/未定/TBA in
  `event-date-block.ts:10`; zhHant-ignoring source names) — centralize
  locale-aware formatting.

Screen rename: the hub is still `NewsStreamScreen` with News-title/source-mgmt
(finding 9) — becomes the 聖地資訊 locality hub (ties to the earlier 聖地資訊
title rename).

## Pending inputs

- Claude data research for P4 (more JP events + anime88 exact coords).

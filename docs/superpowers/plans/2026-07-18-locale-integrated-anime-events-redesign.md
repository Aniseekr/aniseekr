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

## Constraints

- CLAUDE.md rules 1–11 binding (esp. rule 8 real data + provenance, rule 10
  sync first paint, rule 11 i18n — JP-only source text is data, not UI chrome).
- Codex implements; Claude aligns + supplies network data + reviews. Verify gate:
  typecheck + test:unit + spec:check + scoped eslint/prettier (repo-wide lint is
  broken — 887 pre-existing). Device smoke test is the real gate for UI.
- Sequence to avoid working-tree conflicts (data-model, list, calendar, hub all
  overlap) — one phase lands + reviewed before the next.

## Pending inputs
- Codex gap-review (running) — fold its ranked findings into P1–P5.
- Claude data research for P4 (more JP events + anime88 coords).

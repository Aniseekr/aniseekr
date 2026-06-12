# Title localization data core — fix the empty Bangumi/Shikimori mapping and ship offline `name_cn`

**Date:** 2026-06-12
**Status:** Approved direction (offline `name_cn` + runtime fallback), pending spec review
**Repos touched:** `aniseekr` (this repo) + `Aniseekr-source` (mapping-data CI)

## Problem

Switching the app language to Chinese leaves every anime title in its original
language. Verified on the dev simulator (`aniseekr.db` / `aniseekr_cache.db`):

- `id_mappings` import succeeded: 68,704 rows (2026-06-09).
- `bangumi_id` populated: **0 / 68,704**. `shikimori_id`: **0 / 68,704**.
- All 16 `title_loc_*` cache entries are `{"v":null}` (7-day negative cache),
  including AniList 5114 (FMA: Brotherhood) and 11061 (Hunter × Hunter) —
  titles that certainly have Bangumi `name_cn`.
- Negative entries were written ~17h **after** the import finished, ruling out
  the empty-table race as the trigger (it remains a latent bug, fixed below).

## Root cause

`Aniseekr-source/scripts/build-id-mapping-source.ts` expects to extract
`bangumi.tv/subject/<id>` and `shikimori.one/animes/<id>` URLs from
manami-project's `sources[]`. **Manami has never listed Bangumi or Shikimori
as source sites**, and Fribb's list doesn't carry either ID. Both regexes have
matched zero entries since day one (the coverage report printed 0% but nothing
gated on it). Client-side `TitleLocalizationService` therefore always gets
`mapID → null` and negative-caches "no localized title" for every anime.

Unit tests inject fake `idMapping` deps, so the data-layer break was invisible
to the test suite.

## Goals

1. Chinese titles resolve offline for the vast majority of the catalog.
2. Russian titles resolve via Shikimori (Shikimori IDs ≡ MAL IDs).
3. Poisoned negative caches self-heal on data refresh; the empty-table race
   can never poison again.
4. CI fails loudly if Bangumi coverage regresses to ~zero again.

## Non-goals (follow-up spec: "Phase C")

- Wiring `useAnimeDisplayTitle` into the Bangumi tab, pilgrimage, collection
  stats (coverage rollout).
- Consolidating pilgrimage's parallel `titleCn` path.
- Additional title sources (AniList synonyms, Kitsu locale titles).
- Machine-translating titles (forbidden by CLAUDE.md Rule 11).

## Design

### B1. Aniseekr-source: join Bangumi Archive into the merged mapping

`build-id-mapping-source.ts` gains a third source: the weekly
[bangumi/Archive](https://github.com/bangumi/Archive) dump
(`subject.jsonlines`; anime = `type === 2`; fields used: `id`, `name`
(native Japanese), `name_cn`, `date`, `platform`).

Matching (offline, in CI):

1. Index Bangumi subjects by `normalize(name)`.
2. For each manami entry, look up `normalize(title)` and each
   `normalize(synonyms[i])`. Manami minified retains `synonyms` and
   `animeSeason` — extend the `ManamiEntry` type.
3. Disambiguate multiple candidates by air year (±1) and type
   (TV/movie/OVA). No unique candidate → no match (never guess).
4. Port the normalization from this repo's proven
   `libs/services/pilgrimage/bangumi-title-match.ts` (native-title matching
   against Bangumi `name` is its documented strength).

Merged rows gain two optional fields: `bangumi_id` (number) and `name_cn`
(string, omitted when Bangumi has none). Estimated size cost ≲ 1 MB minified.

Coverage gate: after `reportCoverage`, **fail the build** if
`bangumi_id` coverage < 20% of rows that have an `anilist_id`, or if
`name_cn` coverage < 15%. (First real run calibrates exact floors; the gate's
job is to catch a silent return to 0%.)

`shikimori_id` stays absent from the data — it's an alias, handled client-side.

### A1. Client: Shikimori ≡ MAL alias

`IDMappingService.mapID(..., to: 'shikimori')`: when the `shikimori_id`
column is empty, fall back to `mal_id` for the same row (Shikimori reuses MAL
numeric IDs). Same fallback in `mapAllPlatforms`. Russian titles immediately
work for the 46,863 rows with `mal_id`, no data change needed.

### A2 + B2. Client: local `name_cn` first, network second

- `libs/db.ts`: append `ALTER TABLE id_mappings ADD COLUMN name_cn TEXT` to
  the existing migrations array (`libs/db.ts:98` pattern).
- `IDMappingService`: `bulkInsert` writes `name_cn`; new
  `getNameCn(platform, id): Promise<string | null>` (single SELECT).
- `TitleLocalizationService.ensure('chinese', …)` resolution order becomes:
  1. persisted cache → 2. **local `id_mappings.name_cn`** → 3. Bangumi API via
  `bangumi_id` (dump-missing new seasonals) → 4. negative cache.
  OpenCC hans→hant conversion stays where it is (`titleForLanguage`).

### A3. Client: negative-cache hygiene

- **Key version bump:** `title_loc_` → `title_loc_v2_` — instantly orphans all
  existing poisoned entries (they age out via TTL/prune).
- **Readiness guard:** if `idMappingService.getLastUpdateTime()` is `null`
  (no successful import ever), `ensure()` treats a `mapID` miss as a transient
  failure (5-min backoff), **never** a 7-day MISS. Closes the empty-table race.
- **Flush negatives on import:** after a successful `updateMappings()` bulk
  insert, delete `title_loc_v2_*` entries whose value is `{"v":null}` (scan
  keys by prefix, check value shape; runs at most once per 14-day refresh).
  Positive entries are kept.
- **Force one refetch on upgrade:** the `name_cn` migration resets
  `id_mappings_meta.lastUpdatedAt` so upgraded installs re-download the
  enriched JSON instead of waiting out the 14-day freshness window.

### Rollout order

1. Land + run B1 in Aniseekr-source; publish enriched
   `anime-id-mappings-merged.json` under the same stable tag.
2. Land A1–A3 + B2 in this repo (client tolerates missing `name_cn` keys, so
   the data may ship first safely; the reverse order would leave Chinese
   still-broken clients).

## Error handling

- Archive dump unreachable in CI → build fails, previous release asset stays
  live (workflow only replaces on success).
- Ambiguous title match → skip (no `bangumi_id`), per CLAUDE.md Rule 8:
  never guess.
- `name_cn` absent locally + Bangumi API fails → existing 5-min backoff;
  negative cache only after a **confirmed** "Bangumi has no name_cn".

## Testing

This repo (`bun run test:unit`):
- `mapID` shikimori→mal fallback (hit, miss, explicit shikimori_id wins).
- `ensure()` readiness guard: no MISS write when `getLastUpdateTime()` null.
- Chinese path short-circuits on local `name_cn` (no fetcher call).
- Negative flush after import keeps positives, drops `{"v":null}`.
- Existing `title-localization-service.test.ts` updated for the v2 prefix.

Aniseekr-source:
- Matcher unit tests on fixtures (exact match, year disambiguation, ambiguous
  → skip, name_cn empty → omitted).
- Coverage gate test (synthetic 0%-bangumi input fails the build).

## Open follow-ups (Phase C, separate spec)

Coverage rollout to Bangumi tab / pilgrimage / stats screens; pilgrimage
titleCn consolidation; multi-source title aggregation; production-user
migration for the legacy english-first stored order (`@aniseekr/title-language-priority`)
written by pre-545101e screens.

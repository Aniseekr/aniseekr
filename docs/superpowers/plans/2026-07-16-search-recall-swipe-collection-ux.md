# 2026-07-16 — Search recall + Bangumi swipe semantics + Collection/Search UX

Grilled and approved 2026-07-16. This doc records the resolved decisions; execution order is §4.

## 1. Diagnosis (code-verified)

### "找不到動漫" (top pain) — two distinct bugs, user confirmed the RECALL one dominates

- **Recall/ranking (primary, user's "mono" case):** `libs/clients/anilist-client.ts:449`
  hardcodes `sort: [POPULARITY_DESC]` and search fetches only page 1 (20 items). Exact
  matches get buried below unrelated-but-popular partial matches. **Live-API verified:**
  `mono` ranks #6 under POPULARITY_DESC (below Fullmetal Alchemist Movie, Hyouka special,
  Naruto movie — all matching only via 「者/もの」 in native titles); ranks **#1** under
  `SEARCH_MATCH`. Client-side default sort is `'relevance'` (`app/search.tsx:128`) which
  passes API order through untouched (`:407-412`), so the fix flows end-to-end.
- **Title-flip "drift" (secondary):** results render English/romaji first
  (`mapAniListToAnime` never seeds a Chinese title, `anime-repository.ts:1190`), then
  `useAnimeDisplayTitle` enriches per-row 3-at-a-time via Bangumi; every landed title fires
  a **global** `titleLocalizationService.emit()` re-running every visible row (with OpenCC
  on the hot path). List visibly flips/reflows over seconds. Rows with no Bangumi mapping
  stay English forever → typed Chinese, see English, don't recognize it.
- **Query is NOT locale-polluted.** AniList GraphQL takes only `search/page/isAdult`.
  S↔T variant expansion is additive-only. Dedupe is by id. Ruled out.

### Bangumi tab swipe

`BangumiCardDeck.tsx` maps left=remind / right=plan — two filing actions split across a
gesture axis nobody has muscle memory for. Calendar mode's carousel swipe means something
else entirely on the same tab.

### Collection empty states

- Empty folder detail: `app/(tabs)/collection/[id].tsx` `styles.emptyState`
  `paddingTop: 80` + 48px icon (`:838-843`, `:651`) — the "佔太多空間" complaint.
- Zero folders: `index.tsx` `paddingVertical: 40` (`:803`); zero recents: `32` (`:809`).
- **Error state == empty state:** both screens only `console.error` on load failure
  (`[id].tsx:241`); an errored load is indistinguishable from a genuinely empty folder.

### Pilgrimage search recall (user flagged the map page too)

- `pilgrimage-search-service.ts:80` gates the Bangumi fallback on `local.length === 0` —
  any weak local hit (city-substring, base 30) suppresses the broader search.
- `FALLBACK_CANDIDATE_LIMIT = 10` (`:54`).
- `map.tsx:419-439` in-page search is substring-over-loaded-markers only.
- Hard ceiling (accepted, not fixable here): results must have Anitabi spot data.

### Search screen UX (found during investigation, user approved fixing)

- Layout jumps when the first char is typed (filter chips / sort header mount late,
  `search.tsx:488-519`).
- Re-query with stale results shows only a tiny footer spinner (`:657-663`) — feels stale.
- Empty/no-results states hug the top (EmptyStateView has no flex/minHeight).
- Bottom toast can sit under the keyboard.

## 2. Resolved decisions (grilled)

1. **Swipe semantics (user-decided):** new-season triage is binary. Right = 想看
   (add to list **and** enable episode notifications — notify is a consequence, not a
   separate action; bell button removed). Left = 不想看 (skip this season,
   **persisted** — otherwise triage never converges; restorable in settings; undo
   snackbar for mis-swipes). Tap = detail. This is a rewire: `onSwipePlan` +
   `onSwipeRemind` side effects both exist (`bangumi.tsx:803-807`).
2. **Recall fix is Phase 1 only:** (a) `SEARCH_MATCH` sort one-liner; (b) parallel
   `BangumiClient.searchSubjects` for CJK queries → map subject ids → AniList ids via
   `idMappingService.mapID` / `lookupByBangumiId` → surface those AniList items and seed
   `name_cn` onto results (also kills title-flip drift for those rows).
   **No Bangumi-only rows yet:** detail route is AniList-hardwired
   (`anime/[id].tsx:218`, secondary media hardcodes `'anilist'`); a Bangumi-only id would
   open the WRONG anime (id-space collision). Phase 2 (source param through nav +
   `repo.fetchAnimeDetail(id, source)`) is deferred — user's pain ("mono") is not
   Bangumi-only.
   - Trap noted: `BangumiDataSource.searchAnime` delegates to AniList (BGM-006) — it
     cannot fix recall. Use `BangumiClient.searchSubjects` directly.
3. **Pilgrimage:** remove the empty-local gate, always union + dedupe by Bangumi id;
   raise fallback candidate limit; map in-page search falls back to
   `pilgrimageSearchService.search` when the local filter is empty.
4. **Collection:** slim paddings, keep states honest — add a distinct error state
   (rule 8: error ≠ empty).

## 3. Spec mapping

`libs/repositories/` and `libs/services/pilgrimage/` changes are spec-mapped
(docs/spec/agent.md): new case_ids in `test_cases.csv`, failing test first, then
implement, then `test_traceability.csv` → covered. `bun run spec:check` must pass.
`anilist-client.ts` (clients layer) is not spec-gated but existing pinned tests updated.

## 4. Execution order

| # | Item | Size | Spec-mapped |
|---|------|------|-------------|
| 1 | AniList search sort → `SEARCH_MATCH` | S | no (client layer) |
| 2 | Collection empty-state slimming + error state | S | no (UI) |
| 3 | Bangumi swipe rewire (想看/不想看 + persistence + undo) | M | no (UI + prefs) |
| 4 | Bangumi CN-title merge into global search | M | yes (REPO-*) |
| 5 | Pilgrimage recall (gate removal + map fallback) | S/M | yes (PILG-*) |
| 6 | Search screen UX polish | M | no (UI) |

Phase 2 (Bangumi-only results + source-aware detail route) intentionally deferred.

## 5. Post-implementation review outcome (two-axis, 2026-07-16)

Fixed after review:

- **Want-swipe undo made lossless** — an already-tracked show keeps its status
  (no watching→planned clobber); undo only removes tracking/reminders that THIS
  swipe created (`getStatus` prior-state check + `isAnimeScheduled` guard).
- **Bangumi recall parallelized** — `searchBangumiSubjects(variants)` kicks off
  before the AniList await and searches every S↔T variant (Traditional queries
  no longer miss Bangumi's Simplified index).
- **Layering fixed** — repository no longer imports the pilgrimage cross-index;
  `idMappingService` alone resolves Bangumi→AniList ids.
- Collection main screen: recent-anime section also gets error ≠ empty.
- `FALLBACK_CANDIDATE_LIMIT` 10 → 15; `hapticsBridge` in map's search-all;
  `readableTextOn` on search filter chips; `IconSize.lg` token; `perPage` as a
  GraphQL variable; traceability row order.

User decisions after review (2026-07-16):

- Skip-restore now has BOTH surfaces: the deck empty state AND a
  "Restore N skipped" action row in `BangumiSettingsSheet` (shown only when
  the current season has skips).
- Skip-undo un-persists but does not resurface the card mid-run — confirmed
  sufficient by the user (matches the existing wishlist-undo pattern;
  resurfacing would remount the deck).

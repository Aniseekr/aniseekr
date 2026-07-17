# 2026-07-16 — Collection overhaul (management, IA, empty folders, search)

Grilled and approved 2026-07-16. User-ranked pains: (1) 整理/管理資料夾麻煩,
(2) 畫面元素太雜主次不分, (3) 找番難. Cold-open flash was NOT user-picked but
rides along (cheap, same code region).

## Diagnosis (audit-verified)

- **Folder management is beheaded**: `collectionService.deleteFolder`
  (`collection-service.ts:114`) has ZERO callers — folders can never be
  deleted. Edit is long-press-only with no affordance (`index.tsx:555`).
  No remove-anime-from-folder path inside collection (must detour to anime
  detail's AddToCollectionSheet). New folders are dead ends.
- **Main screen duplicates + noise**: Recent Anime grid (6) and Recently
  Viewed rail (10) are the same `user_anime ORDER BY updated_at DESC` rows
  back-to-back with конfliction see-all targets (`index.tsx:622-684`).
  CollectionTips has `hasUnrated: false` hardcoded → its best tip can never
  fire. Big overview card + stats button + tips push content down.
- **Search can't find what it shows**: both CollectionSearchModal
  (`:231 entry.title.toLowerCase().includes(q)`) and folder detail's
  `filterFolderItems` match only the STORED title string (usually
  English/romaji), while rows DISPLAY localized titles via AnimeTitleText.
  No S↔T normalization, no use of the seeded name_cn cache.
- **Empty system folders unbalance the grid** (user-raised): 5 system
  folders always render as tiles even at count 0; only `system_all` is
  hidden (`index.tsx:419`).
- Cold open: no skeleton/snapshot on index — returning users flash
  "No folders yet" + wrong CTA every open (`index.tsx:147-151`).
- Dead components (~886 lines): FolderList, RecentlyViewedSection,
  CollectionCapsuleFilter, CollectionModeToggle.
- Raw English: CollectionOverviewCard `OVERVIEW`/`total`, StatsOverview
  `'Browse anime'`, folder-detail status badge renders raw DB string.

## Resolved decisions (grilled)

1. **Management pattern = per-card「⋯」menu.** Folder tiles get a visible
   「⋯」→ action sheet (rename → existing edit modal; delete → confirm →
   `deleteFolder`). Custom folders only (system folders keep no ⋯).
   Long-press stays as shortcut. Folder-detail rows get a remove path
   (「移出資料夾」) — custom folders only; in system folders the action is
   status/favorite semantics already covered by the progress editor.
2. **Main screen IA = 精簡版**: header (title + search/share) → folders grid
   → ONE compact stats line (total · watching · 統計 ›, replaces overview
   card + stats button) → Recent Anime grid (6, see-all → system_all).
   DELETE: CollectionTips, CollectionRecentRail usage, CollectionOverviewCard
   usage. Components then dead → removed with the other dead files.
3. **Empty folders: hide empty SYSTEM folders by default**; custom folders
   always visible (a just-created folder must not vanish). Settings row
   「顯示空的系統資料夾」 toggle (MMKV pref) to opt back in.
4. **Search matches what the user sees**: both search surfaces match
   `normalizeTitleKey`-normalized stored title AND the localized title
   (`titleLocalizationService.getSync('chinese','anilist', id)` sync read).
5. **Scope**: core four + ride-alongs (cold-open fix via loaded-flag +
   skeleton + module snapshot; i18n raw strings; dead-component deletion).
   DEFERRED: share-mode extraction from screen root (rule 9 refactor, no UX
   change); in-folder "add anime" picker (new UI, next round).

## Execution order

| # | Item | Size |
|---|------|------|
| 1 | Empty-system-folder hiding + settings toggle | S |
| 2 | Main screen IA slim + compact stats row | M |
| 3 | Cold-open: loaded flag + skeleton + warm snapshot | S/M |
| 4 | 「⋯」management: tile menu, delete wiring, row remove | M |
| 5 | Search matching fix (modal + folder filter) | M |
| 6 | i18n ride-alongs + dead component deletion | S |

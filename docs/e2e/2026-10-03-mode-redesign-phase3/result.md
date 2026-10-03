# 2026-10-03 — Mode redesign Phase 3 (Collector screens) + leftovers

Device: iPhone 18 Pro simulator (iOS 27), dev client + Metro :8081, location Shimokitazawa, Collector mode, English UI.
Implementation: Codex (gpt-6.1-sol); review + E2E: Claude.

| Flow | Result | Evidence |
|---|---|---|
| 作品頁 deep link `focusSpotId` to row 63 (cold + warm) | sheet goes to top detent, row scrolled + expanded | detail-focus-deep-row.png |
| Then focus row 2 while list is scrolled | sheet re-scrolls to the row | detail-focus-near-row-after-scroll.png |
| 探索 home: season rail (air slot), weekly top 5 (no invented score), genre chips | OK | discover-home.png, discover-genres.png |
| Genre chip → swipe-rating deck | OK | discover-genre-deck.png |
| Pull to refresh keeps data visible | OK | — |
| 追番: week strip, Following/All segments, rows, season picker (full labels) | OK | schedule-*.png |
| Bell on untracked show → tracked as planned + reminder row in `scheduled_notifications` | OK (SQLite checked) | schedule-bell-follow.png |
| ⋯ → card deck (tab bar hidden, close button, 1/83) | OK | schedule-card-deck.png |
| Summer 2026 switch → 86 shows, Following 0 empty state | OK | — |
| Cold launch opens on Following without a season→tracking swap | OK | — |
| 收藏: status chips, default = first non-empty status, 3-col grid, empty states, My lists | OK | library-*.png |
| Library titles for English UI (saved title, not Russian/Chinese enrichment) | OK after resolver fix | library-want-titles-fixed.png |
| Status chip row scrolls horizontally | OK — see note | library-chips-scrolled.png |

Not verified: real-device camera, OS notification permission prompt on a fresh install (simulator had it granted), share-schedule / share-collection image export, undo snackbar action (tap landed after auto-dismiss).

Notes:
- The chip row "not scrolling" was the expo-dev-client floating gear: its drag area swallows horizontal pans in a band around it (dev builds only). Moving the gear fixes it.
- After most Fast Refresh reloads the app stops taking touches until relaunched (separate task suggested).
- Verify: `bun run typecheck` ✓, `bun run test:unit` 1759/1759 ✓, `bun run spec:check` 238/238 ✓, scoped eslint 0 errors (7 old warnings).

# Rate deck native ad — smooth restore (2026-11-04)

Device: iPhone 18 Pro simulator, Debug build (`__DEV__` → Google test native unit), Metro dev client.
Flow: open `aniseeker://rating` (seasonal deck) → swipe left repeatedly through ~12 photos.

| # | Case | Expected | Result | Evidence |
|---|------|----------|--------|----------|
| 1 | Background preload | Ad requested on rating mount, ready before it is due | PASS — `adReady: true` at currentIndex 0 (temporary log) | dev log |
| 2 | Just-in-time insert | One ad card inserted at index 12 when currentIndex reaches 8; next ad preloaded but **not** inserted early | PASS — `ads: 1`, next `adReady: true`, `at: null` at index 8–9 | dev log |
| 3 | No spinner card | Ad card behind the stack shows real ad content, never "Loading ad" | PASS | `01-ad-behind-stack-real-content.jpg` |
| 4 | Ad on top renders NativeAdView cleanly | AdMob validator: no implementation issues | PASS — "No implementation issues found" | `02-ad-top-validator-clean.jpg` |
| 5 | Dwell then user swipe, no auto fly-away | Ad stays until swiped; "Swipe to continue" appears; swipe dismisses and next photo shows | PASS | `02`, `03-ad-swiped-away.jpg` |
| 6 | Drag during 0.6 s dwell gives rubber-band resistance | Card moves ~20% and springs back | UNVERIFIED — could not time a drag inside the window on the sim |
| 7 | Button tap during dwell is queued | — | NOT APPLICABLE on this screen: rating action buttons are hidden while the ad is top |
| 8 | Load failure / no-fill | Preloader enters cooldown, deck simply has no ad (no flash/remount) | UNVERIFIED end-to-end (code path only) |
| 9 | Android | — | NOT RUN |

Bugs found and fixed during this run:
- Insert logic pre-claimed ads all the way down a long loaded deck (one live request per slot). Fixed to insert only when the due slot reaches the window edge; regression test in `__tests__/unit/rate/rating-deck.test.ts`.
- First preload timed out (5 s budget included cold SDK `initialize()`), putting ads into the 30-min cooldown. Timeout now starts after init, 15 s background budget.

Note: a validator warning "Advertiser assets outside native ad view" appeared once after a Fast Refresh remount of the card; it did not reproduce on a clean app launch (case 4).

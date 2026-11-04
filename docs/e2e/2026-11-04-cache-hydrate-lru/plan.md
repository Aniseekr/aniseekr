# Plan — cache hydrate / LRU / leak fixes (2026-11-04)

Build: ios/build/dd Debug-iphonesimulator AniSeekr.app (native unchanged; JS from working tree via Metro).
Device: iPhone 18 Pro simulator (793562A3…).

| ID | Goal | Steps | Expected | Verified at |
|---|---|---|---|---|
| C1 | Boot with sync SQLite warm doesn't break launch | Fresh install, launch, wait for rate tab | App reaches first screen, no red box; Metro log `warmSync mirrored 0 rows` (empty DB), no `CacheService.warmSync error` | Screenshot + Metro log |
| C2 | Rate tab loads data and persists it | Finish/skip onboarding, wait on rate tab until genres + seasonal rows show | Real rows rendered (titles/posters) | Screenshot |
| C3 | Cold relaunch warms first-paint keys | Terminate app, relaunch | Metro log `warmSync mirrored 3 rows` (or ≥1 if a source failed in C2); rate tab first screenshot shows real rows, not skeleton | Metro log + screenshot taken immediately after launch |
| C4 | Async cache path still works after shared handle | Open an anime detail from rate tab, go back | Detail renders; no `CacheService.* error` in log | Screenshot + log |
| C5 | Edge overlay after dispose changes | Open pilgrimage compare with edge mode | Edge overlay renders | Simulator has no camera → likely BLOCKED |

Cleanup: terminate app, `xcrun simctl shutdown all`.

## Android（adb）
Device: AVD `aniseekr_test`（API 36，emulator-5554），既有 debug build `com.kidneyweakx.aniseekr` versionCode 1；JS 走 Metro（`adb reverse tcp:8081`）。
實機 SM-G781B 裝的是 Play 正式版（versionCode 105），換 debug 版要先解除安裝、會清掉使用者資料 → 不在實機測。
前置：`pm clear` 讓 cache DB 為空。案例 A1–A4 = 上面的 C1–C4，預期與驗證方式相同（Metro log + `adb exec-out screencap`）。

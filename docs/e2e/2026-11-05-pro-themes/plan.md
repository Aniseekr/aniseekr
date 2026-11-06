# Pro themes + skins — E2E plan (2026-11-05)

Device: iPhone 18 Pro simulator (shared, already booted). Build: dev client from
`claude/pro-themes-7b0f3e`, installed as a separate bundle id
(`kidneyweakx.aniseeker.themes`, uncommitted `app.config.js`) so the other
worktree's app on the same simulator is untouched. Metro on port 8082.
Simulator has no StoreKit purchase → the real app state is **non-Pro**.

## Upgrade emulation (how the grandfather case is staged)
Phase A emulates the pre-1.3.0 app: temporary, uncommitted patch
`PREMIUM_ENABLED=false` (everyone Pro, as in the free era) and the grandfather
migration write disabled (old binary had none). Phase B = real branch code
(patch reverted, full reload), so the migration runs for the first time on a
device whose saved theme is premium — the real upgrade path.

## Cases
| ID | Goal | Steps | Expected | Verified at |
|---|---|---|---|---|
| A1 | build under test | open Appearance | 14 theme cards incl. Washi … Natsuzora; attackOnTitan card reads "Frontier" | screenshot |
| A2 | each new theme, dark | pick theme, mode Dark | palette applies; headline face (DM Serif / Bangers / Righteous where set) | Appearance screenshot ×6 |
| A3 | each new theme, light | mode Light | light surfaces, readable text | Appearance screenshot ×6 |
| A4 | skin on real screens | per theme: Collection tab, Pilgrimage hub | ThemedSurface cards show edge + texture, headlines use skin face | screenshots |
| A5 | stage grandfather | pick Cyberpunk, leave Phase A | saved theme = cyberpunk | screenshot |
| B1 | grandfathered keep | revert patch, reload | app still in Cyberpunk; Cyberpunk card not locked (ribbon, no lock) | screenshot |
| B2 | locked state | Appearance as non-Pro | Washi…Natsuzora + Frontier show lock pill | screenshot |
| B3 | lock opens paywall | tap Washi | PaywallSheet opens; rows "Premium themes & skins…", "No ads"; subtitle new pitch; theme unchanged | screenshot |
| B4 | grandfather is sticky | switch to Midnight (free), then tap Cyberpunk | Cyberpunk applies (no paywall) | screenshot |
| B5 | app icon picker | open App icon | theme icons section locked for non-Pro | screenshot |

Cleanup: uninstall `kidneyweakx.aniseeker.themes`, delete `ios/`, `app.config.js`, Metro 8082; leave the
shared simulator booted only if another session is using it (else `xcrun simctl shutdown all`).

## Android pass (S20 FE, Android 13) — added 2026-11-05 after merge to feat/uiux-cleanup (6e5b919)
Build: debug dev client, separate package `com.kidneyweakx.aniseekr.themes` (uncommitted
`app.config.js`, own slug/scheme), arm64 only, Metro :8085 with its own TMPDIR. Uncommitted
`PREMIUM_ENABLED=false` so every theme can be applied (visual checks only; gating was covered on iOS).
Tour harness as on iOS; host helper uses `adb reverse tcp:8799` + `adb exec-out screencap`.

| ID | Goal | Steps | Expected | Verified at |
|---|---|---|---|---|
| D0 | build under test | install, open bundle | app runs this branch (English UI, new themes present) | screenshot |
| D1 | OFL fonts resolve on Android | English UI; Washi / Screentone / Cel headlines | DM Serif / Bangers / Righteous glyphs, not Roboto/Nunito | zoomed crops of `D-*` |
| D2 | textures don't jank scrolling | profile screen, 8 `input swipe`s, `dumpsys gfxinfo` reset/read; free baseline vs Washi / Natsuzora / Yozakura, baseline repeated last | skinned janky-% and p90 within run-to-run noise of the two baselines | `J*.txt` |
| D3 | adaptive icons for new themes | inspect built APK mipmaps for the 6 aliases, composite fg over bg with circle + squircle masks | Seekr inside the safe zone, right backdrop colour | composited PNGs |
| D4 | light + dark, ≥3 new themes | tour: all 6 themes × dark/light × collection, pilgrimage, profile | palette, edges, fonts render | `D-*` |
Out of scope / stays UNVERIFIED: purchase, actually switching to a new alternate icon (needs a real Pro entitlement).
Cleanup: uninstall `.themes` (`.offline` was already removed by its owner), delete `android/`, `app.config.js`, symlink, Metro, helper; revert the flag + harness.

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

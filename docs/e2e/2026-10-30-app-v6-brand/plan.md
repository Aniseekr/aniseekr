# App v6 brand — icon, logo, Seekr scenes (2026-10-30)

Bring the aniseekr.moe v6 rebrand (landing `aniseekr-landpage-atlas` main) into the Expo app.
Size: **L** (new visual identity + native config). Branch: current `feat/uiux-cleanup`, nothing committed until Kidney says so.

## Decisions (Kidney, 2026-10-30)
- Scenes: launch (native splash + `app/index.tsx`), onboarding welcome/done, `EmptyStateView` (10 callers), settings brand footer.
- Alternate icons on **iOS + Android**.
- Default icon F (peek); alternates B night-lines, C one-eye, D manga-orange, E manga-night.

## Sources
- Icons: `marketing/app-icons-v6/*.png` (1024–1254 px, opaque).
- Logo paths: `aniseekr-landpage-atlas/src/lib/brand/brand.json` (head/eye/pupil/highlight/tails + ANIS / KR outlines + eye centres).
- Poses: `aniseekr-landpage-atlas/static/seekr/{leap,phone,point,read}.webp` (alpha, ~95 KB each).

## Phases
1. **Icons** — `assets/icon.png` = F at 1024; Android adaptive foreground = art inset to the 72/108 safe zone over its own edge colour;
   `adaptiveIcon.backgroundColor` = F's orange. `expo-alternate-app-icons@8.0.0` (exact: 9/10/11 all shipped within one hour on
   2026-10-29, too fresh to trust). Picker at Settings → Appearance → App icon (`app/(setting)/app-icon.tsx`).
   Native splash: `#080808` + Seekr head, replacing the old navy full-screen PNG.
2. **Logo** — `components/brand/`: `brand.json` copy, `SeekrMark` / `AniseekrLockup` (react-native-svg). Eyes glance + head blinks on a
   Reanimated loop; tap = hop + stamp; reduced motion = still. Wordmark ink = `theme.text.primary`, KR + tails = `theme.accent`.
   Seekr body colours are artwork colours → `SEEKR_COLORS` next to `THEMES` in `context/ThemeContext.tsx`.
3. **Scenes** — `MangaBurst` (focus lines) + `Screentone` (dot pattern) SVG primitives tinted from the theme.
   - `app/index.tsx`: focus lines + lockup stamp-in + tagline, replacing the cyan eye.
   - onboarding welcome (leap) / done (point) — tap Seekr → hop + SFX word.
   - `EmptyStateView`: Seekr pose on screentone disc, caller's icon as a small badge; buttons → `ThemedButton`, text → `ThemedText`.
   - settings footer: lockup + tagline above the version row.

## Grill (risks → answer)
- *Android icon switch kills the app on many launchers* (activity-alias disable) → confirm sheet warns before switching on Android.
- *Alt icon names vs. existing installs* → default stays `null`; names are PascalCase constants in one map shared by plugin config and picker.
- *Non-clean prebuild leaves the old navy splash storyboard* → verify splash on simulator after prebuild; fall back to `--clean` for ios only.
- *Hex creep* → only `SEEKR_COLORS` (artwork) lives in ThemeContext; every UI tint comes from `useTheme()`.
- *SFX words are copy* → i18n keys (`brand.sfx.*`), not literals.
- *Fake data* → none of this is data-driven; poses are decoration with `accessible={false}`.
- *Splash timing* → keep the 2.6 s route timer; a tap does not skip (hop only).

## Done
New icon on the simulator home screen, an alternate switched from Settings and seen on the home screen, logo in-app, scenes restyled,
`bun run typecheck` + scoped eslint + `bun run test:unit` green, screenshots under `docs/e2e/2026-10-30-app-v6-brand/`.

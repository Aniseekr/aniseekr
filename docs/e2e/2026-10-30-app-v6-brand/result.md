# 2026-10-30 — App v6 brand (icon, logo, Seekr scenes)

Device: iPhone 18 Pro simulator (iOS 27), Metro :8081, dark theme, English UI.
JS was verified on the Sep 28 dev client: that binary predates the new native module and native splash.

| Flow | Result | Evidence |
|---|---|---|
| Launch: Seekr head (same crop as native splash) + focus lines + ANIS◉◉KR stamp-in + tagline | OK | launch.jpg |
| Onboarding welcome: leap pose on screentone, lockup, tagline, full-screen focus lines | OK | onboarding-welcome-tap.jpg |
| Tap Seekr → hop + "HOP!" sound-effect word | OK | onboarding-welcome-tap.jpg |
| Onboarding done: point pose | OK (Skip → done; Finish not pressed, prefs untouched) | onboarding-done.jpg |
| Empty state (search no results): read pose + search badge, ThemedText/ThemedButton | OK | empty-search.jpg |
| Settings footer: lockup + tagline; tap → stamp + eyes glance toward the finger | OK | settings-footer-tap.jpg |
| Old binary without ExpoAlternateAppIcons: app boots, App icon row hidden | OK | — |

Not verified (native build blocked, see below): new home-screen icon, App icon picker + switching an alternate,
native splash `#080808` + head, Android (no ANDROID_HOME in this shell). Light (cream) theme not screenshotted.

Native build blocker: Xcode 27.1 / Swift 6.4 (installed 2026-10-26) fails to import Expo 57's prebuilt
`ExpoModulesJSI` interface (`cannot find type '__ObjC::expo'`) in ExpoWebBrowser / ExpoSystemUI / ExpoModulesCore.
Unrelated to this change; any native build of the repo fails the same way. Tried: `pod install` with
`EXPO_USE_PRECOMPILED_MODULES=0`, clean DerivedData, `SWIFT_ENABLE_EXPLICIT_MODULES=NO` — all fail identically.
Candidate fix (not tried, changes deps for everyone): bump Expo 57 patches; `expo-modules-core` 57.0.24 (repo has
57.0.18) ships an Xcode 27 precompiled-modules fix.

Verify: `bun run typecheck` ✓, `bun run test:unit` 1703/1703 ✓, scoped eslint 0 errors, prettier ✓.

## Expo SDK 57 → 58 upgrade (same day, user request)

`expo@58.0.21`, RN 0.88.1, React 19.3.0, `expo install --fix` for every Expo-managed package
(gesture-handler 2→3, view-shot 5→6, Skia 2.6→2.14, reanimated 4.7, worklets 0.13), in-range bumps elsewhere,
`expo-alternate-app-icons` 8→11 (Android: default icon gets its own alias, MainActivity never disabled).
`expo-doctor` 20/20 after a clean `node_modules` reinstall.

Code changes the upgrade required:
- `InteractionManager` removed in RN 0.87 → `libs/utils/after-interactions.ts` (requestIdleCallback, 500 ms timeout), 11 call sites.
- Strict TS API: refs typed as `ViewInstance` / `ScrollViewInstance` / `TextInputInstance`; read-only `TextStyle` in `text-style.ts`.
- expo-router 58: tab bar gets `emitter` + `navigateToTab` instead of `navigation`; container `'ready'` event gone (`'state'`).
- gesture-handler 3: builder types renamed `LegacyPinchGesture` / `LegacyTapGesture` / `LegacyComposedGesture`.
- Skia 2.14: `SkPath` immutable → `Skia.PathBuilder` in the cutout editor + `strokePath`.
- expo-file-system 58: `File.write()` is async → `writeSync()` at the 5 sync call sites.
- Pre-existing bug found by lint: since media-library 56 the root `saveToLibraryAsync` throws at runtime
  ("import from expo-media-library/legacy"). Save-to-Photos in companion / compare preview / share / standalone
  capture was broken on SDK 57; imports now come from `expo-media-library/legacy`.
- `ios.enableSceneSupport` dropped from app.json (built in on SDK 58).

Left on their current major on purpose (need a decision or a device to verify):
`react-native-google-mobile-ads` 16.0.0 (pinned 2026-09-20 for an Android break; latest 17.4),
`@react-native-google-signin/google-signin` 16 → 17 (auth), `react-native-purchases` 10 → 11 (payments),
`react-native-performance` 6 → 7, `supercluster` 8 → 9 (pilgrimage clustering), `@rnrepo/build-tools` 0.1 → 0.2,
`typescript` 6 → 7, `eslint` 9 → 10, `@babel/core` 7 → 8, `prettier-plugin-tailwindcss` 0.6 → 0.8.

# Experience mode tabs — phase 1

## Goal

Introduce one static Expo Tabs navigator whose visible tabs are resolved from a persisted experience mode. Integrate mode selection and Seeker tab editing into Profile without adding new feature pages yet.

## Locked decisions

- Modes are `explorer`, `collector`, and `seeker`.
- Existing users default to `seeker`, because Seeker preserves the current five-tab product.
- Profile is always visible and cannot be removed.
- Explorer and Collector use fixed presets. Seeker may add or remove any currently registered content tab; phase 1 keeps their existing catalog order.
- Phase 1 registers only the five routes that already exist: Discover, Bangumi, Collection, Pilgrimage, and Profile.
- Explorer temporarily exposes Pilgrimage + Profile; Collector exposes Discover + Bangumi + Collection + Profile. Their final Camera/Search/Map/Journal and Rating tabs arrive in later phases.
- Mode changes happen from Profile and persist synchronously through the existing user-preferences store.
- Deep links to a hidden tab remain valid; the tab is hidden from the dock, not deleted from the router.

## Module seam

`libs/navigation/experience-tabs.ts` owns mode/tab types, normalization, fixed presets, Seeker customization, and landing-route resolution. Screens and the tab bar consume its small interface instead of branching on modes independently.

## Phase 1 implementation

1. Add behavior tests for legacy migration, fixed presets, Seeker normalization, and landing routes.
2. Persist `experience` in `UserPrefs` and expose a reactive hook.
3. Make `(tabs)/_layout.tsx` register all existing routes once and hide/show them from the resolved configuration.
4. Add the centered Profile mode selector and Seeker tab editor.
5. Route splash/onboarding completion to the selected mode's landing route.
6. Add translations and verify typecheck, lint, unit tests, and spec checks where applicable.

## Deferred

- Explorer Camera, Search, Map, and Journal tab roots.
- Collector Rating tab root.
- Seeker Premium enforcement and paywall behavior.
- Seeker drag-to-reorder UI.

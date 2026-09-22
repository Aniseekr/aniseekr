# Explorer / Collector information architecture refresh

## Goal

Make each experience mode feel like a complete product instead of a filter over
unrelated screens.

- Explorer is a pilgrimage loop: discover a destination, prepare a visit,
  capture it, and revisit the result.
- Collector remains the anime-library loop: discover an anime, track its
  schedule, and organise the collection.
- Seeker remains the configurable mode and is the only preset where Map may be
  promoted to a permanent bottom tab.

The existing repositories, capture engine, search service, journal storage, and
deep links remain the source of truth. This is an information architecture and
screen-polish change, not a data rewrite.

## Proposed navigation model

### Explorer

1. **Discover** — the existing pilgrimage hub, presented as an Explorer tab
   root rather than a nested mini-hub.
2. **Journal** — saved captures and visits.
3. **Camera** — capture tool, intentionally available but never the landing
   tab.
4. **Search** — pilgrimage-only anime/location search.
5. **Profile** — fixed mode and settings entry.

Map is removed from the fixed Explorer preset. The map experience remains a
deep destination from Discover and pilgrimage details, so Explorer users do
not lose the feature. `explorerMap` remains in the Seeker catalogue and is the
only way to pin Map directly to the bottom bar.

### Collector

1. **Discover** — anime discovery/rating.
2. **Schedule** — currently airing and tracked shows.
3. **Collection** — folders, recent anime, and library statistics.
4. **Profile** — fixed mode and settings entry.

Collector keeps its current navigation. Collector Home must not advertise a
hidden pilgrimage tab or end in a pilgrimage-only route. Its visible journey
stays Discover → anime detail/tracking → Schedule/Collection.

### Seeker

- Keeps four configurable content slots plus fixed Profile.
- Keeps every existing content tab in the catalogue.
- `Map` is presented as a Seeker-special direct tab; Explorer receives Map as
  contextual navigation instead.
- Existing saved tab selections continue to normalise without destructive
  migration.

## Screen responsibilities

### Explorer Discover

- Reuse `PilgrimageHubScreen`; add an explicit tab-root variant.
- Use Explorer-specific title/subtitle and a clear top-level search affordance.
- Preserve the real-data priority already implemented: collection first,
  nearby when location exists, then featured/Tourism 88.
- Route Journal, Camera, and Search shortcuts to visible tabs. Fall back to
  the legacy stack routes when the destination is not a visible tab.
- Keep Map as a contextual action from the nearby hero, See All, or a
  pilgrimage detail. Do not make it another competing home action.
- Empty/error states always offer a next step; no fake nearby counts or sample
  destinations.

### Explorer Journal

- Keep synchronous first paint from capture storage.
- Give the tab root a stable, left-aligned page identity instead of balancing
  a title between a fake back-button spacer and an add icon.
- Keep the summary compact and only show real values.
- Empty journal ends in one obvious Camera action.
- Folder detail retains predictable in-screen back behaviour and its existing
  compare/delete flow.

### Explorer Camera

- Keep the shared camera engine and controls.
- Keep Journal reachable after capture and from the gallery affordance.
- Preserve permission, no-device, capture-in-flight, success, and attach-to-
  nearby-scene states.
- Only adjust tab-safe spacing and top-level chrome; do not fork camera logic.

### Explorer Search

- Keep pilgrimage-only search at the tab root and do not auto-focus on tab
  entry.
- Replace the invisible back-button spacer with a real page heading and
  aligned search field.
- Use the active theme for surfaces/text/accent in the touched tab-root UI.
- Recent, loading, no-results, resolution-error, and results states each keep
  a visible recovery path.
- A result opens the pilgrimage detail and returns to the Search tab.

### Collector

- Keep existing Discover, Schedule, Collection, and Profile pages.
- Hide pilgrimage-only trend content/actions while in Collector mode so the
  mode does not route into a hidden product area.
- Preserve anime search, tracking, collection folders, share, and stats.
- No new Collector-only data model or duplicate screen implementation.

## Interaction and visual rules

- Five or fewer bottom destinations, always icon + label, stable order.
- One primary action per state; secondary tools stay in contextual menus.
- 44 pt minimum touch targets and floating-tab safe-area clearance.
- Theme tokens and themed primitives for all touched UI; no new hardcoded
  screen colours or typography.
- Only semantic motion: tab focus, press feedback, list entry, and
  sheet/overlay transitions. Camera/map high-frequency state stays off the
  React render path.
- Fixed strings go through `useT()` with English and Traditional Chinese
  catalogue parity.

## Failure cases to guard

- Switching from Explorer while Camera, Journal detail, or Search has local
  state must not crash or navigate to a hidden tab.
- Seeker users who previously pinned Map keep it after normalisation.
- Explorer users land on Discover after launch/onboarding, never Camera.
- Shortcut navigation switches tabs only when the target is visible; otherwise
  it pushes a returnable legacy route.
- Collector Home never pushes `/pilgrimage` from a card or See All control.
- Empty collection, denied location, denied camera, offline map, and empty
  journal remain honest and actionable.

## Implementation order

1. Add failing navigation tests for the Explorer preset, landing route, Map
   availability, and legacy Seeker preference preservation.
2. Change the fixed Explorer preset and mode-aware tab metadata/title.
3. Add the pilgrimage hub tab-root navigation seam and wire its shortcuts.
4. Polish Journal and Search tab-root chrome and their empty/recovery states.
5. Audit Camera tab spacing and Journal return path.
6. Make Collector Home mode-aware and remove hidden pilgrimage exits.
7. Update translations and focused UI/behaviour tests.
8. Run `bun run typecheck`, `bun run lint`, `bun run test:unit`, and
   `bun run spec:check` if a spec-mapped pilgrimage service is touched.
9. Review the completed diff against repository rules and this plan before
   claiming completion.

## Acceptance criteria

- Explorer opens on Discover and its dock order is Discover, Journal, Camera,
  Search, Profile.
- Map is not a fixed Explorer tab and can still be selected as a Seeker tab.
- Explorer can complete Discover → detail/map → Camera → Journal without
  entering Collector screens.
- Collector can complete Discover → track → Schedule/Collection without a
  hidden pilgrimage-tab jump.
- Existing pilgrimage deep links and saved Seeker configurations still work.
- All touched states are usable at 375 pt width in light/dark themes with no
  bottom-bar overlap.

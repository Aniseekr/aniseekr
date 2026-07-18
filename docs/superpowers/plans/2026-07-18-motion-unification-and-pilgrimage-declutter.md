# Motion unification & pilgrimage de-clutter — per-page effect plan

**Date**: 2026-07-18 · **Executor**: Codex · **Reviewer/verifier**: Claude
**Goal**: keep every feature exactly as-is; unify animation language, kill fake
sheet affordances, upgrade loading states, and reduce floating-chrome noise in
pilgrimage. NO new features, NO data-layer changes, NO navigation changes.

## Audit findings this plan is built on

1. **Presets exist but only rate/ uses them.** `libs/animations/presets.ts`
   (`sheetEnter`, `overlayEnter/Exit`, `listItemEnter(Down)`) is imported by 8
   files, all in `components/rate/` + `components/achievements/`. All 13
   pilgrimage routes have **zero** `entering=` props. bangumi / collection /
   profile / search / trending / companion screens: zero.
2. **Spring configs drift per file.** `FloatingTabBar.tsx:37-38`
   (`FOCUS_SPRING` 20/220/0.6, `PRESS_IN_SPRING` 14/320),
   `rate/ModeSelector.tsx:46` (16/320), `rate/PersonalizedPickSheet.tsx:44`
   (`SHEET_SPRING_CONFIG` 20/220/0.9), ThemedButton (12/300). Same intent,
   four values.
3. **~15 "sheets" are static Modals with a decorative grabber.** They render a
   handle bar implying pull-to-dismiss but have no gesture: rate/
   `ImageDisplaySettingsSheet`, `FolderPicker`; collection/`AnimeProgressView`;
   bangumi/`AddTrackingSheet`, `NotificationManagerSheet`,
   `BangumiSettingsSheet`, `YearPickerSheet`; profile/`EditDisplayNameSheet`;
   settings/`QuickActionSheet`; pilgrimage/`CornerPinSheet`, `CropSheet`,
   `LocationPermissionSheet`, camera/`CameraSettingsSheet`,
   camera/`SceneSwitcherSheet`, detail/`SpotSheet`, detail/`SpotClusterPicker`.
   This is the user-reported bug: "pull-up effects on pages with no pull-up".
   The two real sheets (`PilgrimageHubSheet`, `PilgrimageDetailSheet`) use
   @gorhom/bottom-sheet and are fine.
4. **Sheet chrome before the sheet exists.** `app/(tabs)/pilgrimage/[animeId].tsx:693`
   renders `PilgrimageDetailLoadingShell`, a static fake sheet incl. handle bar
   (`PilgrimageDetailLoadingShell.tsx:115`), before the real sheet mounts.
5. **Bottom-sheet look, fade-in motion.** `LocationPermissionSheet.tsx:57` and
   `SceneIdDisclosureSheet.tsx:29` use `animationType="fade"` on sheet-shaped
   panels — wrong motion direction for the shape.
6. **Loading gaps.** `app/search.tsx` uses 3 `ActivityIndicator`, no Skeleton.
   `app/anime/[id].tsx` still has 2 `ActivityIndicator`.
   `pilgrimage/compare/preview.tsx` has 3.
7. **Pilgrimage floating-chrome density.** `map.tsx` (1387L) stacks 5 layers:
   4 `RoundHeaderButton` + search + `RegionChipStrip` (top), 3 `FilterPill` +
   2-segment `LayoutToggleSegment` (bottom, sheet-anchored), `LocateFab`,
   HubSheet, long-press Modal. `[animeId].tsx` (1108L) similar. None of it
   animates in.

## The gold standard already in-repo

`components/rate/PersonalizedPickSheet.tsx` — transparent Modal + animated
backdrop + `Gesture.Pan` drag-to-dismiss with elastic overshoot
(`ELASTIC_LIMIT` 200 / factor 0.4), `SHEET_SPRING_CONFIG`, scale/opacity
interpolation while dragging, `FadeInUp` panel entry, staggered content.
Phase 0 extracts this; everything else adopts it.

---

## Phase 0 — motion foundation (do first, everything depends on it)

### 0.1 Extend `libs/animations/presets.ts`

Add exported spring tokens + missing presets (names final):

```ts
export const Springs = {
  press:  { damping: 14, stiffness: 320 },            // press-in scale
  focus:  { damping: 20, stiffness: 220, mass: 0.6 }, // selection pill / focus
  sheet:  { damping: 20, stiffness: 220, mass: 0.9 }, // sheet settle/dismiss
} as const;
export const fabEnter    = () => ZoomIn.duration(220).easing(Easing.out(Easing.cubic));
export const bannerEnter = () => FadeInDown.duration(240).easing(Easing.out(Easing.cubic));
export const bannerExit  = () => FadeOutUp.duration(180);
export const toastEnter  = () => FadeInUp.duration(200);
export const toastExit   = () => FadeOutDown.duration(160);
```

Migrate the file-local duplicates to import these: `FloatingTabBar.tsx:37-38`,
`rate/ModeSelector.tsx:46`, `rate/PersonalizedPickSheet.tsx:44`. Do NOT change
ThemedButton's internal 12/300 press spring (it has pinned tests) — leave it.

### 0.2 New shared sheet primitives in `components/themed/sheet/`

Extract from `PersonalizedPickSheet` (behavior-identical refactor there):

- `SheetHandle` — the one grabber bar (36×4, `theme.glassBorder`, radius 2).
- `SheetBackdrop` — animated dim, tap-to-dismiss, `FadeIn/FadeOut`.
- `useSheetDrag(onClose)` — Gesture.Pan + elastic overshoot + spring
  dismiss/settle + drag-scale/opacity interpolation, returns
  `{ panGesture, sheetAnimatedStyle, reset }`.
- `ThemedBottomSheet` — transparent `Modal` + `SheetBackdrop` + panel
  (`FadeInUp` via `sheetEnter()`, rounded top, `SheetHandle`, drag-to-dismiss).
  Props: `visible, onClose, children, maxHeightPct?, disableDrag?`.
  `onRequestClose` wired for Android back. Export from `components/themed`.

Refactor `PersonalizedPickSheet` to consume these (its behavior is the spec —
if its feel changes, the extraction is wrong). Add unit test
`__tests__/unit/themed-sheet.test.ts` (renders, calls onClose on backdrop
press; follow existing themed-* test patterns).

**Rule for every consumer below**: a grabber bar may exist ONLY where drag
actually dismisses. Adopt `ThemedBottomSheet` (gets real drag) OR delete the
decorative handle. Never a third option.

---

## Phase 1 — kill fake pull-up affordances (the user's direct complaint)

Per file (keep content/logic identical, swap the shell only):

| File | Action |
|---|---|
| `pilgrimage/detail/SpotSheet.tsx` | Adopt `ThemedBottomSheet` (real drag) |
| `pilgrimage/detail/SpotClusterPicker.tsx` | Adopt `ThemedBottomSheet` |
| `pilgrimage/camera/CameraSettingsSheet.tsx` | Adopt `ThemedBottomSheet` |
| `pilgrimage/camera/SceneSwitcherSheet.tsx` | Adopt `ThemedBottomSheet` |
| `pilgrimage/LocationPermissionSheet.tsx` | Adopt `ThemedBottomSheet` (fixes fade-in-sheet mismatch) |
| `pilgrimage/scene-id/SceneIdDisclosureSheet.tsx` | Sheet-shaped → `ThemedBottomSheet`; if it's really a centered dialog, keep fade and remove sheet chrome |
| `pilgrimage/CornerPinSheet.tsx` | Full-screen editor with its own pin gestures — drag-to-dismiss would conflict. DELETE the decorative handle, keep `animationType="slide"` |
| `pilgrimage/CropSheet.tsx` | Same as CornerPinSheet: delete handle, keep slide |
| `pilgrimage/detail/PilgrimageDetailLoadingShell.tsx` | Remove the fake `sheetHandle` (line ~115) and sheet-shaped container. Loading layout = map-area `Skeleton.Block` + `Skeleton.MapList` rows, no sheet cosplay. Sheet chrome appears only when `PilgrimageDetailSheet` (real, draggable) mounts |

Phase-1 exit check: `grep -rn "handle" --include="*Sheet*.tsx" components/pilgrimage` shows no
decorative grabber styles outside `components/themed/sheet/`.

---

## Phase 2 — pilgrimage per-page motion & de-clutter (feature parity)

### 2.1 `app/(tabs)/pilgrimage/index.tsx` (hub)

- First mount: `listItemEnter(index)` stagger on the section rails' cards —
  cap at 8 animated items per rail, no animation on scroll-in (perf).
- `SectionHeader`s: `overlayEnter()`.
- Keep the existing Skeleton usage; verify warm-cache visits skip it (rule 10).

### 2.2 `app/(tabs)/pilgrimage/map.tsx`

- **De-clutter**: move the 3 `FilterPill`s + `LayoutToggleSegment` (lines
  ~940-990) from free-floating bottom chrome into `PilgrimageHubSheet`'s
  header row (one horizontally scrollable row under the handle). Same
  controls, same handlers, one fewer floating layer, and they ride the sheet
  for free (the manual "anchor to sheet top" sync code at ~755 dies).
- Top overlay (4 `RoundHeaderButton` + search + `RegionChipStrip`):
  `overlayEnter()` once the map signals ready; do NOT animate on every
  region-chip change.
- `LocateFab`: `fabEnter()` on mount, `ZoomOut` exit.
- Long-press quick-actions `Modal` (~1033): `FadeIn` backdrop + `overlayEnter`
  card instead of bare pop.
- `MapOfflineOverlay`: `FadeIn`.
- Constraint: map gesture/camera state stays off React render path (rule 9) —
  entering-animations only, no new per-frame state.

### 2.3 `app/(tabs)/pilgrimage/[animeId].tsx` (detail)

- LoadingShell replacement per Phase 1.
- `ProximityCheckInBanner`: `bannerEnter()/bannerExit()`.
- `SeriesDropdownPill`, `FilterCyclePill`, `LocateFab`, `RoundHeaderButton`
  cluster: `overlayEnter()` on mount.
- `SpotSheet` opening now comes from ThemedBottomSheet (Phase 1); check-in
  success keeps `hapticsBridge.success()`.
- Scene grid (`SceneTile`): `listItemEnter(index)` first mount, ≤8.

### 2.4 `compare/[spotId].tsx` (camera) — motion only, no structure changes

- Toasts (`AutoCaptureToast`, `CamSwitchToast`, `CaptureModeToast`):
  `toastEnter()/toastExit()` via presets instead of ad-hoc/bare mounts.
- `AutoCaptureBadge`, `BurstIndicator`: `FadeIn/FadeOut`.
- Do not touch `camera-engine`, HUD SharedValues, or capture logic.

### 2.5 `compare/preview.tsx`

- Replace the 3 `ActivityIndicator`s with `Skeleton.Block` shimmer overlays
  sized to the media they replace; `FadeIn` when media arrives.

### 2.6 `compare/share.tsx`

- Control sections: `listItemEnterDown(idx)` on first mount.
- Toast (line ~107 `toast` state): `toastEnter()/toastExit()`.
- NOTE: its 25 top-level `useState` violates rule 9 — out of scope here, do
  not refactor state in this pass (log as follow-up).

### 2.7 `compare/align.tsx`, `compare/tips.tsx`, `identify.tsx`, `plan.tsx`, `trip/[animeId].tsx`

- Lists/rows: `listItemEnter(index)` first mount.
- `identify.tsx` result view (`SceneIdResultView`): staggered reveal of result
  rows; keep existing Skeletons.
- Empty states: `FadeIn`.

---

## Phase 3 — app-wide sweep (after pilgrimage lands)

- `app/search.tsx`: swap 3 `ActivityIndicator` → `Skeleton.AnimeCardList`;
  results `listItemEnter` ≤8.
- `app/anime/[id].tsx`: swap 2 `ActivityIndicator` → skeleton blocks; hero
  section content `FadeIn` when data resolves (chrome from route params paints
  frame 1 — rule 10 must keep holding).
- `app/(tabs)/bangumi.tsx`, `collection/index.tsx`, `trending.tsx`,
  `profile.tsx`: first-mount card stagger (≤8), `RefreshControl`
  `tintColor={theme.accent}` where not already themed.
- Adopt `ThemedBottomSheet` in: bangumi/`AddTrackingSheet`,
  `NotificationManagerSheet`, `BangumiSettingsSheet`, `YearPickerSheet`;
  collection/`AnimeProgressView`; profile/`EditDisplayNameSheet`;
  settings/`QuickActionSheet`; rate/`ImageDisplaySettingsSheet`,
  rate/`FolderPicker` (mechanical — same swap as Phase 1).

---

## Hard constraints for the executor

1. CLAUDE.md rules 1-11 are binding. Especially: no raw hex, no raw fontSize,
   no `await` on first paint (rule 10), no setState-per-frame (rule 9), no
   fake data (rule 8), strings via `useT()` (rule 11 — this plan adds no new
   user-facing strings; if one is needed, add the key to `en.json` first).
2. Stagger budget: ≤8 items, total ≤400ms. Never attach `entering=` to
   virtualized list items that mount during scroll — first screenful only
   (guard with `index < 8` or list-level flag).
3. All new animation configs come from `libs/animations/presets.ts` — adding a
   file-local spring/duration constant is a review-reject.
4. Haptic semantics unchanged (rule 7); ThemedBottomSheet does NOT add its own
   haptics (callers already own them), except the drag-past-threshold tick
   copied from PersonalizedPickSheet.
5. Verify after EACH phase: `bun run typecheck && bun run lint && bun run test:unit`
   and `bun run spec:check`. Commit per phase, message
   `feat(motion): phase N — <summary>`... actually do NOT commit — leave the
   working tree for the reviewer; the reviewer commits after verification.

## Phase 4 — ThemedBottomSheet hardening (grilled 2026-07-18, decisions locked)

Phases 0–3 shipped on `feat/motion-unification` (a2ad1bc + 669b6fc). A grilling
pass on the resulting design surfaced 2 real defects + 2 polish decisions. All
four are in `components/themed/sheet/` — no caller-side churn except the
scrollable-body opt-out flag. Feature parity binding.

### 4.1 Drag scoped to the handle/header, NOT the whole panel (defect fix)

Today `ThemedBottomSheet` wraps the entire panel (incl. any child
ScrollView/FlatList) in one `Gesture.Pan`, with zero gesture coordination.
Sheets with internal scroll (`AddTrackingSheet`, `FolderPicker`,
`CameraSettingsSheet`, `SpotClusterPicker`) fight: dragging a mid-scrolled list
downward drags the sheet toward dismiss instead of scrolling.

**Decision:** attach the `GestureDetector` only to the `SheetHandle` (+ an
optional non-scrolling header slot), never around the scroll body. Scroll
content is then completely free of the pan — the native iOS sheet behavior.
Dismiss = drag the handle, tap the backdrop, or Android back. Accept that you
can't dismiss by dragging the list body itself.

### 4.2 Default `maxHeightPct = 0.9` + internal scrollable body (defect fix)

Callers with no `maxHeightPct` (`BangumiSettingsSheet`, `ImageDisplaySettingsSheet`,
`QuickActionSheet`) overflow off the top for tall content with no scroll.

**Decision:** `ThemedBottomSheet` defaults `maxHeightPct = 0.9` and wraps
`children` in a `ScrollView` by default so content never overflows regardless of
caller. Add `scrollable?: boolean` (default `true`); callers that already own a
ScrollView/FlatList pass `scrollable={false}` to avoid double-nesting
(`AddTrackingSheet`, `FolderPicker`, `CameraSettingsSheet`, `SpotClusterPicker`).

### 4.3 Slide-down exit (polish)

`animationType="fade"` cuts off the elastic drag-dismiss slide.

**Decision:** Modal `animationType="none"`; drive both directions with
Reanimated — enter `FadeInUp` (via `sheetEnter()`), exit slide-down + fade. Keep
the Modal mounted through the exit (internal `mounted` state or delayed unmount)
so the drag-dismiss elastic finishes before unmount. Add the exit preset to
`libs/animations/presets.ts` (`sheetExit`).

### 4.4 Two sheet systems coexist — align the feel (consistency, minor)

`@gorhom/bottom-sheet` stays for the 3 pilgrimage snap-point sheets;
`ThemedBottomSheet` for the 16 simple dismiss modals. **Decision:** keep both,
but align the backdrop dim opacity, handle bar size/color, and corner radius so
the two systems feel like one. No functional change.

### Phase 4 constraints

- Behavior parity: every swapped sheet keeps its handlers, controls, keyboard
  handling (`react-native-keyboard-controller`, `KeyboardProvider` already at
  `app/_layout.tsx:202`) and content. Only the drag/scroll/exit mechanics change.
- Update `__tests__/unit/themed-sheet.test.ts` for the handle-only gesture and
  the `scrollable` prop; keep the backdrop-dismiss assertion.
- Verify gate unchanged: typecheck + test:unit + spec:check + scoped
  eslint/prettier on changed files. No commit — reviewer commits.

### Verify-on-device (not code changes — QA checklist)

- Keyboard: focus the TextInput in `EditDisplayNameSheet` / `FolderPicker` /
  `YearPickerSheet` / `AnimeProgressView` inside the Modal and confirm the field
  lifts above the keyboard (RN Modal renders outside the root view tree — the
  keyboard-controller Modal path needs a real-device check).
- Scroll: mid-scroll a long `FolderPicker` / `AddTrackingSheet` list and confirm
  drag scrolls the list, only the handle dismisses.

## Follow-ups explicitly out of scope

- `compare/share.tsx` state refactor (25 useState → reducer).
- `map.tsx` / `preview.tsx` file-size reduction beyond what the pill-move buys.
- Light-mode surface palette (tracked separately in CLAUDE.md).
- Repo-wide lint debt (887 pre-existing errors, incl. react-hooks/immutability
  false positives on Reanimated shared-value writes).

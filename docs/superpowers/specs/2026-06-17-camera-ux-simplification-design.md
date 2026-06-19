# Camera UX simplification — Samsung-style banded layout, glass chrome, overlay-mode carousel

**Date:** 2026-06-17
**Status:** Approved UX direction, pending spec review — implementation deferred (`先不實作`)
**Area:** Pilgrimage camera capture (`app/(tabs)/pilgrimage/compare/[spotId].tsx` + `components/pilgrimage/camera/*`)
**Builds on:** `2026-06-15-camera-device-orientation-design.md` (orientation/letterbox work, already shipped on `camera-device-orientation`)

## Problem

The camera chrome is too complex. The bottom third of the screen is **6+ independently floating, absolutely-positioned layers** stacked by `bottom` offset — `ShutterRow`, `ZoomDial` (hovering *above* the shutter, not in it), `CaptureHistoryStrip`, `FocusExposureBar`, `AutoCaptureStatusBadge`, toasts — **plus a detached bottom-right `OverlayDock`** that hides the app's core feature. In landscape the whole cluster reflows into a right-edge vertical column.

Consequences:
- **The differentiator is buried.** This is a 聖地巡礼 (align-your-shot-with-an-anime-scene) camera, yet the scene-overlay control lives in a corner dock, while generic camera cruft (a full zoom dial, EV bar, flash cycle, capture-mode/HDR) takes prime real estate.
- **Redundancy.** Capture-mode, aspect, and self-timer are each settable in *two* places (top-bar chips **and** the settings sheet).
- **Dead/duplicate code.** `VerticalExposureSlider.tsx` and `chips/ExposureControls.tsx` have zero imports; `chips/OverlayControls.tsx` is a superseded variant of `OverlayControlsBar.tsx`.
- Hard to reason about and visually noisy — the opposite of "簡單乾淨".

## Goals

1. A clean, conventional **banded layout** (Samsung/Apple-class): a few clear horizontal bands, no stacked floating layers, no corner dock.
2. Make the **overlay (align-with-scene) the primary, clearly-labelled control** — a left/right swipe carousel just above the shutter.
3. **Always-transparent glass chrome** over a full-bleed preview, with subtle gradient scrims so it stays legible (no solid bars, no "becomes transparent" trigger logic).
4. **Fixed bottom row in BOTH orientations** — it never reflows to a side column; only the glyphs rotate in place.
5. Keep the **pilgrimage essentials prominent**: the anime reference thumbnail + the alignment HUD.
6. **Demote generic controls** to small top-bar icons / pinch / the settings sheet; remove redundancy + dead files.

## Decisions (locked via discussion)

| Topic | Choice |
|-------|--------|
| Swipe carousel switches | **Overlay mode** (Off / Anime / Edge / Sketch / Subject) |
| Chrome opacity | **Always-transparent glass + scrim** (full-bleed preview behind) |
| Layout model | **Samsung-style horizontal bands** |
| Bottom row in landscape | **Stays at the bottom; glyphs rotate in place** (no side-column reflow) |
| Generic controls | Small top-bar icons / pinch / settings sheet; remove dead + redundant |
| Immersion lever | **Fewer controls** (auto-hide secondary), NOT an opacity change (chrome is always glass) |

## Design

### Portrait layout — the bands

```
┌───────────────────────────────┐
│ ⚙              ⚡ ⏱ 16:9 ◫      │  TOP BAR (glass, fixed): settings | flash·timer·aspect·capture-mode
│ ┌────┐                         │
│ │scene│  87% · 12m · ←5°  ✓     │  anime REF thumb (tap→scene switcher) + ALIGNMENT HUD (float over preview)
│ └────┘                         │
│                                │
│         live preview           │
│         + scene overlay        │
│              · · ·             │  (level-horizon hairline)
│            [.5] [1×] [3×]  ◐   │  ZOOM presets + overlay-opacity (glass pills)
│  ‹  Off  Anime  Edge  Sketch › │  ★ OVERLAY-MODE CAROUSEL (swipe) — the star control
│    ▢          ◉          ⟲     │  BOTTOM ROW (glass, fixed): gallery | shutter | flip
└───────────────────────────────┘
```

### Landscape layout — fixed bottom, immersive-by-subtraction

```
┌──────────────────────────────────────────────┐
│ ⚙                                  (secondary  │
│  87% · 12m · ←5° ✓                  auto-hidden)│
│              full-bleed 16:9 preview + overlay  │
│  ‹ Off  Anime  Edge  Sketch ›                   │
│     ▢          ◉          ⟲   ← STILL at bottom │
│   gallery   shutter     flip     glyphs rotated │
└──────────────────────────────────────────────┘
```

- The bottom row **stays at the bottom edge** and does **not** become a right-edge column (today's behavior, removed). Glyphs rotate 90° in place (Apple/Samsung convention).
- Because chrome is *always* glass, "immersive" in landscape = **auto-hiding the secondary controls** (zoom presets, opacity, top contextual icons), leaving shutter + carousel + alignment readout. Tap anywhere reveals the rest.

### Transparency & legibility strategy

- Every band/control uses a **translucent glass fill** (reuse/extend `CameraChrome.controlFill = rgba(0,0,0,0.4)`) — there are **no solid bars anywhere** and **no transparency trigger** (it is always glass, which is simpler and consistent).
- To keep icons/alignment numbers readable over bright outdoor scenes, add a **faint top and bottom gradient scrim** behind text/icon regions. The shutter stays a high-contrast white ring. Principle: *looks transparent, always legible* — transparency must not cost usability.

### Control disposition (every control's new home)

This table is the concrete simplification — it is the "what moves where" for the future implementation plan.

| Control | Today | New home |
|---|---|---|
| **Overlay mode** (off/anime/edge/sketch/subject) | bottom-right dock panel | **Overlay carousel** (primary, above shutter) |
| Overlay opacity | dock slider | quick `◐` pill in the zoom band |
| Overlay reposition / flip | dock panel | compact popover when an overlay mode is active (near the carousel) |
| Subject combine / character picker | dock panel (subject mode) | inline, shown only when the **Subject** carousel item is selected |
| **Zoom** (dial drag + detents + island) | floating dial above shutter | **preset pills `[.5/1/3×]` + pinch** (the complex dial is removed) |
| EV / exposure | persistent bar when AF-locked | **tap-to-focus → transient sun-slider** (Samsung-style); no persistent bar |
| Tap-to-focus / AF lock | preview tap | unchanged |
| Flash | top-bar disc | top-bar small icon |
| Self-timer / countdown | top chip **+** settings | top-bar small icon (single home) |
| Aspect (16:9/4:3/1:1/full) | top chip **+** settings | top-bar small icon (single home) |
| Capture mode (single/burst/auto) | top-bar disc + toast + settings | top-bar small icon (Samsung's "filters" slot) |
| HDR / burst | folded into capture-mode | unchanged (folded) |
| Orientation AUTO/LAND | top chip | top-bar small icon **or** settings (drives the shipped `useCameraOrientation`) |
| Flip / facing | bottom row (right) | **bottom row (right)** — unchanged |
| Library import | bottom row (left) | **merged into the gallery thumb** (left) |
| Capture-history strip | persistent floating strip | count badge on the gallery thumb → expand on tap |
| **Anime reference thumbnail** | top-left | **top-left, kept** (entry to scene switcher) |
| **Alignment HUD / level horizon** | over preview | **over preview, kept** |
| Scene switcher | via ref thumb | unchanged |
| Settings sheet (resolution/silent/mirror/animate/auto-capture-when-aligned) | modal | unchanged (the deep controls' single home) |
| **OverlayDock** (corner square + panel) | bottom-right | **removed** (carousel + popover replace it) |
| `VerticalExposureSlider`, `chips/ExposureControls` | — | **removed (dead code)** |
| `chips/OverlayControls` vs `OverlayControlsBar` | two variants | consolidated into the carousel; drop the dead variant |

### Orientation integration (with already-shipped work)

The new fixed-bottom-bar replaces today's `isLandscape`-driven side-column reflow (`styles.landscapeCluster`, the 96px right rail). It composes with the shipped device-orientation behavior:
- **AUTO** → capture follows the physical phone, UI stays portrait-locked → the bottom bar sits at the bottom, glyphs upright.
- **LAND** → landscape-locked interface → the bottom bar stays at the (now-landscape) bottom edge, glyphs rotate 90°.

`useCameraOrientation` / `cameraOrientationSource` / `cameraOrientationLockIntent` are unchanged; only the chrome layout that *reacts* to orientation changes.

### Component impact (high-level — for the future plan)

- **New:** a band-based chrome layout (replacing the per-layer `bottom`-offset stacking); `OverlayModeCarousel`; a `ZoomPresets` control.
- **Heavily changed:** `[spotId].tsx` render tree (bands replace the 6+ floating layers); `ShutterRow`; `OverlayControlsBar` → carousel; `CameraTopBar` (contextual icon row); `ZoomDial` → presets; `camera-ui.ts` layout constants (band heights; drop the landscape side-column logic).
- **Removed:** `OverlayDock`, `VerticalExposureSlider`, `chips/ExposureControls`, the redundant top Row-2 chips, the dead `OverlayControls` variant.

## Non-goals

- **No change to capture / orientation / letterbox behavior** — that shipped; this is chrome/layout only.
- Not redesigning the downstream preview/share/compose surfaces (separate).
- No new camera features (filters/beauty/etc.).
- Performance is not the driver, though collapsing 6+ floating layers into a few bands is a welcome side effect (fewer absolutely-positioned siblings reconciled per HUD change).

## Open questions (settle in the implementation plan)

- Exact form of the overlay reposition/flip + opacity controls once the dock is gone (inline pills vs a compact popover).
- Final home of the AUTO/LAND control (top contextual icon vs settings sheet).
- Whether the contextual top-icon set is always visible or also auto-hides in landscape immersive.

## Next step

This is **UX design only**. Implementation is a separate `writing-plans` pass — TDD where there is pure logic (band/scrim layout math, the carousel index/labels, control-disposition reducers), with the component restructure gated by `bunx tsc --noEmit` + the existing suites + on-device verification of the new layout in portrait and landscape.

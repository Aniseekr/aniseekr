# Camera UX Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, recommended for this plan because `[spotId].tsx` is a single 1775-line integrator that needs full-file context) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pilgrimage camera's 6+ floating absolutely-positioned HUD layers + corner `OverlayDock` + landscape side-column with a clean Samsung-style banded layout where the overlay-mode carousel is the primary control — **without losing any of the 38 existing features**.

**Architecture:** Pure layout/selection logic moves into testable modules (`overlay-carousel.ts`, `zoom-presets.ts`, new `camera-ui.ts` band + visibility resolvers, `cameraChrome.ts` scrim tokens) under strict TDD. New presentation components (`OverlayModeCarousel`, `ZoomPresets`, `OverlayQuickControls`, `GalleryThumb`) consume that logic. The 1775-line `[spotId].tsx` is restructured from per-layer `bottom`-offset stacking into 3 fixed bottom bands + a top bar, identical in both orientations (glyphs rotate, no side-column reflow). State ownership is **unchanged** — `useCameraHud` / `useCameraSettings` / `useCameraZoom` / `useCameraOrientation` / `useOverlayTransform` already own everything; we rewire presentation only. Dead/superseded files are removed last, grep-verified.

**Tech Stack:** Expo Router, React Native, Reanimated (SharedValue), react-native-gesture-handler, react-native-vision-camera v5, Skia (overlay), `bun:test` (pure-logic TDD), `bunx tsc --noEmit` (component gate).

**Execution discipline (per `/tdd` + "preserve all functionality"):**
- Every pure-logic module follows red→green→refactor with `bun test`.
- Every component/screen change is gated by `bunx tsc --noEmit` + the full existing camera suite staying green (the `camera-feature-parity` test is the preservation safety net).
- The 38-feature checklist (Appendix A) is re-verified before the plan is called done.
- Removals happen only after the new UI is wired and green, each grep-verified for zero imports.

---

## Source maps (ground truth gathered before planning)

- **Screen:** `app/(tabs)/pilgrimage/compare/[spotId].tsx` — `CompareCaptureScreen`, 1775 lines. State via `useCameraHud` reducer (~19 fields) + a few `useState`/`useRef`/`SharedValue`. Render tree = `CameraStage` (full-bleed preview) + `OverlayLayer` + HUD layers + 6+ absolutely-positioned bottom layers stacked by `bottom: bottomBarHeight + N` + `OverlayDock` + a landscape `landscapeCluster` 96px right rail holding a second `<ShutterRow isLandscape>`.
- **Overlay model:** `OverlayMode = 'anime'|'sketch'|'edge'|'subject'` (no `'off'`). "Off" = `hud.overlayVisible === false`. Live mode strip lives in `OverlayControlsBar.tsx` (`MODES` order: off, anime, edge, sketch, subject) rendered inside `OverlayDock`.
- **Zoom:** `useCameraZoom` → `{ zoom, activeStop, setStop, pinchGesture, zoomShared }`. `pinchGesture` is **independent of `ZoomDial`** and already flows to `CameraStage`. `FocalStop = 0.5|1|2|3`, `availableStops` device-derived. Dial-only extras (continuous drag, island swap, floor detent, unused AUTO button) are removed; their *capability* survives via pinch + presets.
- **EV:** `FocusExposureBar` (range −2..2, step 0.1, `roundExposureValue`); shows only when `afLocked`.
- **Layout consts:** `camera-ui.ts` (`CAMERA_TOP_BAR_CONTENT_HEIGHT=56`, `CAMERA_TOP_BAR_ROW2_HEIGHT=52`, `CAMERA_SHUTTER_ROW_HEIGHT=88`, `CAMERA_LANDSCAPE_CLUSTER_RESERVE=96`, `CAMERA_BOTTOM_BAR_CONTENT_HEIGHT=96`, `ANDROID_GESTURE_NAV_MIN_INSET=24`). `cameraChrome.ts` (`controlFill='rgba(0,0,0,0.4)'` + sizing tokens; **no scrim tokens yet**).
- **Dead code (zero imports):** `VerticalExposureSlider.tsx`, `chips/ExposureControls.tsx`, `chips/OverlayControls.tsx`.
- **Test conventions:** `bun:test`, `import { describe, expect, it } from 'bun:test'`, relative imports, pure-function tests with no mocks; component tests use `./render-helpers` + a mocked `useT`. Run via `bun test --preload ./test-setup.ts <files>`.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `libs/services/pilgrimage/overlay-carousel.ts` | Pure: the 5-item carousel model (`off/anime/edge/sketch/subject`), index↔HUD-state mapping, next/prev clamping, item lookup. |
| `libs/services/pilgrimage/zoom-presets.ts` | Pure: focal-stop label formatting (`"0.5×"`), active-stop detection. |
| `components/pilgrimage/camera/OverlayModeCarousel.tsx` | The star control: swipe/tap carousel above the shutter; glyphs rotate in landscape. |
| `components/pilgrimage/camera/ZoomPresets.tsx` | Preset pills (`availableStops`) + pinch is unchanged; one-tap ultra-wide folds in the old island swap. |
| `components/pilgrimage/camera/OverlayOpacityPill.tsx` | The `◐` opacity pill that lives in the zoom band. |
| `components/pilgrimage/camera/OverlayQuickControls.tsx` | Compact popover near the carousel when an overlay mode is active: reposition/flip + edge intensity (edge) + combine/character (subject). Replaces `OverlayControlsBar` sub-rows. |
| `components/pilgrimage/camera/GalleryThumb.tsx` | Bottom-left thumb: newest capture + count badge; tap → expand history; library import folded in. Replaces the floating `CaptureHistoryStrip` + the `ShutterRow` library button. |
| `components/pilgrimage/camera/CameraScrim.tsx` | Top + bottom gradient scrims behind chrome (legibility), full-bleed preview behind. |
| `__tests__/unit/pilgrimage/overlay-carousel.test.ts` | TDD for `overlay-carousel.ts`. |
| `__tests__/unit/pilgrimage/zoom-presets.test.ts` | TDD for `zoom-presets.ts`. |
| `__tests__/unit/pilgrimage/camera-bands.test.ts` | TDD for the new `camera-ui.ts` band + visibility resolvers + `cameraChrome` scrim tokens. |
| `__tests__/unit/pilgrimage/overlay-mode-carousel.test.tsx` | Component test for `OverlayModeCarousel`. |
| `__tests__/unit/pilgrimage/gallery-thumb.test.tsx` | Component test for `GalleryThumb`. |

### Modified files

| Path | Change |
|---|---|
| `libs/services/pilgrimage/camera-ui.ts` | Add band-layout constants + `resolveCameraBandLayout` + `resolveCameraChromeVisibility`; deprecate/replace `resolveTransientCameraHudVisibility`. |
| `components/pilgrimage/camera/cameraChrome.ts` | Add scrim color/height tokens. |
| `components/pilgrimage/camera/CameraTopBar.tsx` | Consolidate the contextual icon set (flash/timer/aspect/capture-mode/orientation/settings) into one small-icon row; drop the Row-2 chip strip. |
| `components/pilgrimage/camera/ShutterRow.tsx` | Drop the internal library button (moves to `GalleryThumb`); keep shutter + flip; keep `animateCapture`/`shutter-pulse`. Bottom row stays at bottom in both orientations (glyphs rotate, no vertical column). |
| `components/pilgrimage/camera/FocusExposureBar.tsx` | Reposition/restyle as a transient sun-slider anchored near the focus reticle. |
| `app/(tabs)/pilgrimage/compare/[spotId].tsx` | Replace floating-layer stack + `OverlayDock` + `landscapeCluster` with top bar + scrim + 3 fixed bottom bands consuming the new resolvers + new components. |
| `__tests__/unit/pilgrimage/camera-ui.test.ts` | Migrate the `resolveTransientCameraHudVisibility` test to the new visibility resolver. |
| `libs/i18n/locales/en.json` + `zh-Hant.json` | Add new keys (carousel a11y, gallery thumb, opacity pill, immersive tap-to-reveal). |

### Removed files (Phase 7, grep-verified)

| Path | Why |
|---|---|
| `components/pilgrimage/camera/OverlayDock.tsx` | Carousel + popover replace it. |
| `components/pilgrimage/camera/OverlayControlsBar.tsx` | Carousel + `OverlayQuickControls` replace it. |
| `components/pilgrimage/camera/chips/OverlayControls.tsx` | Already dead. |
| `components/pilgrimage/camera/VerticalExposureSlider.tsx` | Already dead. |
| `components/pilgrimage/camera/chips/ExposureControls.tsx` | Already dead. |
| `components/pilgrimage/camera/ZoomDial.tsx` | Replaced by `ZoomPresets`. |
| `components/pilgrimage/camera/CaptureHistoryStrip.tsx` | Folded into `GalleryThumb`. |
| `libs/services/pilgrimage/zoom-dial.ts` + `__tests__/unit/pilgrimage/zoom-dial.test.ts` | Only `ZoomDial` consumed it — orphaned once the dial is gone. (Grep-verify; keep only if another importer appears.) |
| `chips/AspectChip.tsx`, `chips/CountdownChip.tsx`, `chips/OrientationChip.tsx` | Row-2 chips removed; their cycle logic moves into the top-bar icon handlers. (Grep-verify before deleting.) |

---

## Phase 0 — Safety net & branch hygiene

### Task 0: Confirm green baseline

**Files:** none (verification only)

- [ ] **Step 1: Run the full camera suite and record the pass count**

Run:
```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/ __tests__/unit/alignment-scoring.test.ts __tests__/unit/composite-hdr-align.test.ts
```
Expected: all pass (baseline was 90 pass / 0 fail across the 6 core camera files; the full `pilgrimage/` dir is a superset). Record the number.

- [ ] **Step 2: Confirm type-check baseline**

Run: `bunx tsc --noEmit`
Expected: exits 0 (or the same pre-existing errors as `main` — note any so we don't blame them on this work).

- [ ] **Step 3: Commit a checkpoint marker (no code change)** — skip if working tree already clean on `camera-device-orientation`.

---

## Phase 1 — Pure logic (strict TDD)

> This is where `/tdd` applies hardest. Each module: write the failing test, watch it fail, minimal impl, watch it pass, refactor, commit.

### Task 1: Overlay carousel model

**Files:**
- Create: `libs/services/pilgrimage/overlay-carousel.ts`
- Test: `__tests__/unit/pilgrimage/overlay-carousel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/unit/pilgrimage/overlay-carousel.test.ts
import { describe, expect, it } from 'bun:test';
import {
  OVERLAY_CAROUSEL_ITEMS,
  overlayCarouselIndex,
  overlaySelectionForIndex,
  clampOverlayIndex,
  nextOverlayIndex,
  prevOverlayIndex,
  overlayCarouselItemAt,
} from '../../../libs/services/pilgrimage/overlay-carousel';

describe('overlay carousel model', () => {
  it('orders the five items Off · Anime · Edge · Sketch · Subject', () => {
    expect(OVERLAY_CAROUSEL_ITEMS.map((i) => i.id)).toEqual(['off', 'anime', 'edge', 'sketch', 'subject']);
  });

  it('carries an icon and an i18n label key for every item', () => {
    for (const item of OVERLAY_CAROUSEL_ITEMS) {
      expect(typeof item.icon).toBe('string');
      expect(item.icon.length).toBeGreaterThan(0);
      expect(typeof item.labelKey).toBe('string');
      expect(item.labelKey.length).toBeGreaterThan(0);
    }
  });

  it('maps a hidden overlay to the Off slot regardless of the retained mode', () => {
    expect(overlayCarouselIndex({ overlayVisible: false, overlayMode: 'edge' })).toBe(0);
    expect(overlayCarouselIndex({ overlayVisible: false, overlayMode: 'subject' })).toBe(0);
  });

  it('maps a visible overlay to its mode slot', () => {
    expect(overlayCarouselIndex({ overlayVisible: true, overlayMode: 'anime' })).toBe(1);
    expect(overlayCarouselIndex({ overlayVisible: true, overlayMode: 'edge' })).toBe(2);
    expect(overlayCarouselIndex({ overlayVisible: true, overlayMode: 'sketch' })).toBe(3);
    expect(overlayCarouselIndex({ overlayVisible: true, overlayMode: 'subject' })).toBe(4);
  });

  it('turns the Off slot into a visibility-off patch that keeps the previous mode', () => {
    expect(overlaySelectionForIndex(0)).toEqual({ overlayVisible: false });
  });

  it('turns a mode slot into a visible + mode patch', () => {
    expect(overlaySelectionForIndex(2)).toEqual({ overlayVisible: true, overlayMode: 'edge' });
    expect(overlaySelectionForIndex(4)).toEqual({ overlayVisible: true, overlayMode: 'subject' });
  });

  it('clamps indices into range and rejects non-finite input', () => {
    expect(clampOverlayIndex(-3)).toBe(0);
    expect(clampOverlayIndex(99)).toBe(4);
    expect(clampOverlayIndex(2.6)).toBe(3);
    expect(clampOverlayIndex(Number.NaN)).toBe(0);
  });

  it('steps next/prev with clamping (no wrap at the ends)', () => {
    expect(nextOverlayIndex(0)).toBe(1);
    expect(nextOverlayIndex(4)).toBe(4);
    expect(prevOverlayIndex(4)).toBe(3);
    expect(prevOverlayIndex(0)).toBe(0);
  });

  it('looks up the item at a clamped index', () => {
    expect(overlayCarouselItemAt(0).id).toBe('off');
    expect(overlayCarouselItemAt(99).id).toBe('subject');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/overlay-carousel.test.ts`
Expected: FAIL — module `overlay-carousel` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// libs/services/pilgrimage/overlay-carousel.ts
import type { OverlayMode } from '../../../components/pilgrimage/camera/types';
import type { TranslationKey } from '../../i18n';

/** Carousel slot ids: the four overlay modes plus the synthetic 'off' slot. */
export type OverlayCarouselId = OverlayMode | 'off';

export interface OverlayCarouselItem {
  id: OverlayCarouselId;
  /** Ionicons glyph name; cast to `keyof typeof Ionicons.glyphMap` at the component boundary. */
  icon: string;
  labelKey: TranslationKey;
}

/** Order mirrors the legacy OverlayControlsBar MODES strip. */
export const OVERLAY_CAROUSEL_ITEMS: readonly OverlayCarouselItem[] = [
  { id: 'off', icon: 'eye-off-outline', labelKey: 'common.off' },
  { id: 'anime', icon: 'image-outline', labelKey: 'commonUi.anime' },
  { id: 'edge', icon: 'analytics-outline', labelKey: 'pilgrimageUi.edge' },
  { id: 'sketch', icon: 'pencil-outline', labelKey: 'pilgrimageUi.sketch' },
  { id: 'subject', icon: 'person-outline', labelKey: 'pilgrimageUi.subject' },
] as const;

export interface OverlayCarouselState {
  overlayVisible: boolean;
  overlayMode: OverlayMode;
}

export interface OverlayCarouselSelection {
  overlayVisible: boolean;
  overlayMode?: OverlayMode;
}

export function clampOverlayIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.round(index), OVERLAY_CAROUSEL_ITEMS.length - 1));
}

export function overlayCarouselIndex({ overlayVisible, overlayMode }: OverlayCarouselState): number {
  if (!overlayVisible) return 0;
  const idx = OVERLAY_CAROUSEL_ITEMS.findIndex((item) => item.id === overlayMode);
  return idx <= 0 ? 1 : idx; // a visible overlay never resolves to the Off slot
}

export function overlaySelectionForIndex(index: number): OverlayCarouselSelection {
  const item = OVERLAY_CAROUSEL_ITEMS[clampOverlayIndex(index)];
  if (item.id === 'off') return { overlayVisible: false };
  return { overlayVisible: true, overlayMode: item.id };
}

export function nextOverlayIndex(index: number): number {
  return clampOverlayIndex(clampOverlayIndex(index) + 1);
}

export function prevOverlayIndex(index: number): number {
  return clampOverlayIndex(clampOverlayIndex(index) - 1);
}

export function overlayCarouselItemAt(index: number): OverlayCarouselItem {
  return OVERLAY_CAROUSEL_ITEMS[clampOverlayIndex(index)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/overlay-carousel.test.ts`
Expected: PASS (all assertions). If `common.off` / `commonUi.anime` / `pilgrimageUi.edge|sketch|subject` are not valid `TranslationKey`s, tsc (Task end) will flag — they are confirmed present in `en.json`.

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/overlay-carousel.ts __tests__/unit/pilgrimage/overlay-carousel.test.ts
git commit -m "feat(camera): pure overlay-carousel model (off/anime/edge/sketch/subject)"
```

### Task 2: Zoom preset formatting + active detection

**Files:**
- Create: `libs/services/pilgrimage/zoom-presets.ts`
- Test: `__tests__/unit/pilgrimage/zoom-presets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/unit/pilgrimage/zoom-presets.test.ts
import { describe, expect, it } from 'bun:test';
import { formatFocalStopLabel, isFocalStopActive } from '../../../libs/services/pilgrimage/zoom-presets';

describe('zoom presets', () => {
  it('formats focal stops with the multiplication sign', () => {
    expect(formatFocalStopLabel(0.5)).toBe('0.5×');
    expect(formatFocalStopLabel(1)).toBe('1×');
    expect(formatFocalStopLabel(2)).toBe('2×');
    expect(formatFocalStopLabel(3)).toBe('3×');
  });

  it('marks the active stop only on an exact match', () => {
    expect(isFocalStopActive(1, 1)).toBe(true);
    expect(isFocalStopActive(0.5, 1)).toBe(false);
    expect(isFocalStopActive(3, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/zoom-presets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// libs/services/pilgrimage/zoom-presets.ts
import type { FocalStop } from '../../../components/pilgrimage/camera/types';

/** "0.5×" / "1×" / "3×" — Samsung-style preset chip label. */
export function formatFocalStopLabel(stop: FocalStop): string {
  return `${stop}×`;
}

export function isFocalStopActive(stop: FocalStop, activeStop: FocalStop | null): boolean {
  return activeStop === stop;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/zoom-presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/zoom-presets.ts __tests__/unit/pilgrimage/zoom-presets.test.ts
git commit -m "feat(camera): pure zoom-preset label/active helpers"
```

### Task 3: Band layout + chrome visibility resolvers + scrim tokens

**Files:**
- Modify: `libs/services/pilgrimage/camera-ui.ts` (append new exports; do not touch existing ones)
- Modify: `components/pilgrimage/camera/cameraChrome.ts` (append scrim tokens)
- Test: `__tests__/unit/pilgrimage/camera-bands.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/unit/pilgrimage/camera-bands.test.ts
import { describe, expect, it } from 'bun:test';
import {
  CAMERA_ZOOM_BAND_HEIGHT,
  CAMERA_CAROUSEL_BAND_HEIGHT,
  CAMERA_BOTTOM_ROW_HEIGHT,
  CAMERA_BAND_GAP,
  resolveCameraBandLayout,
  resolveCameraChromeVisibility,
} from '../../../libs/services/pilgrimage/camera-ui';
import { CameraChrome } from '../../../components/pilgrimage/camera/cameraChrome';

describe('camera band layout', () => {
  it('stacks shutter → carousel → zoom from the bottom inset without overlap', () => {
    const l = resolveCameraBandLayout({ bottomInset: 20, showZoomBand: true });
    expect(l.shutterRowBottom).toBe(20);
    expect(l.shutterRowHeight).toBe(CAMERA_BOTTOM_ROW_HEIGHT);
    expect(l.carouselBottom).toBe(20 + CAMERA_BOTTOM_ROW_HEIGHT + CAMERA_BAND_GAP);
    expect(l.zoomBandBottom).toBe(l.carouselBottom + CAMERA_CAROUSEL_BAND_HEIGHT + CAMERA_BAND_GAP);
    // no overlap: each band's bottom is at/above the previous band's top
    expect(l.carouselBottom).toBeGreaterThanOrEqual(l.shutterRowBottom + l.shutterRowHeight);
    expect(l.zoomBandBottom).toBeGreaterThanOrEqual(l.carouselBottom + l.carouselHeight);
  });

  it('produces the SAME stacking math regardless of orientation (no side-column reflow)', () => {
    // layout takes no isLandscape input — identical bottom geometry both ways
    const a = resolveCameraBandLayout({ bottomInset: 0, showZoomBand: true });
    const b = resolveCameraBandLayout({ bottomInset: 0, showZoomBand: true });
    expect(a).toEqual(b);
  });

  it('drops the zoom band from the total chrome height when it is hidden', () => {
    const shown = resolveCameraBandLayout({ bottomInset: 0, showZoomBand: true });
    const hidden = resolveCameraBandLayout({ bottomInset: 0, showZoomBand: false });
    expect(hidden.totalBottomChromeHeight).toBeLessThan(shown.totalBottomChromeHeight);
    expect(shown.totalBottomChromeHeight).toBe(
      CAMERA_BOTTOM_ROW_HEIGHT + CAMERA_BAND_GAP + CAMERA_CAROUSEL_BAND_HEIGHT + CAMERA_BAND_GAP + CAMERA_ZOOM_BAND_HEIGHT,
    );
    expect(hidden.totalBottomChromeHeight).toBe(
      CAMERA_BOTTOM_ROW_HEIGHT + CAMERA_BAND_GAP + CAMERA_CAROUSEL_BAND_HEIGHT,
    );
  });
});

describe('camera chrome visibility (immersive by subtraction)', () => {
  it('shows everything relevant in portrait', () => {
    const v = resolveCameraChromeVisibility({ isLandscape: false, immersive: true, afLocked: true, overlayActive: true });
    expect(v.showZoomBand).toBe(true);
    expect(v.showOpacityPill).toBe(true);
    expect(v.showTopContextIcons).toBe(true);
    expect(v.showCaptureHistory).toBe(true);
    expect(v.showOverlayQuickControls).toBe(true);
  });

  it('subtracts secondary controls only in landscape immersive, keeping shutter+carousel+alignment', () => {
    const v = resolveCameraChromeVisibility({ isLandscape: true, immersive: true, afLocked: false, overlayActive: true });
    expect(v.showZoomBand).toBe(false);
    expect(v.showOpacityPill).toBe(false);
    expect(v.showTopContextIcons).toBe(false);
    expect(v.showCaptureHistory).toBe(false);
    expect(v.showAutoCaptureBadge).toBe(true); // alignment readout stays
  });

  it('reveals everything again in landscape when not immersive', () => {
    const v = resolveCameraChromeVisibility({ isLandscape: true, immersive: false, afLocked: false, overlayActive: true });
    expect(v.showZoomBand).toBe(true);
    expect(v.showTopContextIcons).toBe(true);
  });

  it('gates the opacity pill and quick-controls on an active overlay', () => {
    const off = resolveCameraChromeVisibility({ isLandscape: false, immersive: false, afLocked: false, overlayActive: false });
    expect(off.showOpacityPill).toBe(false);
    expect(off.showOverlayQuickControls).toBe(false);
  });

  it('shows the transient focus/EV bar only while AF is locked', () => {
    expect(resolveCameraChromeVisibility({ isLandscape: false, immersive: false, afLocked: true, overlayActive: false }).showFocusExposureBar).toBe(true);
    expect(resolveCameraChromeVisibility({ isLandscape: false, immersive: false, afLocked: false, overlayActive: false }).showFocusExposureBar).toBe(false);
  });
});

describe('camera scrim tokens', () => {
  it('keeps the always-glass control fill pinned', () => {
    expect(CameraChrome.controlFill).toBe('rgba(0,0,0,0.4)');
  });

  it('exposes top and bottom scrim gradients that fade to transparent', () => {
    expect(Array.isArray(CameraChrome.scrimTopColors)).toBe(true);
    expect(Array.isArray(CameraChrome.scrimBottomColors)).toBe(true);
    expect(CameraChrome.scrimTopColors).toContain('rgba(0,0,0,0)');
    expect(CameraChrome.scrimBottomColors).toContain('rgba(0,0,0,0)');
    expect(CameraChrome.scrimTopHeight).toBeGreaterThan(0);
    expect(CameraChrome.scrimBottomHeight).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-bands.test.ts`
Expected: FAIL — new exports / tokens undefined.

- [ ] **Step 3a: Append band + visibility resolvers to `camera-ui.ts`**

Append at end of `libs/services/pilgrimage/camera-ui.ts` (keep all existing exports untouched):

```ts
// ── Banded chrome layout (Samsung-style; identical in both orientations) ──────

/** Zoom band: preset pills + opacity pill. */
export const CAMERA_ZOOM_BAND_HEIGHT = 44;
/** Overlay-mode carousel band (the primary control). */
export const CAMERA_CAROUSEL_BAND_HEIGHT = 48;
/** Bottom row: gallery | shutter | flip. */
export const CAMERA_BOTTOM_ROW_HEIGHT = 88;
/** Vertical breathing room between stacked bands. */
export const CAMERA_BAND_GAP = 8;

export interface CameraBandLayoutInput {
  /** Safe-area bottom already resolved via resolveCameraBottomInset. */
  bottomInset: number;
  /** Whether the zoom band participates in the stack. */
  showZoomBand: boolean;
}

export interface CameraBandLayout {
  shutterRowBottom: number;
  shutterRowHeight: number;
  carouselBottom: number;
  carouselHeight: number;
  zoomBandBottom: number;
  zoomBandHeight: number;
  /** Height of the whole bottom chrome cluster from the inset up; drives AlignmentHUD reserve. */
  totalBottomChromeHeight: number;
}

export function resolveCameraBandLayout(input: CameraBandLayoutInput): CameraBandLayout {
  const shutterRowBottom = input.bottomInset;
  const carouselBottom = shutterRowBottom + CAMERA_BOTTOM_ROW_HEIGHT + CAMERA_BAND_GAP;
  const zoomBandBottom = carouselBottom + CAMERA_CAROUSEL_BAND_HEIGHT + CAMERA_BAND_GAP;
  const totalBottomChromeHeight = input.showZoomBand
    ? CAMERA_BOTTOM_ROW_HEIGHT + CAMERA_BAND_GAP + CAMERA_CAROUSEL_BAND_HEIGHT + CAMERA_BAND_GAP + CAMERA_ZOOM_BAND_HEIGHT
    : CAMERA_BOTTOM_ROW_HEIGHT + CAMERA_BAND_GAP + CAMERA_CAROUSEL_BAND_HEIGHT;
  return {
    shutterRowBottom,
    shutterRowHeight: CAMERA_BOTTOM_ROW_HEIGHT,
    carouselBottom,
    carouselHeight: CAMERA_CAROUSEL_BAND_HEIGHT,
    zoomBandBottom,
    zoomBandHeight: CAMERA_ZOOM_BAND_HEIGHT,
    totalBottomChromeHeight,
  };
}

export interface CameraChromeVisibilityInput {
  isLandscape: boolean;
  /** Immersive intent (auto-on in landscape; toggled off by a tap-reveal). */
  immersive: boolean;
  afLocked: boolean;
  /** An overlay mode is selected (overlayVisible === true). */
  overlayActive: boolean;
}

export interface CameraChromeVisibility {
  showZoomBand: boolean;
  showOpacityPill: boolean;
  showTopContextIcons: boolean;
  showCaptureHistory: boolean;
  showAutoCaptureBadge: boolean;
  showFocusExposureBar: boolean;
  showOverlayQuickControls: boolean;
}

/**
 * Immersive-by-subtraction: chrome is ALWAYS glass (never an opacity change). In landscape
 * immersive we hide the secondary controls (zoom band, opacity, top contextual icons,
 * capture history), leaving shutter + carousel + alignment readout. A tap restores `immersive=false`.
 */
export function resolveCameraChromeVisibility(input: CameraChromeVisibilityInput): CameraChromeVisibility {
  const secondaryHidden = input.isLandscape && input.immersive;
  return {
    showZoomBand: !secondaryHidden,
    showOpacityPill: !secondaryHidden && input.overlayActive,
    showTopContextIcons: !secondaryHidden,
    showCaptureHistory: !secondaryHidden,
    showAutoCaptureBadge: true,
    showFocusExposureBar: input.afLocked,
    showOverlayQuickControls: input.overlayActive,
  };
}
```

- [ ] **Step 3b: Append scrim tokens to `cameraChrome.ts`**

Add these keys inside the `CameraChrome` object literal in `components/pilgrimage/camera/cameraChrome.ts` (after the existing tokens, before the closing `}`):

```ts
  // Faint top/bottom gradient scrims behind chrome bands so glass controls stay
  // legible over bright outdoor scenes; the live preview still runs full-bleed behind.
  scrimTopColors: ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'],
  scrimBottomColors: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)'],
  scrimTopHeight: 140,
  scrimBottomHeight: 240,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-bands.test.ts`
Expected: PASS.

- [ ] **Step 5: Migrate the legacy visibility test, then run camera-ui suite**

In `__tests__/unit/pilgrimage/camera-ui.test.ts`, the `resolveTransientCameraHudVisibility` test (the `'hides transient HUD layers while the overlay dock is open'` case) targets a function being removed with the dock. Replace that single `it(...)` block with a re-export check that the new resolver is the source of truth (leave all other camera-ui tests intact):

```ts
  it('keeps the transient focus/EV bar gated on AF lock via the chrome visibility resolver', () => {
    expect(resolveCameraChromeVisibility({ isLandscape: false, immersive: false, afLocked: true, overlayActive: false }).showFocusExposureBar).toBe(true);
    expect(resolveCameraChromeVisibility({ isLandscape: false, immersive: false, afLocked: false, overlayActive: false }).showFocusExposureBar).toBe(false);
  });
```
(Add `resolveCameraChromeVisibility` to the import block at the top of `camera-ui.test.ts`; remove the now-unused `resolveTransientCameraHudVisibility` import only if nothing else in the file uses it.)

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-ui.test.ts __tests__/unit/pilgrimage/camera-bands.test.ts`
Expected: PASS (both files).

> Note: `resolveTransientCameraHudVisibility` stays defined in `camera-ui.ts` until Phase 3 removes its last caller in `[spotId].tsx`; delete the function in Phase 7 cleanup.

- [ ] **Step 6: Commit**

```bash
git add libs/services/pilgrimage/camera-ui.ts components/pilgrimage/camera/cameraChrome.ts __tests__/unit/pilgrimage/camera-bands.test.ts __tests__/unit/pilgrimage/camera-ui.test.ts
git commit -m "feat(camera): banded layout + immersive visibility resolvers + scrim tokens"
```

### Task 4: Type-check the pure-logic phase

- [ ] **Step 1: Run tsc**

Run: `bunx tsc --noEmit`
Expected: exits 0 (or only pre-existing baseline errors from Task 0). If `commonUi.anime`/`common.off`/`pilgrimageUi.*` fail `TranslationKey` inference, fix the key strings to the exact catalog keys.

- [ ] **Step 2: Run the full camera suite**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/`
Expected: all pass (baseline count + the 3 new files' tests).

---

## Phase 2 — New presentation components (built against tested logic, not yet wired)

> These are built and (where they have logic) unit-tested, but `[spotId].tsx` is not changed until Phase 3, so the app keeps working throughout. Match existing patterns: `CameraChrome`/`cameraControlShadow` tokens, `hapticsBridge`, `useT()`, `Ionicons`, theme accent via the `themeColor` prop (already how the camera passes accent into chrome).

### Task 5: `OverlayModeCarousel` — the star control

**Files:**
- Create: `components/pilgrimage/camera/OverlayModeCarousel.tsx`
- Test: `__tests__/unit/pilgrimage/overlay-mode-carousel.test.tsx`

**Behavior:** horizontal strip of the 5 items with ‹ › chevrons; tap an item or a chevron to change index; left/right swipe (pan gesture) steps prev/next via `nextOverlayIndex`/`prevOverlayIndex`; the active item is filled with `themeColor` (fg via `readableTextOn`); glyphs + labels rotate ±90° in landscape (`isLandscape` + `orientationMode`); each item has an a11y label/`selected` state. It reports only an index via `onChangeIndex`; the screen translates that to the HUD patch via `overlaySelectionForIndex`.

- [ ] **Step 1: Write the failing component test**

```tsx
// __tests__/unit/pilgrimage/overlay-mode-carousel.test.tsx
import { describe, expect, it } from 'bun:test';
import { render, findAll } from './render-helpers';
// mock useT to an English-catalog lookup (mirror camera-overlay-controls.test.tsx pattern)
import en from '../../../libs/i18n/locales/en.json';
import { mock } from 'bun:test';
mock.module('../../../libs/i18n', () => ({
  useT: () => (key: string) => key.split('.').reduce((o: any, k) => (o ? o[k] : undefined), en as any) ?? key,
}));
import OverlayModeCarousel from '../../../components/pilgrimage/camera/OverlayModeCarousel';

describe('overlay mode carousel', () => {
  it('renders all five slots with the active one selected', () => {
    let nextIndex = -1;
    const tree = render(
      <OverlayModeCarousel index={2} onChangeIndex={(i: number) => (nextIndex = i)} themeColor="#ff9900" isLandscape={false} orientationMode="auto" />,
    );
    const selected = findAll(tree, (n: any) => n.props?.accessibilityState?.selected === true);
    expect(selected.length).toBe(1);
  });

  it('reports the tapped slot index', () => {
    let nextIndex = -1;
    const tree = render(
      <OverlayModeCarousel index={0} onChangeIndex={(i: number) => (nextIndex = i)} themeColor="#ff9900" isLandscape={false} orientationMode="auto" />,
    );
    const animeSlot = findAll(tree, (n: any) => n.props?.accessibilityLabel && /Anime/.test(String(n.props.accessibilityLabel)))[0];
    expect(animeSlot).toBeTruthy();
    animeSlot.props.onPress();
    expect(nextIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/overlay-mode-carousel.test.tsx`
Expected: FAIL — component not found.

> If `render-helpers` does not expose `findAll`, check `__tests__/unit/pilgrimage/render-helpers.*` (used by `camera-overlay-controls.test.tsx`) and use whatever traversal helper it exports (e.g. `findAllByPredicate`); adjust the import to match. Do NOT invent a helper.

- [ ] **Step 3: Implement `OverlayModeCarousel.tsx`**

```tsx
// components/pilgrimage/camera/OverlayModeCarousel.tsx
import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { useT } from '../../../libs/i18n';
import { readableTextOn } from '../../themed';
import {
  OVERLAY_CAROUSEL_ITEMS,
  nextOverlayIndex,
  prevOverlayIndex,
  clampOverlayIndex,
} from '../../../libs/services/pilgrimage/overlay-carousel';
import type { CameraOrientationMode } from '../../../libs/services/pilgrimage/camera-ui';
import { CameraChrome, cameraControlShadow } from './cameraChrome';

interface OverlayModeCarouselProps {
  index: number;
  onChangeIndex: (index: number) => void;
  themeColor: string;
  isLandscape: boolean;
  orientationMode: CameraOrientationMode;
}

function OverlayModeCarouselComponent({ index, onChangeIndex, themeColor, isLandscape, orientationMode }: OverlayModeCarouselProps) {
  const t = useT();
  const active = clampOverlayIndex(index);
  // glyphs rotate in place only when the interface is landscape-locked (LAND); AUTO keeps UI portrait.
  const rotate = isLandscape && orientationMode === 'landscape' ? '90deg' : '0deg';

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .onEnd((e) => {
          'worklet';
          if (e.translationX <= -24) return;
        }),
    [],
  );
  // NOTE: index stepping runs on the JS thread via runOnJS; see onEnd wiring below.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .runOnJS(true)
        .onEnd((e) => {
          if (e.translationX <= -24) {
            const ni = nextOverlayIndex(active);
            if (ni !== active) { hapticsBridge.selection(); onChangeIndex(ni); }
          } else if (e.translationX >= 24) {
            const pi = prevOverlayIndex(active);
            if (pi !== active) { hapticsBridge.selection(); onChangeIndex(pi); }
          }
        }),
    [active, onChangeIndex],
  );

  const step = (target: number) => {
    const ci = clampOverlayIndex(target);
    if (ci === active) return;
    hapticsBridge.selection();
    onChangeIndex(ci);
  };

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={styles.root} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimageUi.overlayModeA11y')}
          onPress={() => step(prevOverlayIndex(active))}
          hitSlop={8}
          style={styles.chevron}
        >
          <Ionicons name="chevron-back" size={18} color={CameraChrome.fg} />
        </Pressable>
        <View style={styles.items} pointerEvents="box-none">
          {OVERLAY_CAROUSEL_ITEMS.map((item, i) => {
            const selected = i === active;
            const label = t(item.labelKey);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                onPress={() => step(i)}
                style={[styles.item, selected && { backgroundColor: themeColor }, cameraControlShadow]}
              >
                <Ionicons
                  name={item.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={selected ? readableTextOn(themeColor) : CameraChrome.fg}
                  style={{ transform: [{ rotate }] }}
                />
                {selected ? (
                  <Text style={[styles.label, { color: readableTextOn(themeColor), transform: [{ rotate }] }]} numberOfLines={1}>
                    {label}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimageUi.overlayModeA11y')}
          onPress={() => step(nextOverlayIndex(active))}
          hitSlop={8}
          style={styles.chevron}
        >
          <Ionicons name="chevron-forward" size={18} color={CameraChrome.fg} />
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chevron: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  items: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: CameraChrome.controlHeight, paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius, backgroundColor: CameraChrome.controlFill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CameraChrome.border,
  },
  label: { fontSize: 13, fontWeight: '600' },
});

export default memo(OverlayModeCarouselComponent);
```

> The two-gesture stub in Step 3 is over-written by the real `swipeGesture` — keep only `swipeGesture` when implementing (the first `swipe` const is illustrative of the worklet pitfall; delete it). Verify `readableTextOn` is exported from `components/themed` (CLAUDE.md documents it). If `hapticsBridge` import path differs, match an existing camera component's import.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/overlay-mode-carousel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/pilgrimage/camera/OverlayModeCarousel.tsx __tests__/unit/pilgrimage/overlay-mode-carousel.test.tsx
git commit -m "feat(camera): OverlayModeCarousel primary control"
```

### Task 6: `ZoomPresets` + `OverlayOpacityPill` (the zoom band)

**Files:**
- Create: `components/pilgrimage/camera/ZoomPresets.tsx`
- Create: `components/pilgrimage/camera/OverlayOpacityPill.tsx`

**`ZoomPresets` behavior:** render one pill per `availableStops` using `formatFocalStopLabel`; active pill (via `isFocalStopActive(stop, activeStop)`) filled with `themeColor`; `onPick(stop)` → `zoom.setStop(stop)`. When `onPickUltraWide` is provided and the `0.5` pill is tapped while a standalone ultra-wide exists, call it (folds in the old island lens-swap so one-tap ultra-wide is not a regression). Glyph/label rotate in landscape-locked mode. Pinch stays in `useCameraZoom.pinchGesture` (unchanged, on `CameraStage`).

- [ ] **Step 1: Implement `ZoomPresets.tsx`**

```tsx
// components/pilgrimage/camera/ZoomPresets.tsx
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { readableTextOn } from '../../themed';
import type { FocalStop } from './types';
import { formatFocalStopLabel, isFocalStopActive } from '../../../libs/services/pilgrimage/zoom-presets';
import { CameraChrome } from './cameraChrome';

interface ZoomPresetsProps {
  stops: FocalStop[];
  activeStop: FocalStop | null;
  themeColor: string;
  onPick: (stop: FocalStop) => void;
  /** When present and the 0.5× pill is tapped on a standalone-ultra-wide device, swaps the physical lens. */
  onPickUltraWide?: () => void;
  rotateLabels?: boolean;
}

function ZoomPresetsComponent({ stops, activeStop, themeColor, onPick, onPickUltraWide, rotateLabels }: ZoomPresetsProps) {
  if (!stops.length) return null;
  const rotate = rotateLabels ? '90deg' : '0deg';
  return (
    <View style={styles.row} pointerEvents="box-none">
      {stops.map((stop) => {
        const active = isFocalStopActive(stop, activeStop);
        return (
          <Pressable
            key={stop}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={formatFocalStopLabel(stop)}
            onPress={() => {
              hapticsBridge.selection();
              if (stop === 0.5 && onPickUltraWide) onPickUltraWide();
              onPick(stop);
            }}
            style={[styles.pill, active && { backgroundColor: themeColor }]}
          >
            <Text style={[styles.label, { color: active ? readableTextOn(themeColor) : CameraChrome.fg, transform: [{ rotate }] }]}>
              {formatFocalStopLabel(stop)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: {
    minWidth: 40, height: CameraChrome.controlHeight, paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: CameraChrome.pillRadius, backgroundColor: CameraChrome.controlFill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CameraChrome.border,
  },
  label: { fontSize: 13, fontWeight: '700' },
});

export default memo(ZoomPresetsComponent);
```

- [ ] **Step 2: Implement `OverlayOpacityPill.tsx`**

The `◐` pill: a compact control that, on tap, expands an inline slider (or cycles a few opacity presets). To preserve the existing fine-grained slider control (`@react-native-community/slider`, 0..1), expand-on-tap into the same slider. Minimal honest version:

```tsx
// components/pilgrimage/camera/OverlayOpacityPill.tsx
import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useT } from '../../../libs/i18n';
import { CameraChrome } from './cameraChrome';

interface OverlayOpacityPillProps {
  opacity: number;
  themeColor: string;
  onChange: (next: number) => void;
}

function OverlayOpacityPillComponent({ opacity, themeColor, onChange }: OverlayOpacityPillProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('pilgrimageUi.overlayOpacity')}
        onPress={() => setOpen((v) => !v)}
        style={styles.pill}
      >
        <Ionicons name="contrast-outline" size={16} color={CameraChrome.fg} />
        <Text style={styles.value}>{Math.round(opacity * 100)}%</Text>
      </Pressable>
      {open ? (
        <View style={styles.sliderPanel}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={opacity}
            minimumTrackTintColor={themeColor}
            maximumTrackTintColor={CameraChrome.trackInactive}
            onValueChange={onChange}
            accessibilityLabel={t('pilgrimageUi.overlayOpacity')}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: CameraChrome.controlHeight, paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius, backgroundColor: CameraChrome.controlFill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CameraChrome.border,
  },
  value: { color: CameraChrome.fg, fontSize: 12, fontWeight: '600' },
  sliderPanel: {
    position: 'absolute', bottom: CameraChrome.controlHeight + 8, width: 200,
    backgroundColor: CameraChrome.groupFill, borderRadius: CameraChrome.groupRadius, paddingHorizontal: 8,
  },
  slider: { width: 184, height: 36 },
});

export default memo(OverlayOpacityPillComponent);
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: 0 new errors.

- [ ] **Step 4: Commit**

```bash
git add components/pilgrimage/camera/ZoomPresets.tsx components/pilgrimage/camera/OverlayOpacityPill.tsx
git commit -m "feat(camera): ZoomPresets pills + OverlayOpacityPill (zoom band)"
```

### Task 7: `OverlayQuickControls` — the compact popover

**Files:**
- Create: `components/pilgrimage/camera/OverlayQuickControls.tsx`

**Behavior:** shown near the carousel only when an overlay mode is active (`overlayActive`). Always: reposition toggle (`onToggleEdit`, icon `move-outline`/`lock-open-outline`) + flip (`onToggleFlip`, `swap-horizontal-outline`, active when `flipped`). Edge mode adds the `EDGE_INTENSITIES` segmented control (`onSelectEdgeIntensity`, labels via `edgeIntensityLabel`). Subject mode adds the Combine pill (`onToggleSubjectCombine`, `subjectCombine`) + Character pill (`onOpenCharacterPicker`, label `pickCharacter`/`swapCharacter` by `characterSelected`). **This preserves every affordance from `OverlayControlsBar`'s sub-rows** (reposition, flip, edge intensity, combine, character) plus optionally surfaces the subject-focus selector that previously had no live home (`SUBJECT_FOCI` + `subjectFocusLabel` + `onSelectSubjectFocus`) — wire it through to `persistOverlayKnob({ subjectFocus })`.

Reuse the prop names + handlers from the current `OverlayControlsBar` so the screen wiring barely changes. Mirror the `SubSegment`/`IconBtn` helper structure from `OverlayControlsBar.tsx:251-323` and its a11y labels (`repositionOverlay`/`lockOverlayPosition`, `flipOverlayHorizontally`, `combine`, `pickCharacter`/`swapCharacter`, `edgeIntensityA11y`, `subjectFocusA11y`).

- [ ] **Step 1: Implement `OverlayQuickControls.tsx`** — port the sub-row JSX from `OverlayControlsBar.tsx` (mode strip removed; only the per-mode sub-rows + reposition/flip remain), reading `EDGE_INTENSITIES`/`edgeIntensityLabel` from `libs/services/pilgrimage/edge-overlay` and `SUBJECT_FOCI`/`subjectFocusLabel` from `libs/services/pilgrimage/subject-overlay`. Props:

```ts
interface OverlayQuickControlsProps {
  mode: OverlayMode;
  edgeIntensity: EdgeIntensity;
  subjectFocus: SubjectFocus;
  subjectCombine: boolean;
  characterSelected: boolean;
  flipped: boolean;
  editMode: boolean;
  themeColor: string;
  onSelectEdgeIntensity: (i: EdgeIntensity) => void;
  onSelectSubjectFocus: (f: SubjectFocus) => void;
  onToggleSubjectCombine: () => void;
  onOpenCharacterPicker: () => void;
  onToggleFlip: () => void;
  onToggleEdit: () => void;
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add components/pilgrimage/camera/OverlayQuickControls.tsx
git commit -m "feat(camera): OverlayQuickControls popover (reposition/flip/edge/subject)"
```

### Task 8: `GalleryThumb` (bottom-left: newest + count badge + library import)

**Files:**
- Create: `components/pilgrimage/camera/GalleryThumb.tsx`
- Test: `__tests__/unit/pilgrimage/gallery-thumb.test.tsx`

**Behavior:** the merged gallery affordance replacing the floating `CaptureHistoryStrip` + `ShutterRow`'s library button.
- `uris.length === 0` → show a library/`images-outline` glyph; tap → `onPickLibrary` (import directly).
- `uris.length > 0` → show `uris[0]` thumbnail + a count badge (`uris.length`); tap → `onExpand` (the screen toggles an expanded history row reusing `CaptureHistoryStrip`); long-press → `onPickLibrary`.

Pure-ish display logic gets a tiny helper to TDD: `resolveGalleryThumb(uris) → { thumbUri: string | null; count: number; isEmpty: boolean }` (put it inside `GalleryThumb.tsx` and export it, or in `overlay-carousel.ts`'s sibling — simplest is a local export tested via the component test).

- [ ] **Step 1: Write the failing component test**

```tsx
// __tests__/unit/pilgrimage/gallery-thumb.test.tsx
import { describe, expect, it } from 'bun:test';
import { render, findAll } from './render-helpers';
import GalleryThumb, { resolveGalleryThumb } from '../../../components/pilgrimage/camera/GalleryThumb';

describe('gallery thumb model', () => {
  it('is empty with no captures', () => {
    expect(resolveGalleryThumb([])).toEqual({ thumbUri: null, count: 0, isEmpty: true });
  });
  it('uses the newest uri and the count when captures exist', () => {
    expect(resolveGalleryThumb(['a', 'b', 'c'])).toEqual({ thumbUri: 'a', count: 3, isEmpty: false });
  });
});

describe('gallery thumb component', () => {
  it('imports from library directly when empty', () => {
    let imported = 0;
    const tree = render(<GalleryThumb uris={[]} themeColor="#ff9900" onSelect={() => {}} onPickLibrary={() => (imported += 1)} onExpand={() => {}} />);
    const btn = findAll(tree, (n: any) => typeof n.props?.onPress === 'function')[0];
    btn.props.onPress();
    expect(imported).toBe(1);
  });
  it('expands history when captures exist', () => {
    let expanded = 0;
    const tree = render(<GalleryThumb uris={['a', 'b']} themeColor="#ff9900" onSelect={() => {}} onPickLibrary={() => {}} onExpand={() => (expanded += 1)} />);
    const btn = findAll(tree, (n: any) => typeof n.props?.onPress === 'function')[0];
    btn.props.onPress();
    expect(expanded).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/gallery-thumb.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `GalleryThumb.tsx`** with `resolveGalleryThumb` exported, an `expo-image` thumbnail, a count `Text` badge, empty-state `images-outline` glyph (honest empty state — no fake thumbnail), `onPress` = `isEmpty ? onPickLibrary : onExpand`, `onLongPress` = `onPickLibrary`, a11y labels `pilgrimageUi.openRecentCapture` / `pilgrimageUi.pickPhotoFromLibrary`.

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/pilgrimage/camera/GalleryThumb.tsx __tests__/unit/pilgrimage/gallery-thumb.test.tsx
git commit -m "feat(camera): GalleryThumb (newest+badge+library import)"
```

### Task 9: `CameraScrim`

**Files:**
- Create: `components/pilgrimage/camera/CameraScrim.tsx`

**Behavior:** two `expo-linear-gradient` `LinearGradient`s (top + bottom), `pointerEvents="none"`, `position:'absolute'`, using `CameraChrome.scrimTopColors/scrimBottomColors/scrimTopHeight/scrimBottomHeight`. Full-bleed preview shows through. Props: none beyond optional `topHeight`/`bottomHeight` overrides (default to the tokens). Reuse the `LinearGradient` import already used by `CameraStage.tsx`.

- [ ] **Step 1: Implement `CameraScrim.tsx`.**
- [ ] **Step 2: Type-check** — `bunx tsc --noEmit` → 0 new errors.
- [ ] **Step 3: Commit** — `git commit -m "feat(camera): CameraScrim top/bottom legibility gradients"`.

---

## Phase 3 — Restructure `[spotId].tsx` into the banded layout (the big one)

> Gated by `bunx tsc --noEmit` + the full camera suite + the parity test. State ownership unchanged. Work in small commits; after each, run tsc + the parity test. **Do not introduce the strings `react-native-vision-camera/lib/` or `frameProcessor`** (parity test #1).

### Task 10: Add the immersive + carousel-index plumbing (no visual change yet)

**Files:**
- Modify: `app/(tabs)/pilgrimage/compare/[spotId].tsx`

- [ ] **Step 1:** Add an `immersive` UI flag. Default `false`; in landscape, default to `true` (auto-immersive), and a preview tap (extend the existing `tapFocus` flow OR a dedicated tap on chrome) sets it `false` to reveal. Store as `hud` field if cross-render needed, else local `useState`. (Smallest change: local `const [immersive, setImmersive] = useState(false)` + `useEffect` that sets it to `isLandscape` when orientation changes; a chrome tap toggles it.)
- [ ] **Step 2:** Compute `const carouselIndex = overlayCarouselIndex({ overlayVisible, overlayMode })` and `const overlayActive = overlayVisible` and `const chrome = resolveCameraChromeVisibility({ isLandscape, immersive, afLocked: tapFocus.afLocked, overlayActive })` and `const bands = resolveCameraBandLayout({ bottomInset: safeAreaBottomPad, showZoomBand: chrome.showZoomBand })`. Import the helpers from `camera-ui` + `overlay-carousel`.
- [ ] **Step 3:** Add a handler `const handleCarouselChange = (i: number) => { const sel = overlaySelectionForIndex(i); setHud(sel.overlayVisible ? { overlayVisible: true } : { overlayVisible: false }); if (sel.overlayMode) { setHud({ overlayMode: sel.overlayMode }); persistOverlayKnob({ overlayMode: sel.overlayMode }); } /* fire the existing switch toast via setHud as today */ }`. Preserve the current toast behavior from `onSelectMode`/`onSelectOff`.
- [ ] **Step 4: Type-check + parity** — `bunx tsc --noEmit && bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-feature-parity.test.tsx` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "refactor(camera): compute band layout + carousel index (no UI change)"`.

### Task 11: Insert the scrim + render the bottom bands

**Files:**
- Modify: `app/(tabs)/pilgrimage/compare/[spotId].tsx`

- [ ] **Step 1:** Render `<CameraScrim />` right after `<OverlayLayer>` (so chrome above it stays legible). It is `pointerEvents="none"`.
- [ ] **Step 2:** Add a **zoom band** absolutely positioned at `bottom: bands.zoomBandBottom`, `left/right` full width, centered row, rendered only when `chrome.showZoomBand`. Contents: `<ZoomPresets stops={availableStops} activeStop={zoom.activeStop} themeColor={themeColor} onPick={zoom.setStop} onPickUltraWide={cohortHint.hasStandaloneUltraWide ? () => handleRequestSwitch('ultra-wide') : undefined} rotateLabels={isLandscape && orientationMode==='landscape'} />` + (when `chrome.showOpacityPill`) `<OverlayOpacityPill opacity={overlayOpacity} themeColor={themeColor} onChange={(o) => setHud({ overlayOpacity: o })} />`. (Match `handleRequestSwitch`'s real signature from the screen; if it takes a target lens enum, pass the correct value.)
- [ ] **Step 3:** Add the **carousel band** at `bottom: bands.carouselBottom`: `<OverlayModeCarousel index={carouselIndex} onChangeIndex={handleCarouselChange} themeColor={themeColor} isLandscape={isLandscape} orientationMode={orientationMode} />`. Next to it, when `chrome.showOverlayQuickControls`, render `<OverlayQuickControls ... />` wired to the same handlers the old `OverlayControlsBar` used (`onToggleEdit={handleToggleEdit}`, `onToggleFlip={overlayTransform.toggleFlip}`, `onSelectEdgeIntensity={(i)=>persistOverlayKnob({edgeIntensity:i})}`, `onToggleSubjectCombine`, `onOpenCharacterPicker={()=>setCharacterPickerOpen(true)}`, `onSelectSubjectFocus={(f)=>persistOverlayKnob({subjectFocus:f})}`).
- [ ] **Step 4:** Keep the existing `portraitBottomPanel` `<ShutterRow>` for now (do not delete yet). Type-check + run app mentally: the new bands now sit above the old shutter row. Don't remove the old layers in this task.
- [ ] **Step 5: Type-check + full camera suite** — `bunx tsc --noEmit && bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(camera): render scrim + zoom/carousel bands"`.

### Task 12: Make the bottom row fixed in both orientations; wire GalleryThumb; remove OverlayDock + landscapeCluster

**Files:**
- Modify: `app/(tabs)/pilgrimage/compare/[spotId].tsx`

- [ ] **Step 1:** Replace the two `<ShutterRow>` instances (portrait `portraitBottomPanel` + landscape `landscapeCluster`) with a **single** bottom row at `bottom: bands.shutterRowBottom`, full width, rendered in both orientations. Left = `<GalleryThumb uris={captureSession.shots.map(s=>s.uri)} themeColor={themeColor} onSelect={(uri)=>{ const shot = captureSession.shots.find(s=>s.uri===uri); if (shot) navigateToPreview(shot); }} onPickLibrary={handlePickLibraryImage} onExpand={() => setHistoryOpen(v=>!v)} />`; center = the existing shutter button (extract from `ShutterRow` or pass `ShutterRow` a `hideLibrary` prop — see Task 13); right = flip. Glyphs rotate via the same `rotate` style when `isLandscape && orientationMode==='landscape'`.
- [ ] **Step 2:** Delete the `<OverlayDock>` element (lines ~1630-1641) and its `overlayControls` const (~1282-1317) and the `landscapeCluster` block (~1643-1666) and `styles.landscapeCluster`/`styles.portraitBottomPanel` no-longer-needed entries. Remove `overlayDockOpen` reads. (Keep `OverlayControlsBar` import until Phase 6 — it's now unreferenced; tsc will warn on unused import, fix by removing the import here.)
- [ ] **Step 3:** Add `const [historyOpen, setHistoryOpen] = useState(false)`; when `historyOpen && chrome.showCaptureHistory`, render the existing `<CaptureHistoryStrip>` as an expanded row just above the carousel band (reusing it until Phase 6 folds it into `GalleryThumb`, or keep `CaptureHistoryStrip` as the expanded presentation — decide: keep it as the expand target, so it is NOT dead). Remove the always-on floating `captureHistoryWrap`.
- [ ] **Step 4:** Remove the now-unused floating layers that the bands replace: `focalDock` (ZoomDial) — delete the `focalDial`/`dialIsland` consts and the `<View style={styles.focalDock}>`; the zoom band replaces it. Keep `AutoCaptureStatusBadge`, toasts, `CountdownOverlay`, `AlignmentHUD`, `ReferenceThumbnail`, AUTO badge, `LevelHorizon`, `FocusReticle`, `CompanionOverlay` — reposition any that referenced `bottomBarHeight + N` to the new `bands.*` offsets. Update `AlignmentHUD` `bottomBarHeight={bands.totalBottomChromeHeight}` and `rightReserve={0}` (no more side column).
- [ ] **Step 5: Type-check + full suite + parity** — `bunx tsc --noEmit && bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/` → PASS. Manually confirm the parity test still green.
- [ ] **Step 6: Commit** — `git commit -m "feat(camera): single fixed bottom row both orientations; remove OverlayDock + side column"`.

### Task 13: Trim `ShutterRow` (library button → GalleryThumb)

**Files:**
- Modify: `components/pilgrimage/camera/ShutterRow.tsx`

- [ ] **Step 1:** Add a `hideLibrary?: boolean` prop (default false to preserve other callers, if any — grep first). When the screen now owns the gallery thumb, render `ShutterRow` with `hideLibrary` so it shows only shutter + flip, OR refactor the screen to use only `ShutterRow`'s shutter + a separate flip. **Keep `animateCapture` + the `shutter-pulse` testID intact** (parity test #6).
- [ ] **Step 2:** Keep landscape glyph rotation inside `ShutterRow` (it already handles `isLandscape`); ensure it no longer assumes a vertical column — it should be a horizontal row at the bottom in both orientations now (the parent no longer wraps it in `landscapeCluster`). Adjust `ShutterRow`'s landscape branch to a bottom-row layout with rotated glyphs.
- [ ] **Step 3: Type-check + parity** — `bunx tsc --noEmit && bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-feature-parity.test.tsx` → PASS (shutter-pulse contract intact).
- [ ] **Step 4: Commit** — `git commit -m "refactor(camera): ShutterRow drops library button, stays bottom-row in landscape"`.

---

## Phase 4 — Top-bar contextual icon row

### Task 14: Consolidate top-bar controls; drop redundant Row-2 chips

**Files:**
- Modify: `components/pilgrimage/camera/CameraTopBar.tsx`
- Modify: `app/(tabs)/pilgrimage/compare/[spotId].tsx`

- [ ] **Step 1:** In `[spotId].tsx`, move timer/aspect/orientation out of the Row-2 `quickControls` and into the single `actions` icon set as small `CameraHeaderButton`s, alongside flash + capture-mode + settings. Each cycles via its existing handler (`cycleFlash`, `cycleCaptureMode`, and new inline cyclers for aspect `['16:9','4:3','1:1','full']`, countdown `[0,3,5,10]`, orientation `auto↔landscape` — reuse the chip CYCLE arrays' values; you can keep importing the chip CYCLE consts or inline them). The Guide (`CameraChip` info) stays as one icon.
- [ ] **Step 2:** Gate `actions` visibility on `chrome.showTopContextIcons` (auto-hide in landscape immersive); always keep settings + close reachable (or reveal-on-tap). Drop `quickControls`/`quickControlsOpen`/Row-2 entirely from `CameraTopBar` usage; remove the `resolveCameraTopChromeHeight` Row-2 branch usage (keep the function; it still computes the base height with `quickControlsOpen:false`).
- [ ] **Step 3:** Simplify `CameraTopBar.tsx`: remove the `quickControls`/`quickControlsExpanded`/`onToggleQuickControls` props + the Row-2 `ScrollView` + the auto-injected chevron. Keep `actions`, `placeName`, `onClose`, `CameraHeaderButton`.
- [ ] **Step 4: Type-check + full suite** — `bunx tsc --noEmit && bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "refactor(camera): single top-bar icon row, drop redundant Row-2 chips"`.

---

## Phase 5 — Transient focus/EV sun-slider

### Task 15: Reposition `FocusExposureBar` near the reticle

**Files:**
- Modify: `components/pilgrimage/camera/FocusExposureBar.tsx`
- Modify: `app/(tabs)/pilgrimage/compare/[spotId].tsx`

- [ ] **Step 1:** Keep the EV model (range −2..2, step 0.1, `roundExposureValue`, `onChange`) — **do not change the logic**; only the placement/skin. Add optional `anchor?: { x: number; y: number }` (the focus point) so it renders as a compact vertical "sun" slider beside the reticle instead of a full-width bottom bar. Default to the current placement when no anchor (back-compat).
- [ ] **Step 2:** In the screen, render `<FocusExposureBar>` gated by `chrome.showFocusExposureBar` (already `afLocked`) and pass `anchor={tapFocus.focusPoint}`. Remove the old `focusEvBarBottom` math.
- [ ] **Step 3: Type-check + full suite** — `bunx tsc --noEmit && bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(camera): transient focus/EV sun-slider anchored to the reticle"`.

---

## Phase 6 — Remove dead / superseded code (grep-verified)

### Task 16: Delete superseded + dead files

**Files:** removals only.

- [ ] **Step 1: Grep-verify zero imports for each before deleting.** For each basename run:
```bash
grep -rn "OverlayDock\|OverlayControlsBar\|VerticalExposureSlider\|chips/ExposureControls\|chips/OverlayControls\|ZoomDial\|CaptureHistoryStrip" app components hooks libs --include=*.ts --include=*.tsx | grep -v "components/pilgrimage/camera/OverlayDock.tsx\|OverlayControlsBar.tsx\|VerticalExposureSlider.tsx\|ExposureControls.tsx\|OverlayControls.tsx\|ZoomDial.tsx\|CaptureHistoryStrip.tsx"
```
Expected: no remaining importers. **If `CaptureHistoryStrip` is still used as the expand target (Task 12 Step 3), keep it** and drop it from this delete list.

- [ ] **Step 2: Delete the confirmed-dead + now-superseded files:**
```bash
git rm components/pilgrimage/camera/OverlayDock.tsx \
       components/pilgrimage/camera/OverlayControlsBar.tsx \
       components/pilgrimage/camera/chips/OverlayControls.tsx \
       components/pilgrimage/camera/VerticalExposureSlider.tsx \
       components/pilgrimage/camera/chips/ExposureControls.tsx \
       components/pilgrimage/camera/ZoomDial.tsx
```

- [ ] **Step 3: Handle `zoom-dial.ts` + its test + the removed chips.** Grep `zoom-dial`:
```bash
grep -rn "zoom-dial" app components hooks libs __tests__ --include=*.ts --include=*.tsx | grep -v "libs/services/pilgrimage/zoom-dial.ts\|zoom-dial.test.ts"
```
If zero importers remain after `ZoomDial.tsx` is gone, `git rm libs/services/pilgrimage/zoom-dial.ts __tests__/unit/pilgrimage/zoom-dial.test.ts`. Likewise grep `AspectChip`/`CountdownChip`/`OrientationChip` — if the top-bar refactor inlined their cycles and nothing imports them, `git rm` the three chip files. **Keep `CameraChip.tsx`** (still used for the Guide icon, unless that too was inlined).

- [ ] **Step 4: Remove the now-orphaned `overlayDockOpen` HUD field + `resolveTransientCameraHudVisibility`.** In `hooks/useCameraHud.ts` delete `overlayDockOpen` from `CameraHudState` + `INITIAL_CAMERA_HUD`; update `camera-hud.test.ts` only if it asserted that field (it does not, per the map). In `camera-ui.ts` delete `resolveTransientCameraHudVisibility` + its types `TransientCameraHudVisibilityInput`/`TransientCameraHudVisibility` (its test was migrated in Task 3 Step 5).

- [ ] **Step 5: Type-check + FULL unit suite** — `bunx tsc --noEmit && bun test --preload ./test-setup.ts __tests__/unit/` → PASS. Fix any dangling imports.

- [ ] **Step 6: Commit** — `git commit -m "chore(camera): remove OverlayDock/OverlayControlsBar/ZoomDial + dead exposure/overlay/chip files"`.

---

## Phase 7 — i18n + final verification

### Task 17: Add new i18n keys

**Files:**
- Modify: `libs/i18n/locales/en.json` (add keys first — TS infers `TranslationKey`)
- Modify: `libs/i18n/locales/zh-Hant.json` (translate)

- [ ] **Step 1:** Add any NEW keys referenced by the new components that don't already exist (most reuse existing `pilgrimageUi.*`). Candidates: `pilgrimageUi.tapToRevealControls` (immersive reveal hint), `pilgrimageUi.galleryCount` (if a labeled badge). Add to `en.json` under `pilgrimageUi` (alphabetical), then `zh-Hant.json`. Reuse existing keys wherever possible (`overlayOpacity`, `pickCharacter`, `openRecentCapture`, `pickPhotoFromLibrary`, `flip`, `reposition`, `edge`, `sketch`, `subject`, `overlayModeA11y`).
- [ ] **Step 2: Run the i18n parity test** — `bun test --preload ./test-setup.ts __tests__/unit/i18n.test.ts` → PASS.
- [ ] **Step 3: Commit** — `git commit -m "i18n(camera): keys for simplified chrome"`.

### Task 18: Final gates + feature-parity walkthrough

- [ ] **Step 1: Full type-check** — `bunx tsc --noEmit` → exits 0 (or only Task 0 baseline errors).
- [ ] **Step 2: Full unit suite** — `bun test --preload ./test-setup.ts __tests__/unit/` → all pass.
- [ ] **Step 3: Re-verify the 38-feature checklist (Appendix A)** against the new render tree — every feature still reachable.
- [ ] **Step 4: On-device manual check (portrait + landscape):** overlay carousel switches Off/Anime/Edge/Sketch/Subject; opacity pill; reposition/flip popover; edge intensity; subject combine + character; zoom presets + pinch + one-tap ultra-wide; tap-to-focus EV slider; flash/timer/aspect/capture-mode/orientation top icons; gallery thumb (newest+badge) → expand history → preview; library import; scene switcher; alignment HUD + level horizon; auto-capture; countdown; burst long-press; settings sheet; **bottom row stays at the bottom in landscape with rotated glyphs (no right-side column)**.
- [ ] **Step 5:** Run `superpowers:finishing-a-development-branch` to choose merge/PR/cleanup.

---

## Appendix A — 38-feature preservation checklist

(From the full screen map. Each must remain reachable & functional after the refactor.)

1. Camera permission flow (loading/denied/auto-request) · 2. Single capture (EXIF, composites, lens-gate) · 3. Burst (long-press + mode) · 4. Auto-capture-when-aligned (sustain 1.5s) · 5. Countdown/self-timer · 6. Flash (front/rear cycles, torch) · 7. Aspect (16:9/4:3/1:1/full) · 8. Capture mode (single/burst/auto) · 9. Auto+HDR pipeline (scene analyzer, bracket, honesty badge) · 10. Zoom + presets (now pills + pinch) · 11. Lens switching (cohort FSM, pinch + one-tap ultra-wide) · 12. Android freeze-frame on lens swap · 13. Overlay modes (off/anime/edge/sketch/subject — now carousel) · 14. Overlay opacity (now zoom-band pill) · 15. Overlay reposition/flip/edit (now popover) · 16. Overlay visibility toggle (= Off slot) · 17. Subject extract + composite (combine) · 18. Companion character (picker + composite) · 19. Subject focus tight/normal/wide (now surfaced in popover) · 20. Tap-to-focus + AF lock · 21. EV/exposure (now transient sun-slider) · 22. Flip camera + mirror selfie · 23. Library import (now in GalleryThumb) · 24. Capture history (now GalleryThumb badge → expand) · 25. Scene switcher (ref thumb) · 26. Alignment HUD + scoring · 27. Level horizon · 28. Settings sheet (resolution/silent/mirror/animate/auto-capture) · 29. Orientation AUTO/LAND (top icon) · 30. (was quick-controls strip — folded into top icons) · 31. Framing guide nav · 32. Preview nav (full params) · 33. EXIF stamping · 34. Anitabi origin credit · 35. Haptics · 36. Shutter animation + mute · 37. Lifecycle/warmup/error boundary · 38. Toasts (capture-mode/auto/switch + overlay/lens-gate).

## Appendix B — Risk register

- **Gesture conflicts:** carousel swipe vs. overlay-reposition pan vs. preview pinch. Mitigation: carousel uses `Gesture.Pan().activeOffsetX([-12,12])` so vertical/zoom gestures fall through; overlay reposition stays gated by `editMode` (existing). Verify on device.
- **Parity test #1:** never add `react-native-vision-camera/lib/` or `frameProcessor` literals to `[spotId].tsx`.
- **Parity test #6:** keep `ShutterRow`'s `animateCapture` → `shutter-pulse` testID.
- **`handleRequestSwitch` signature:** confirm the real lens-target argument before wiring `onPickUltraWide`.
- **`render-helpers` API:** confirm the exact traversal export before writing component tests.
- **Removing tested `zoom-dial.ts`:** only if grep shows zero importers; otherwise keep.


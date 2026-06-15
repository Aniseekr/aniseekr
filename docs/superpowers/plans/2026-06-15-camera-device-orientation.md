# Camera Device-Orientation Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pilgrimage camera capture in true device orientation (AUTO follows the phone, LAND forces landscape) and stop portrait shots being cropped anywhere downstream, while cleaning up the camera screen's state hotspots and localizing its HUD.

**Architecture:** The device sensor is the single capture-orientation authority — `orientationSource` is derived from the AUTO/LAND chip and threaded into `CameraStage`; the captured `width/height` carries orientation truth through session → preview → share, where surfaces letterbox (`contain`) instead of cropping. The route screen sheds its orientation/lifecycle/freeze-frame effects into focused hooks, and the HUD/toast/error strings move into the `pilgrimageUi` i18n catalog.

**Tech Stack:** react-native-vision-camera v5.0.11 (Nitro), Expo SDK 56, RN 0.85.3, Reanimated, Skia, MMKV, Bun test (`bun run test:unit`), `libs/i18n` (`useT`).

**Spec:** `docs/superpowers/specs/2026-06-15-camera-device-orientation-design.md`
**Branch:** `camera-device-orientation`

**Phase order & gates:** Phase 0 (device baseline) → 1 (pure helpers) → 2 (orientation thread) → 3 (downstream letterbox) → 4 (state cleanup) → 5 (i18n) → Closeout (device acceptance). Phases 1, 3, 5 are TDD with real Bun tests; Phases 2 and 4 are wiring gated by `bunx tsc --noEmit` + existing suites + the manual device checks. Per CLAUDE.md Rule 8, no fabricated RN component/hook tests.

---

## Phase 0 — Pre-flight device verification (gate · no code)

> **Why first:** the orientation unit test mocks the native layer, so it cannot tell us whether the *saved file* is already correct in device mode. Establish ground truth before changing anything, so we know whether the fix is purely downstream or also capture-side.

- [ ] **Step 1: Build + launch on a real device / simulator (iOS and Android).** Open a pilgrimage spot → the compare/capture screen.

- [ ] **Step 2: Capture the baseline matrix.** With the chip in **AUTO**, capture once holding the phone upright (portrait) and once rotated to landscape. Switch the chip to **LAND** and capture again. Repeat on the other OS. For each, note: does the *preview* look right, and does the *saved file* look right.

- [ ] **Step 3: Read back the saved files' true pixel dimensions + EXIF.** For each captured file inspect the actual `width`/`height` and EXIF `Orientation` (pull the file and run `exiftool` / `sips -g pixelWidth -g pixelHeight`, or log `resolveCapturedPhotoDimensions(uri, fallback)` in a dev build). Record the results as a table in this task.

- [ ] **Step 4: Classify the bug.** If an AUTO-portrait capture's saved file is already `height > width` → capture is correct and the visible bug is **purely downstream** (Phase 3 fully fixes it). If the saved file is `width > height` for an upright portrait shot → there is **also a capture-side** issue; record the exact `orientationSource`/pose behavior and confirm Phase 2's thread (chip → `orientationSource`) resolves it before moving on.

> No commit (observation only). This gate informs Phases 2–3; do not skip it.

---

## Phase 1 — Pure orientation helpers (TDD)

### Task 1.1: Add a failing test for `cameraOrientationSource`

This task introduces the brand-new pure helper `cameraOrientationSource(mode)` test-first. It maps the orientation chip mode to the vision-camera `OrientationSource` prop value: `'auto' -> 'device'` (capture follows the physical phone — stock-camera feel) and `'landscape' -> 'interface'` (capture follows the landscape-locked UI). We write the failing test before any implementation per the repo TDD rule (this is pure mode->value logic, so it MUST be unit-tested).

The `OrientationSource` type is verified to be the exact exported name from `react-native-vision-camera` v5.0.11 (`node_modules/react-native-vision-camera/src/specs/common-types/OrientationSource.ts:10` → `export type OrientationSource = 'interface' | 'device'`, re-exported from the package root via `src/index.ts:38` → `export * from './specs/common-types/OrientationSource'`). Importing it as a **type-only** import in a Bun test is proven safe: `__tests__/unit/pilgrimage/android-camera-device.test.ts:2` and `device-cohort.test.ts:2` already do `import type { CameraDevice } from 'react-native-vision-camera';` and pass under `bun run test:unit` with no module mock — type imports are erased at compile time and never resolved at runtime.

**Files:**
- Modify: `__tests__/unit/pilgrimage/camera-ui.test.ts` (import block lines 1-17; new `it(...)` block inserted after line 48)
- Test: `__tests__/unit/pilgrimage/camera-ui.test.ts`

- [ ] **Step 1: Add `cameraOrientationSource` to the import list in the test.**

  Current import block (lines 1-17):
  ```ts
  import { describe, expect, it } from 'bun:test';
  import {
    ANDROID_GESTURE_NAV_MIN_INSET,
    cameraOrientationLockIntent,
    CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
    CAMERA_LANDSCAPE_CLUSTER_RESERVE,
    CAMERA_SHUTTER_ROW_HEIGHT,
    CAMERA_TOP_BAR_CONTENT_HEIGHT,
    CAMERA_TOP_BAR_ROW2_HEIGHT,
    formatCameraHeader,
    isCameraCapturePath,
    resolveCameraBottomInset,
    resolveCameraActive,
    resolveCameraTopChromeHeight,
    resolveTransientCameraHudVisibility,
    roundExposureValue,
  } from '../../../libs/services/pilgrimage/camera-ui';
  ```

  Replace it with (adds the type-only `OrientationSource` import from the package, and `cameraOrientationSource` from the local module):
  ```ts
  import { describe, expect, it } from 'bun:test';
  import type { OrientationSource } from 'react-native-vision-camera';
  import {
    ANDROID_GESTURE_NAV_MIN_INSET,
    cameraOrientationLockIntent,
    cameraOrientationSource,
    CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
    CAMERA_LANDSCAPE_CLUSTER_RESERVE,
    CAMERA_SHUTTER_ROW_HEIGHT,
    CAMERA_TOP_BAR_CONTENT_HEIGHT,
    CAMERA_TOP_BAR_ROW2_HEIGHT,
    formatCameraHeader,
    isCameraCapturePath,
    resolveCameraBottomInset,
    resolveCameraActive,
    resolveCameraTopChromeHeight,
    resolveTransientCameraHudVisibility,
    roundExposureValue,
  } from '../../../libs/services/pilgrimage/camera-ui';
  ```

- [ ] **Step 2: Add the failing `cameraOrientationSource` test block.**

  Insert the following new `it(...)` block immediately AFTER the existing lock-intent test that ends at line 48 (the block whose closing is `  });` on line 48), and BEFORE the `roundExposureValue` test that begins at line 50. The `OrientationSource` typed bindings assert the helper's return type at compile time as well as its runtime value:
  ```ts
    it('maps AUTO to device-follows-phone and LAND to interface-follows-UI orientation sources', () => {
      const autoSource: OrientationSource = cameraOrientationSource('auto');
      const landscapeSource: OrientationSource = cameraOrientationSource('landscape');

      expect(autoSource).toBe('device');
      expect(landscapeSource).toBe('interface');
    });
  ```

- [ ] **Step 3: Run the test file and confirm it FAILS to compile/run because the export does not exist yet.**

  Command:
  ```bash
  bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-ui.test.ts
  ```

  Expected output (FAIL — the symbol is not yet exported from the module, so Bun reports an import/resolution error referencing `cameraOrientationSource`):
  ```
  error: Export named 'cameraOrientationSource' not found in module '.../libs/services/pilgrimage/camera-ui.ts'.
  ```
  (Exact wording may vary by Bun version; the run MUST be red and MUST name `cameraOrientationSource`. Do not proceed until you see a red run that fails specifically because `cameraOrientationSource` is missing.)

---

### Task 1.2: Implement `cameraOrientationSource` and make Task 1.1 green

Add the `OrientationSource` type-only import to the helper module and implement `cameraOrientationSource`. Place the import at the very top of the file and the function next to the existing `cameraOrientationLockIntent` so the two orientation helpers live together.

**Files:**
- Modify: `libs/services/pilgrimage/camera-ui.ts` (new import at top, before line 1; new function inserted after line 96)
- Test: `__tests__/unit/pilgrimage/camera-ui.test.ts`

- [ ] **Step 1: Add the `OrientationSource` type-only import at the top of the helper module.**

  The file currently starts at line 1 with:
  ```ts
  export interface CameraHeaderInput {
  ```

  Insert this import line ABOVE that first line so the file begins with the import, then a blank line, then the interface:
  ```ts
  import type { OrientationSource } from 'react-native-vision-camera';

  export interface CameraHeaderInput {
  ```

- [ ] **Step 2: Implement `cameraOrientationSource` directly after the existing `cameraOrientationLockIntent` function.**

  The existing lock-intent function spans lines 92-96 and ends at line 96 (`}`):
  ```ts
  export function cameraOrientationLockIntent(
    mode: CameraOrientationMode
  ): CameraOrientationLockIntent {
    return mode === 'landscape' ? 'landscape' : 'unlock';
  }
  ```

  Insert the new helper immediately after that closing brace on line 96 (a blank line 97 currently sits before the `// Keep CameraView remount policy out of this helper module.` comment that begins at line 98 — the new helper goes into that gap, between the function and the comment):
  ```ts

  // AUTO  → capture follows the physical phone (stock-camera): 'device'.
  // LAND  → capture follows the landscape-locked interface (forced landscape): 'interface'.
  // `OrientationSource` is the vision-camera prop type ('interface' | 'device').
  export function cameraOrientationSource(mode: CameraOrientationMode): OrientationSource {
    return mode === 'landscape' ? 'interface' : 'device';
  }
  ```

  > Note: the existing `cameraOrientationLockIntent` body is NOT changed in this task — that is Task 1.3. This task only adds the new source helper.

- [ ] **Step 3: Run the test file and confirm the new `cameraOrientationSource` test PASSES.**

  Command:
  ```bash
  bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-ui.test.ts
  ```

  Expected output (the new test is green; the existing lock-intent test at lines 45-48 is STILL green because we have not changed its expectations or implementation yet). The suite currently has 12 tests; this adds a 13th:
  ```
  ✓ camera UI helpers > maps AUTO to device-follows-phone and LAND to interface-follows-UI orientation sources
  ✓ camera UI helpers > requests flexible landscape instead of pinning the camera to the right side
  ...
  13 pass
  0 fail
  ```

- [ ] **Step 4: Commit.**

  ```bash
  git add libs/services/pilgrimage/camera-ui.ts __tests__/unit/pilgrimage/camera-ui.test.ts
  git commit -m "feat(camera): add cameraOrientationSource mode->OrientationSource helper"
  ```

---

### Task 1.3: Update the lock-intent contract — AUTO now locks portrait, not unlock (TDD)

Change `cameraOrientationLockIntent` so AUTO returns `'portrait'` (interface locked to portrait — HUD stays put, stock-camera feel) instead of `'unlock'`, and widen the `CameraOrientationLockIntent` union from `'unlock' | 'landscape'` to `'portrait' | 'landscape'`. This matches the SHARED CONTRACT (`cameraOrientationLockIntent`: `'auto' -> 'portrait'`, `'landscape' -> 'landscape'`). We update the existing test's expectations FIRST (red), then change the implementation (green).

The existing test at lines 45-48 currently asserts the OLD behavior (`'auto'` → `'unlock'`) and its description ("requests flexible landscape instead of pinning the camera to the right side") no longer describes the new portrait-lock behavior, so both the body and the description are rewritten.

**Files:**
- Modify: `__tests__/unit/pilgrimage/camera-ui.test.ts` (lines 45-48 — replace the existing lock-intent test)
- Modify: `libs/services/pilgrimage/camera-ui.ts` (type alias line 13; function body line 95)
- Test: `__tests__/unit/pilgrimage/camera-ui.test.ts`

- [ ] **Step 1: Rewrite the existing lock-intent test to expect the new `'portrait'` value (RED).**

  Current test (lines 45-48):
  ```ts
    it('requests flexible landscape instead of pinning the camera to the right side', () => {
      expect(cameraOrientationLockIntent('auto')).toBe('unlock');
      expect(cameraOrientationLockIntent('landscape')).toBe('landscape');
    });
  ```

  Replace it with (AUTO now locks the interface to portrait so the HUD never rotates; LAND still locks landscape):
  ```ts
    it('locks the interface to portrait in AUTO (stock-camera HUD) and landscape in LAND', () => {
      expect(cameraOrientationLockIntent('auto')).toBe('portrait');
      expect(cameraOrientationLockIntent('landscape')).toBe('landscape');
    });
  ```

- [ ] **Step 2: Run the test file and confirm the lock-intent test now FAILS against the unchanged implementation (RED).**

  Command:
  ```bash
  bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-ui.test.ts
  ```

  Expected output (the rewritten test fails because the current implementation still returns `'unlock'` for `'auto'`; the `cameraOrientationSource` test from Task 1.2 stays green):
  ```
  ✗ camera UI helpers > locks the interface to portrait in AUTO (stock-camera HUD) and landscape in LAND
    Expected: "portrait"
    Received: "unlock"
  ✓ camera UI helpers > maps AUTO to device-follows-phone and LAND to interface-follows-UI orientation sources
  ...
  1 fail
  ```

- [ ] **Step 3: Widen the `CameraOrientationLockIntent` union type.**

  Current type alias (line 13):
  ```ts
  export type CameraOrientationLockIntent = 'unlock' | 'landscape';
  ```

  Replace it with:
  ```ts
  export type CameraOrientationLockIntent = 'portrait' | 'landscape';
  ```

- [ ] **Step 4: Change the `cameraOrientationLockIntent` body so AUTO returns `'portrait'`.**

  Current function (lines 92-96):
  ```ts
  export function cameraOrientationLockIntent(
    mode: CameraOrientationMode
  ): CameraOrientationLockIntent {
    return mode === 'landscape' ? 'landscape' : 'unlock';
  }
  ```

  Replace the body so the non-landscape (AUTO) branch returns `'portrait'` (only line 95 changes):
  ```ts
  export function cameraOrientationLockIntent(
    mode: CameraOrientationMode
  ): CameraOrientationLockIntent {
    return mode === 'landscape' ? 'landscape' : 'portrait';
  }
  ```

- [ ] **Step 5: Run the test file and confirm ALL tests PASS (GREEN).**

  Command:
  ```bash
  bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-ui.test.ts
  ```

  Expected output (the rewritten lock-intent test and the new source test both pass; every other camera-ui helper test remains green — 13 total):
  ```
  ✓ camera UI helpers > locks the interface to portrait in AUTO (stock-camera HUD) and landscape in LAND
  ✓ camera UI helpers > maps AUTO to device-follows-phone and LAND to interface-follows-UI orientation sources
  ...
  13 pass
  0 fail
  ```

- [ ] **Step 6: Confirm no other source file still depends on the removed `'unlock'` literal.**

  Command (searches the whole repo, excluding `node_modules`, for any remaining reference to this helper or the old return value):
  ```bash
  grep -rn "cameraOrientationLockIntent\|'unlock'" /Users/kidney/Workspace/Work/ani/aniseekr --include="*.ts" --include="*.tsx" | grep -v node_modules
  ```

  Expected output (verified by running it): the `'unlock'` literal appears ONLY in `libs/services/pilgrimage/camera-ui.ts` and the test (and after Step 3-4 it is gone from the source entirely, leaving no orientation-tied `'unlock'` literal anywhere). The `cameraOrientationLockIntent` SYMBOL additionally appears in the route file `app/(tabs)/pilgrimage/compare/[spotId].tsx` — line 32 (import) and line 654 (`const lockIntent = cameraOrientationLockIntent(orientationMode);`). That route-file effect (lines 653-660) compares `lockIntent === 'landscape'` and falls through to `ScreenOrientation.unlockAsync()` in its else-branch — it does NOT reference the `'unlock'` literal and its `=== 'landscape'` comparison stays valid against the widened union, so this phase makes NO type error there. The behavioral change (AUTO should now `lockAsync(PORTRAIT_UP)` instead of `unlockAsync()`) is owned by Phase 2's `useCameraOrientation` hook. Record `[spotId].tsx:32` and `:654` for Phase 2; do NOT edit them here.

- [ ] **Step 7: Typecheck the whole project to confirm the widened union has no other type fallout.**

  Command:
  ```bash
  bunx tsc --noEmit
  ```

  Expected output (clean — no new errors introduced by the `'unlock' | 'landscape'` → `'portrait' | 'landscape'` change). The route-file consumer `[spotId].tsx:654` remains type-correct: `lockIntent` narrows over `'portrait' | 'landscape'` and its `=== 'landscape'` test is still valid, so `tsc` stays green. The route file's continued use of `unlockAsync()` for the AUTO branch is a runtime/behavioral concern (it should become a portrait lock), handled in Phase 2 — not a type error here:
  ```
  (no output; exit code 0)
  ```

- [ ] **Step 8: Commit.**

  ```bash
  git add libs/services/pilgrimage/camera-ui.ts __tests__/unit/pilgrimage/camera-ui.test.ts
  git commit -m "refactor(camera): lock AUTO orientation to portrait (was unlock)"
  ```

---

### Task 1.4: Run the full unit suite + typecheck as the Phase 1 closeout gate

Confirm the two helper changes are green across the entire Bun unit suite (not just the single file) and that the project still typechecks. This guards against any other test that imported the helper module or relied on the old `'unlock'` union.

**Files:**
- Test: `__tests__/unit/` (whole suite)

- [ ] **Step 1: Run the full unit suite via the package script.**

  Command:
  ```bash
  bun run test:unit
  ```

  Expected output (the entire suite is green; `camera-ui.test.ts` shows the rewritten lock-intent test and the new `cameraOrientationSource` test passing):
  ```
  ...
  ✓ camera UI helpers > locks the interface to portrait in AUTO (stock-camera HUD) and landscape in LAND
  ✓ camera UI helpers > maps AUTO to device-follows-phone and LAND to interface-follows-UI orientation sources
  ...
  <total> pass
  0 fail
  ```

- [ ] **Step 2: Run the typecheck across the whole project.**

  Command:
  ```bash
  bunx tsc --noEmit
  ```

  Expected output:
  ```
  (no output; exit code 0)
  ```

  The route-file consumer `app/(tabs)/pilgrimage/compare/[spotId].tsx:654` compares `cameraOrientationLockIntent(...) === 'landscape'`, which stays type-valid under the widened `'portrait' | 'landscape'` union, so `tsc` is clean. Its AUTO-branch `ScreenOrientation.unlockAsync()` becoming a portrait lock is a Phase 2 behavioral follow-up (owned by `useCameraOrientation`) — the Phase 1 helper + tests are complete regardless. Do NOT edit any route/component file in this phase.

---

## Phase 2 — Thread orientationSource from chip to Camera

**Phase 2 depends on Phase 1.** Phase 1 must already have landed in `libs/services/pilgrimage/camera-ui.ts`:
- `export function cameraOrientationSource(mode: CameraOrientationMode): OrientationSource` — returns `'interface'` for `'landscape'`, `'device'` otherwise (the `OrientationSource` type is imported from `react-native-vision-camera`; its values are `'interface' | 'device'`).
- `cameraOrientationLockIntent` return type changed to `'portrait' | 'landscape'` (AUTO → `'portrait'`, LAND → `'landscape'`), with `CameraOrientationLockIntent` retyped accordingly.

> Verified against the current tree: `camera-ui.ts` still has `cameraOrientationLockIntent('auto') === 'unlock'` (line 95) and does NOT yet export `cameraOrientationSource`; `__tests__/unit/pilgrimage/camera-ui.test.ts` still asserts `cameraOrientationLockIntent('auto')).toBe('unlock')` (line 46) and does not import `cameraOrientationSource`. Both the changed mapping and the new `cameraOrientationSource` cases are Phase-1 work — so Phase 2 adds NO new pure logic. `useCameraOrientation` is a thin RN hook (subscribes to `ScreenOrientation`, derives `orientationSource` from the already-tested helper). Per the REPO TDD RULE, hook/JSX wiring with no new pure logic is verified by `bunx tsc --noEmit` plus an explicit on-device check, not a fabricated component test.

### Task 2.1: Create `hooks/useCameraOrientation.ts` (owns the two ScreenOrientation effects)

**Files:**
- Create: `hooks/useCameraOrientation.ts`
- Test: none new — the pure mappings (`cameraOrientationSource`, `cameraOrientationLockIntent`) are covered by `__tests__/unit/pilgrimage/camera-ui.test.ts` (Phase 1). Verification is `bunx tsc --noEmit` (Step 2) + the on-device check (Task 2.4).

- [ ] **Step 1: Write the new hook file.**
  Create `hooks/useCameraOrientation.ts` with exactly this content. It imports BOTH Phase-1 helpers (`cameraOrientationSource`, `cameraOrientationLockIntent`) + the `CameraOrientationMode` type from `camera-ui`, the `OrientationSource` type from `react-native-vision-camera`, and `expo-screen-orientation`. It derives `orientationSource` via `cameraOrientationSource(orientationMode)` (per the SHARED CONTRACT) and owns BOTH `ScreenOrientation` effects that currently live in the route file: effect (a) applies the lock-intent whenever `orientationMode` changes; effect (b) restores `PORTRAIT_UP` on unmount.

  ```ts
  import { useEffect, useMemo } from 'react';
  import * as ScreenOrientation from 'expo-screen-orientation';
  import type { OrientationSource } from 'react-native-vision-camera';
  import {
    cameraOrientationLockIntent,
    cameraOrientationSource,
    type CameraOrientationMode,
  } from '../libs/services/pilgrimage/camera-ui';

  export interface UseCameraOrientationResult {
    /**
     * The `orientationSource` to pass straight to VisionCamera's `<Camera>`.
     * AUTO → `'device'` (capture follows the physical phone, stock-camera feel);
     * LAND → `'interface'` (capture follows the landscape-locked UI).
     */
    orientationSource: OrientationSource;
  }

  /**
   * Owns the camera screen's OS-orientation lifecycle and derives the
   * VisionCamera `orientationSource` from the AUTO/LAND chip.
   *
   * Two effects, moved here out of `compare/[spotId].tsx` (CLAUDE.md Rule 9 —
   * the route file should not own every lifecycle effect directly):
   *   (a) On `orientationMode` change: lock the interface per
   *       `cameraOrientationLockIntent` — LAND forces landscape, AUTO locks the
   *       interface to PORTRAIT_UP so the HUD never rotates (stock-camera feel),
   *       while `orientationSource = 'device'` lets the *capture* rotate.
   *   (b) On unmount: restore PORTRAIT_UP so leaving the camera never strands
   *       the rest of the app in landscape.
   */
  export function useCameraOrientation(
    orientationMode: CameraOrientationMode
  ): UseCameraOrientationResult {
    const orientationSource = useMemo<OrientationSource>(
      () => cameraOrientationSource(orientationMode),
      [orientationMode]
    );

    // (a) Apply the lock-intent whenever the chip flips.
    useEffect(() => {
      const lockIntent = cameraOrientationLockIntent(orientationMode);
      const op =
        lockIntent === 'landscape'
          ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
          : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      op.catch(() => undefined);
    }, [orientationMode]);

    // (b) Restore portrait on unmount so the rest of the app isn't left
    //     locked to whatever the camera last set.
    useEffect(() => {
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
          () => undefined
        );
      };
    }, []);

    return { orientationSource };
  }
  ```

  > Both import paths are verified against the existing tree: `hooks/useCameraHud.ts` imports `CameraOrientationMode` from the exact same relative path `'../libs/services/pilgrimage/camera-ui'`, and other hooks (`useResolvedCameraDevices`, `useResolvedCameraDevice`, `useSceneAnalyzer`) import vision-camera types from the bare `'react-native-vision-camera'`. The mapping equals the contract (`'auto'→'device'`, `'landscape'→'interface'`) because `orientationSource` is produced by the contract-named `cameraOrientationSource` helper itself, which is unit-tested in Phase 1.

- [ ] **Step 2: Typecheck the new hook in isolation.**
  ```bash
  bunx tsc --noEmit
  ```
  Expected: no errors referencing `hooks/useCameraOrientation.ts`. (The route file still imports `cameraOrientationLockIntent`/`ScreenOrientation` until Task 2.3, so the full repo still typechecks here.)

- [ ] **Step 3: Commit.**
  ```bash
  git add hooks/useCameraOrientation.ts
  git commit -m "feat(camera): add useCameraOrientation hook owning ScreenOrientation lifecycle"
  ```

---

### Task 2.2: Add the `orientationSource` prop to `CameraStage` and consume it

**Files:**
- Modify: `components/pilgrimage/camera/CameraStage.tsx` (vision-camera import block lines 47-59; `CameraStageProps` interface end lines 163-165; destructure lines 185-190; `<Camera>` element line 631)
- Test: none new — threading a required prop + replacing a hardcoded literal has no pure logic. Verified by `bunx tsc --noEmit` (Step 5).

- [ ] **Step 1: Import the `OrientationSource` type.**
  In `components/pilgrimage/camera/CameraStage.tsx`, the vision-camera import block currently reads (lines 47-59):
  ```ts
  import {
    Camera,
    CommonResolutions,
    type CameraDevice,
    type CameraFrameOutput,
    type CameraRef,
    type Constraint,
    type DeviceType,
    type MirrorMode,
    type QualityPrioritization,
    type TorchMode,
    usePhotoOutput,
  } from 'react-native-vision-camera';
  ```
  Add `type OrientationSource,` (alphabetical, after `MirrorMode`):
  ```ts
  import {
    Camera,
    CommonResolutions,
    type CameraDevice,
    type CameraFrameOutput,
    type CameraRef,
    type Constraint,
    type DeviceType,
    type MirrorMode,
    type OrientationSource,
    type QualityPrioritization,
    type TorchMode,
    usePhotoOutput,
  } from 'react-native-vision-camera';
  ```

- [ ] **Step 2: Add `orientationSource` to `CameraStageProps`.**
  The interface currently ends (lines 163-165):
  ```ts
    freezeFrameUri?: string | null;
    ref?: Ref<CameraEngineHandle>;
  }
  ```
  Insert the new required prop between `freezeFrameUri` and `ref`:
  ```ts
    freezeFrameUri?: string | null;

    /**
     * Which orientation authority VisionCamera uses to rotate the saved photo.
     * `'device'` (AUTO) follows the physical phone; `'interface'` (LAND) follows
     * the landscape-locked UI. Derived from the AUTO/LAND chip via
     * `useCameraOrientation` in `compare/[spotId].tsx` — do not hardcode here.
     */
    orientationSource: OrientationSource;
    ref?: Ref<CameraEngineHandle>;
  }
  ```

- [ ] **Step 3: Destructure the new prop.**
  The destructure block currently reads (lines 185-190):
  ```ts
    showWarmup,
    frameOutput,
    device: deviceProp,
    freezeFrameUri,
    ref,
  }: CameraStageProps) {
  ```
  Add `orientationSource,` after `freezeFrameUri,`:
  ```ts
    showWarmup,
    frameOutput,
    device: deviceProp,
    freezeFrameUri,
    orientationSource,
    ref,
  }: CameraStageProps) {
  ```

- [ ] **Step 4: Replace the hardcoded `orientationSource="device"` on the `<Camera>`.**
  The `<Camera>` element currently reads (lines 620-634):
  ```tsx
              <Camera
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                device={device}
                outputs={outputs}
                isActive={active}
                zoom={resolvedZoom}
                exposure={resolvedExposure}
                torchMode={resolvedTorchMode}
                mirrorMode={mirrorMode}
                constraints={constraints}
                orientationSource="device"
                onStarted={handleStarted}
                onError={handleMountError}
              />
  ```
  Change the hardcoded literal to the prop:
  ```tsx
              <Camera
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                device={device}
                outputs={outputs}
                isActive={active}
                zoom={resolvedZoom}
                exposure={resolvedExposure}
                torchMode={resolvedTorchMode}
                mirrorMode={mirrorMode}
                constraints={constraints}
                orientationSource={orientationSource}
                onStarted={handleStarted}
                onError={handleMountError}
              />
  ```

- [ ] **Step 5: Typecheck — expect a deliberate failure at the call site.**
  ```bash
  bunx tsc --noEmit
  ```
  Expected: ONE error in `app/(tabs)/pilgrimage/compare/[spotId].tsx` at the `<CameraStage …/>` JSX (~line 1401), of the form:
  ```
  error TS2741: Property 'orientationSource' is missing in type '{ … }' but required in type 'CameraStageProps'.
  ```
  This is the desired red — `orientationSource` is now required and the route file hasn't passed it yet. Task 2.3 supplies it. (No error inside `CameraStage.tsx` itself.)

  > Do NOT commit yet — the repo does not typecheck clean until Task 2.3 wires the call site. Tasks 2.2 + 2.3 land in one commit (Task 2.3 Step 8).

---

### Task 2.3: Wire `useCameraOrientation` in `[spotId].tsx`, pass the prop, delete the two old effects

**Files:**
- Modify: `app/(tabs)/pilgrimage/compare/[spotId].tsx` (`ScreenOrientation` import line 19; camera-ui import block lines 31-38; new hook import after line 96; hook call after the lifecycle destructure lines 305-312; `<CameraStage>` JSX lines 1401-1424; the unmount effect lines 641-647; the chip-driven effect + stale comment lines 649-660)
- Test: none new. Verified by `bunx tsc --noEmit` (Step 6) + the on-device check (Task 2.4).

- [ ] **Step 1: Import the new hook.**
  After the existing `useCameraLifecycle` import (line 96):
  ```ts
  import { useCameraLifecycle } from '../../../../hooks/useCameraLifecycle';
  ```
  add:
  ```ts
  import { useCameraLifecycle } from '../../../../hooks/useCameraLifecycle';
  import { useCameraOrientation } from '../../../../hooks/useCameraOrientation';
  ```

- [ ] **Step 2: Call `useCameraOrientation(orientationMode)`.**
  Find the lifecycle destructure (lines 305-312):
  ```ts
    const lifecycle = useCameraLifecycle(true);
    const {
      active: cameraActive,
      isReady: cameraIsReady,
      onCameraReady,
      onMountError,
      setActive: setCameraActive,
    } = lifecycle;
  ```
  Add the orientation hook call immediately after the closing `} = lifecycle;`:
  ```ts
    const lifecycle = useCameraLifecycle(true);
    const {
      active: cameraActive,
      isReady: cameraIsReady,
      onCameraReady,
      onMountError,
      setActive: setCameraActive,
    } = lifecycle;
    // AUTO is device-mode by design: the capture follows the physical phone
    // while the HUD stays portrait. The hook also owns the ScreenOrientation
    // lock lifecycle (apply lock-intent on chip change; restore PORTRAIT_UP on
    // unmount) — previously two inline effects in this file.
    const { orientationSource } = useCameraOrientation(orientationMode);
  ```
  (`orientationMode` is already destructured from `hud` at lines 227-246, so it is in scope here.)

- [ ] **Step 3: Pass `orientationSource` to `<CameraStage>`.**
  The `<CameraStage>` JSX currently reads (lines 1401-1424):
  ```tsx
          <CameraStage
            ref={cameraRef}
            facing={facing}
            device={strategic.activeDevice}
            zoomShared={zoom.zoomShared}
            exposureShared={exposureShared}
            preferHdr={autoHdrSessionArmed}
            enableTorch={enableTorch}
            mirrorSelfie={settings.mirror}
            active={cameraActive}
            resolutionTier={settings.resolutionTier}
            aspect={aspect}
            qualityPrioritization={qualityToPrioritization(settings.quality)}
            quality={qualityToNumber(settings.quality)}
            enableShutterSound={!settings.mute}
            pinchGesture={zoom.pinchGesture}
            tapGesture={tapFocus.tapGesture}
            onCameraReady={handleCameraReady}
            onMountError={handleMountError}
            onDeviceInfo={setDeviceInfo}
            showWarmup={!cameraIsReady || strategic.isSwitching}
            freezeFrameUri={freezeFrameUri}
            frameOutput={sceneAnalyzer.frameOutput}
          />
  ```
  Add `orientationSource={orientationSource}` right after the `aspect={aspect}` line (grouping it with the other capture-config props):
  ```tsx
          <CameraStage
            ref={cameraRef}
            facing={facing}
            device={strategic.activeDevice}
            zoomShared={zoom.zoomShared}
            exposureShared={exposureShared}
            preferHdr={autoHdrSessionArmed}
            enableTorch={enableTorch}
            mirrorSelfie={settings.mirror}
            active={cameraActive}
            resolutionTier={settings.resolutionTier}
            aspect={aspect}
            orientationSource={orientationSource}
            qualityPrioritization={qualityToPrioritization(settings.quality)}
            quality={qualityToNumber(settings.quality)}
            enableShutterSound={!settings.mute}
            pinchGesture={zoom.pinchGesture}
            tapGesture={tapFocus.tapGesture}
            onCameraReady={handleCameraReady}
            onMountError={handleMountError}
            onDeviceInfo={setDeviceInfo}
            showWarmup={!cameraIsReady || strategic.isSwitching}
            freezeFrameUri={freezeFrameUri}
            frameOutput={sceneAnalyzer.frameOutput}
          />
  ```

- [ ] **Step 4: Delete the two now-duplicated effects (and the stale comment).**
  These two `useEffect` blocks (lines 641-660) are now wholly owned by `useCameraOrientation` — delete BOTH, including the stale comment between them. The exact text to remove is:
  ```ts
    useEffect(() => {
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
          () => undefined
        );
      };
    }, []);

    // Drive the OS orientation lock off the auto/land chip. VisionCamera realigns
    // its own preview natively via `orientationSource="interface"`, so unlike
    // expo-camera we no longer need the keyed-remount trick to clear a stale
    // preview rotation.
    useEffect(() => {
      const lockIntent = cameraOrientationLockIntent(orientationMode);
      const op =
        lockIntent === 'landscape'
          ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
          : ScreenOrientation.unlockAsync();
      op.catch(() => undefined);
    }, [orientationMode]);
  ```
  After deletion, the surrounding code goes directly from the `handleToggleEdit` callback (ending at line 639 `}, [setHud]);`) to the `handlePickSpot` callback (`const handlePickSpot = useCallback(`, currently line 662). Leave exactly one blank line between them.

  > Why delete the unmount effect too: the contract puts BOTH effects in `useCameraOrientation` (effect (a) lock-intent-on-change, effect (b) restore-PORTRAIT_UP-on-unmount). Keeping the route-file unmount effect would double-fire the restore. Also note the OLD chip effect called `ScreenOrientation.unlockAsync()` for AUTO; the hook instead locks `PORTRAIT_UP` (Phase-1 `cameraOrientationLockIntent('auto') === 'portrait'`) — this is the intended behavior change (AUTO keeps the HUD portrait while `orientationSource='device'` lets the capture rotate).

- [ ] **Step 5: Remove the now-dead imports (`cameraOrientationLockIntent` + `ScreenOrientation`).**
  After Step 4, neither symbol is referenced anywhere else in this file. Verified against the current tree: `ScreenOrientation.*` appears only at lines 643/657/658 (both inside the deleted effects), and `cameraOrientationLockIntent` only at the import (line 32) and line 654 (inside the deleted chip effect).

  Remove `ScreenOrientation` (line 19):
  ```ts
  import * as ScreenOrientation from 'expo-screen-orientation';
  ```
  Delete that whole line.

  Remove `cameraOrientationLockIntent` from the `camera-ui` import. The block currently reads (lines 31-38):
  ```ts
  import {
    cameraOrientationLockIntent,
    CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
    resolveCameraBottomInset,
    resolveCameraActive,
    resolveCameraTopChromeHeight,
    resolveTransientCameraHudVisibility,
  } from '../../../../libs/services/pilgrimage/camera-ui';
  ```
  Drop the first member:
  ```ts
  import {
    CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
    resolveCameraBottomInset,
    resolveCameraActive,
    resolveCameraTopChromeHeight,
    resolveTransientCameraHudVisibility,
  } from '../../../../libs/services/pilgrimage/camera-ui';
  ```

- [ ] **Step 6: Full typecheck — expect clean.**
  ```bash
  bunx tsc --noEmit
  ```
  Expected: no errors. The `CameraStageProps.orientationSource` requirement (red in Task 2.2 Step 5) is now satisfied; no `cameraOrientationLockIntent`/`ScreenOrientation` "declared but never read" errors (both imports removed); `useCameraOrientation` resolves and returns `{ orientationSource }`.

- [ ] **Step 7: Run the full unit suite to confirm nothing regressed.**
  ```bash
  bun run test:unit
  ```
  Expected: all suites pass, including `__tests__/unit/pilgrimage/camera-ui.test.ts` (the Phase-1 `cameraOrientationSource` / updated `cameraOrientationLockIntent` cases). No suite references the deleted route-file effects.

- [ ] **Step 8: Commit (Tasks 2.2 + 2.3 together — first clean-typechecking point).**
  ```bash
  git add components/pilgrimage/camera/CameraStage.tsx "app/(tabs)/pilgrimage/compare/[spotId].tsx"
  git commit -m "refactor(camera): thread orientationSource from AUTO/LAND chip into Camera"
  ```

---

### Task 2.4: On-device verification of the orientation thread (manual — no automated test)

**Files:** none (verification only). Per the REPO TDD RULE + spec §"Verification gap": orientation/capture correctness cannot be proven by fake-dep unit tests — it must be observed on a real device/simulator by inspecting the captured file and the HUD.

- [ ] **Step 1: Build & launch on a physical device (preferred) or simulator, iOS and Android.**
  Open the pilgrimage camera: any spot → `Compare` → the `compare/[spotId]` capture screen. Confirm the live preview renders and the AUTO/LAND chip (`OrientationChip`, route line 1511) is visible in the quick-controls strip.

- [ ] **Step 2: AUTO mode — HUD stays portrait, capture follows the phone.**
  With the chip on **AUTO**:
  - Hold the phone upright (portrait), capture. Then physically rotate the phone to landscape and capture again.
  - Expected HUD behavior: the on-screen chrome (top bar, chips, shutter row) does **NOT** rotate — it stays portrait the whole time (stock-camera feel). This confirms `cameraOrientationLockIntent('auto') === 'portrait'` locked the interface to `PORTRAIT_UP`.
  - Expected capture behavior: the **upright** capture saves a **portrait** file (height > width); the **rotated** capture saves a **landscape** file (width > height). This confirms `orientationSource={'device'}` reaches the `<Camera>` so the saved pixels follow the physical phone.

- [ ] **Step 3: LAND mode — forced landscape.**
  Switch the chip to **LAND**:
  - The interface rotates to landscape (lock-intent `'landscape'` → `ScreenOrientation.lockAsync(LANDSCAPE)`).
  - Capture while holding the phone in any orientation; the saved file is **landscape** (width > height) every time. This confirms `orientationSource={'interface'}` follows the landscape-locked UI.

- [ ] **Step 4: Inspect saved-file true dimensions (don't trust the on-screen thumbnail).**
  For each capture from Steps 2–3, read the saved file's real pixel dimensions to confirm orientation truth (not just preview rotation). On the iOS simulator the captured files live under the app sandbox; locate and inspect them with:
  ```bash
  find ~/Library/Developer/CoreSimulator/Devices -path '*Documents/pilgrimage-imports/*' -name '*.jpg' -mmin -10 -print 2>/dev/null | tail -5
  ```
  then for each path printed, read its pixel dimensions:
  ```bash
  sips -g pixelWidth -g pixelHeight "<PATH-FROM-ABOVE>"
  ```
  Expected: the AUTO-upright + LAND captures report `pixelHeight > pixelWidth` and `pixelWidth > pixelHeight` respectively, matching what you shot. (In-camera captures may also land in the app cache directory — if `find` above is empty, widen the search to `-path '*Application*' -name '*.jpg'`.)

- [ ] **Step 5: No reconfigure flicker on chip toggle.**
  Toggle AUTO ↔ LAND a few times while the preview is live. Expected: the preview re-orients smoothly with no black flash / full session rebuild (spec §3.1 runtime note — `orientationSource` is a plain `<Camera>` prop, swapping it must not rebuild the photo output). If you see a black flicker, flag it; it is out of scope to fix here but must be recorded.

- [ ] **Step 6: Unmount restores portrait.**
  From LAND mode, tap the close button (`router.back()`) to leave the camera. Expected: the destination screen (the previous pilgrimage screen) is **portrait** — confirming the hook's unmount effect ran `ScreenOrientation.lockAsync(PORTRAIT_UP)`. Re-enter the camera; it opens in AUTO/portrait, no stranded landscape lock.

  > Record the observed file dimensions + HUD behavior for the spec's closeout section. If AUTO-upright still produced a landscape file, the capture config (not just the thread) needs work — escalate to the spec's Step 0 / capture-config path; the orientation *thread* itself is verified by Steps 5–6 regardless.

---

## Phase 3 — Aspect-aware downstream (letterbox + dimension propagation)

This phase makes the captured `width/height` flow unbroken from preview → share → ShareCard, and switches the four cropping compare modes plus the orientation-mismatched share cell to letterbox (`contain`). Spec section 3.2 (B1/B2/B3) is the source of truth. The anime **reference** image always stays `cover` (it is context, not the user's frame); `full` mode is already aspect-aware via `resolveFullModeStageHeight` and is untouched.

Per the REPO TDD RULE: the aspect/ratio math, the share-param builder, and the route-dimension decode decision are PURE logic, so each gets a FAILING Bun unit test first. The RN JSX wiring (changing a `contentFit` prop, threading props through `ShareCard`) has no pure logic of its own and is verified by `bunx tsc --noEmit` plus an explicit on-device check task — no fabricated component unit test.

### Task 3.1: Pure aspect helpers — `shareRatioForShot` + `shotContentFitForCell` (TDD)

**Files:**
- Create: `libs/services/pilgrimage/share-aspect.ts`
- Test: `__tests__/unit/pilgrimage/share-aspect.test.ts`

- [ ] **Step 1: Write the failing test.** Create `__tests__/unit/pilgrimage/share-aspect.test.ts` with the complete contents:

```ts
import { describe, expect, it } from 'bun:test';
import {
  shareRatioForShot,
  shotContentFitForCell,
  shotOrientation,
} from '../../../libs/services/pilgrimage/share-aspect';

describe('shotOrientation', () => {
  it('classifies portrait, landscape, and square from real pixel dims', () => {
    expect(shotOrientation(3024, 4032)).toBe('portrait');
    expect(shotOrientation(4032, 3024)).toBe('landscape');
    expect(shotOrientation(1080, 1080)).toBe('square');
  });

  it('returns "unknown" when either dimension is missing or non-positive', () => {
    expect(shotOrientation(0, 4032)).toBe('unknown');
    expect(shotOrientation(3024, 0)).toBe('unknown');
    expect(shotOrientation(null, 4032)).toBe('unknown');
    expect(shotOrientation(3024, undefined)).toBe('unknown');
    expect(shotOrientation(Number.NaN, 4032)).toBe('unknown');
  });
});

describe('shareRatioForShot', () => {
  it('defaults a portrait shot to the 9:16 story ratio', () => {
    expect(shareRatioForShot(3024, 4032)).toBe('9:16');
  });

  it('defaults landscape and square shots to the 1:1 feed ratio', () => {
    expect(shareRatioForShot(4032, 3024)).toBe('1:1');
    expect(shareRatioForShot(1080, 1080)).toBe('1:1');
  });

  it('defaults to 1:1 when the shot dimensions are unknown', () => {
    expect(shareRatioForShot(0, 0)).toBe('1:1');
    expect(shareRatioForShot(null, null)).toBe('1:1');
    expect(shareRatioForShot(undefined, 4032)).toBe('1:1');
  });
});

describe('shotContentFitForCell', () => {
  it('letterboxes (contain) when the shot and cell orientations differ', () => {
    // Portrait shot in a landscape (16:9) cell.
    expect(shotContentFitForCell(3024 / 4032, 16 / 9)).toBe('contain');
    // Landscape shot in a portrait (9:16) cell.
    expect(shotContentFitForCell(4032 / 3024, 9 / 16)).toBe('contain');
  });

  it('fills (cover) when the shot and cell share an orientation', () => {
    // Portrait shot in a portrait cell.
    expect(shotContentFitForCell(3024 / 4032, 9 / 16)).toBe('cover');
    // Landscape shot in a landscape cell.
    expect(shotContentFitForCell(4032 / 3024, 16 / 9)).toBe('cover');
    // Both square (1:1 cell).
    expect(shotContentFitForCell(1, 1)).toBe('cover');
  });

  it('fills (cover) when either aspect is unknown — never invents a letterbox', () => {
    expect(shotContentFitForCell(null, 16 / 9)).toBe('cover');
    expect(shotContentFitForCell(3024 / 4032, undefined)).toBe('cover');
    expect(shotContentFitForCell(0, 1)).toBe('cover');
    expect(shotContentFitForCell(Number.NaN, 1)).toBe('cover');
  });
});
```

- [ ] **Step 2: Run the test — confirm RED.** The module does not exist yet.

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/share-aspect.test.ts
```

Expected output (FAIL): a resolution error — `error: Cannot find module '.../libs/services/pilgrimage/share-aspect'` — so 0 tests pass.

- [ ] **Step 3: Create the implementation.** Create `libs/services/pilgrimage/share-aspect.ts` with the complete contents:

```ts
// Aspect helpers for the share pipeline. The captured `width/height` is the
// orientation truth carried from capture → preview → share → ShareCard. These
// pure helpers turn that truth into (a) a sensible default share ratio and
// (b) a per-cell `contentFit`, so a portrait shot dropped into a landscape
// cell letterboxes (`contain`) instead of being cropped (`cover`). The anime
// reference image is NOT routed through this — it always uses `cover`.

import type { ShareRatio } from '../../../components/pilgrimage/ShareCard';

export type ShotOrientation = 'portrait' | 'landscape' | 'square' | 'unknown';

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Classify a shot's orientation from its real pixel dimensions. */
export function shotOrientation(
  width: number | null | undefined,
  height: number | null | undefined
): ShotOrientation {
  if (!isPositiveFinite(width) || !isPositiveFinite(height)) return 'unknown';
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

/**
 * Default share ratio for a freshly opened share screen. Portrait shots open
 * on the 9:16 "story" ratio so the whole frame fits; everything else (and the
 * unknown case) opens on the square "feed" ratio. The user can still change it.
 */
export function shareRatioForShot(
  width: number | null | undefined,
  height: number | null | undefined
): ShareRatio {
  return shotOrientation(width, height) === 'portrait' ? '9:16' : '1:1';
}

function orientationFromAspect(aspect: number | null | undefined): ShotOrientation {
  if (!isPositiveFinite(aspect)) return 'unknown';
  if (aspect > 1) return 'landscape';
  if (aspect < 1) return 'portrait';
  return 'square';
}

/**
 * `contentFit` for the user-shot cell: `contain` (letterbox, no crop) when the
 * shot and the cell have different orientations, otherwise `cover` (fill). When
 * either aspect is unknown we fall back to `cover` — we never invent a
 * letterbox we can't justify. `square` matches every orientation (no crop risk
 * either way), so it stays `cover`.
 */
export function shotContentFitForCell(
  shotAspect: number | null | undefined,
  cellAspect: number | null | undefined
): 'cover' | 'contain' {
  const shot = orientationFromAspect(shotAspect);
  const cell = orientationFromAspect(cellAspect);
  if (shot === 'unknown' || cell === 'unknown') return 'cover';
  if (shot === 'square' || cell === 'square') return 'cover';
  return shot === cell ? 'cover' : 'contain';
}
```

- [ ] **Step 4: Run the test — confirm GREEN.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/share-aspect.test.ts
```

Expected output (PASS): all 3 `describe` blocks pass — `8 pass, 0 fail` (shotOrientation 2 + shareRatioForShot 3 + shotContentFitForCell 3).

- [ ] **Step 5: Typecheck the new module.**

```bash
bunx tsc --noEmit
```

Expected output: no errors (exit 0). The `import type { ShareRatio }` resolves against the existing export in `components/pilgrimage/ShareCard.tsx:35`.

- [ ] **Step 6: Commit.**

```bash
git add libs/services/pilgrimage/share-aspect.ts __tests__/unit/pilgrimage/share-aspect.test.ts
git commit -m "feat(camera): add pure share-aspect helpers (ratio + letterbox decision)"
```

---

### Task 3.2: Preview compare modes — user-shot `cover` → `contain` (B1)

**Files:**
- Modify: `app/(tabs)/pilgrimage/compare/preview.tsx` (lines 853, 861, 874, 1345)
- Test: none (pure JSX `contentFit` change — verified by `tsc` + Task 3.7 device pass, per REPO TDD RULE)

Background: only four of the five compare modes share a fixed `height: 360` stage (`styles.stage`, preview.tsx:1642-1646) with `contentFit="cover"`; that crops portrait shots. `full` mode already sizes the stage to the shot aspect via `resolveFullModeStageHeight` (preview.tsx:829-835) so it is left alone. We switch only the **user's shot** to `contain`; the anime reference (`imageUrl`) stays `cover`.

- [ ] **Step 1: Overlay mode — user shot to `contain`.** In `app/(tabs)/pilgrimage/compare/preview.tsx`, the overlay branch currently is (lines 851-862):

```tsx
              ) : mode === 'overlay' ? (
                <View style={styles.overlayFlow}>
                  <Image source={{ uri: shotUri }} style={styles.fullImage} contentFit="cover" />
                  <Image
                    source={{ uri: imageUrl }}
                    style={[
                      styles.fullImage,
                      StyleSheet.absoluteFill,
                      { opacity: overlayOpacity },
                    ]}
                    contentFit="cover"
                  />
```

Change ONLY the first (user-shot) image's `contentFit` to `"contain"` so the user's frame letterboxes; the second image is the anime reference (`imageUrl`) and stays `"cover"`:

```tsx
              ) : mode === 'overlay' ? (
                <View style={styles.overlayFlow}>
                  <Image source={{ uri: shotUri }} style={styles.fullImage} contentFit="contain" />
                  <Image
                    source={{ uri: imageUrl }}
                    style={[
                      styles.fullImage,
                      StyleSheet.absoluteFill,
                      { opacity: overlayOpacity },
                    ]}
                    contentFit="cover"
                  />
```

- [ ] **Step 2: Slider mode — user shot to `contain`.** The slider branch currently is (lines 871-883):

```tsx
              ) : mode === 'slider' ? (
                <GestureDetector gesture={sliderPan}>
                  <View style={styles.sliderFlow}>
                    <Image source={{ uri: shotUri }} style={styles.fullImage} contentFit="cover" />
                    <Animated.View style={[styles.sliderClip, sliderClipStyle]}>
                      {stagePx.width > 0 ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: stagePx.width, height: stagePx.height }}
                          contentFit="cover"
                        />
                      ) : null}
                    </Animated.View>
```

Change ONLY the first (user-shot, `shotUri`) image to `"contain"`. The clipped `imageUrl` image is the anime reference and stays `"cover"`:

```tsx
              ) : mode === 'slider' ? (
                <GestureDetector gesture={sliderPan}>
                  <View style={styles.sliderFlow}>
                    <Image source={{ uri: shotUri }} style={styles.fullImage} contentFit="contain" />
                    <Animated.View style={[styles.sliderClip, sliderClipStyle]}>
                      {stagePx.width > 0 ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: stagePx.width, height: stagePx.height }}
                          contentFit="cover"
                        />
                      ) : null}
                    </Animated.View>
```

- [ ] **Step 3: Stacked + side-by-side modes — pass a `contentFit` into `LabeledImage`.** These two modes render the user shot through the `LabeledImage` helper, which hardcodes `contentFit="cover"` (preview.tsx:1345). Add an optional `contentFit` prop so the user-shot calls can request `"contain"` while the anime calls keep `"cover"`. First update the `LabeledImage` signature + body (lines 1332-1345) — current:

```tsx
function LabeledImage({
  uri,
  label,
  accent,
  compact,
}: {
  uri: string;
  label: string;
  accent: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.labelWrap, compact && { flex: 1 }]}>
      <Image source={{ uri }} style={styles.fullImage} contentFit="cover" />
```

Replace with (adds `contentFit` prop, default `'cover'`):

```tsx
function LabeledImage({
  uri,
  label,
  accent,
  compact,
  contentFit = 'cover',
}: {
  uri: string;
  label: string;
  accent: string;
  compact?: boolean;
  contentFit?: 'cover' | 'contain';
}) {
  return (
    <View style={[styles.labelWrap, compact && { flex: 1 }]}>
      <Image source={{ uri }} style={styles.fullImage} contentFit={contentFit} />
```

- [ ] **Step 4: Stacked mode — pass `contentFit="contain"` on the user-shot `LabeledImage`.** The stacked branch currently is (lines 837-841):

```tsx
              {mode === 'stacked' ? (
                <View style={styles.stackedFlow}>
                  <LabeledImage uri={imageUrl} label={t('commonUi.anime')} accent={themeColor} />
                  <LabeledImage uri={shotUri} label={t('pilgrimageUi.yourShot')} accent={themeColor} />
                </View>
```

Add `contentFit="contain"` to ONLY the second (`shotUri`) `LabeledImage`; the `imageUrl` one stays default `cover`:

```tsx
              {mode === 'stacked' ? (
                <View style={styles.stackedFlow}>
                  <LabeledImage uri={imageUrl} label={t('commonUi.anime')} accent={themeColor} />
                  <LabeledImage
                    uri={shotUri}
                    label={t('pilgrimageUi.yourShot')}
                    accent={themeColor}
                    contentFit="contain"
                  />
                </View>
```

- [ ] **Step 5: Side-by-side mode — pass `contentFit="contain"` on the user-shot `LabeledImage`.** The sideBySide branch currently is (lines 842-850):

```tsx
              ) : mode === 'sideBySide' ? (
                <View style={styles.sideFlow}>
                  <View style={styles.sideHalf}>
                    <LabeledImage uri={imageUrl} label={t('commonUi.anime')} accent={themeColor} compact />
                  </View>
                  <View style={styles.sideHalf}>
                    <LabeledImage uri={shotUri} label={t('pilgrimageUi.yourShot')} accent={themeColor} compact />
                  </View>
                </View>
```

Add `contentFit="contain"` to ONLY the second (`shotUri`) `LabeledImage`:

```tsx
              ) : mode === 'sideBySide' ? (
                <View style={styles.sideFlow}>
                  <View style={styles.sideHalf}>
                    <LabeledImage uri={imageUrl} label={t('commonUi.anime')} accent={themeColor} compact />
                  </View>
                  <View style={styles.sideHalf}>
                    <LabeledImage
                      uri={shotUri}
                      label={t('pilgrimageUi.yourShot')}
                      accent={themeColor}
                      compact
                      contentFit="contain"
                    />
                  </View>
                </View>
```

- [ ] **Step 6: Confirm `full` mode is untouched.** Re-read lines 904-918 and verify the `full` branch user-shot `Image` still reads `contentFit="cover"` (the comment there at lines 905-908 explicitly notes cover/contain agree because the stage already matches the shot aspect). Make NO change here — the contract states `'full' mode unchanged`.

- [ ] **Step 7: Typecheck.**

```bash
bunx tsc --noEmit
```

Expected output: no errors (exit 0). The new `contentFit?: 'cover' | 'contain'` prop is optional and every call site passes a valid literal.

- [ ] **Step 8: Commit.**

```bash
git add app/\(tabs\)/pilgrimage/compare/preview.tsx
git commit -m "fix(camera): letterbox the user shot in stacked/sideBySide/overlay/slider preview modes"
```

---

### Task 3.3: `handleShare` forwards `shotWidth`/`shotHeight` via a pure builder (B2, TDD)

**Files:**
- Create: `libs/services/pilgrimage/share-route-params.ts`
- Test: `__tests__/unit/pilgrimage/share-route-params.test.ts`
- Modify: `app/(tabs)/pilgrimage/compare/preview.tsx` (handleShare body, lines 485-516; dep array lines 517-531; import block lines 41-42)

The contract requires `shareParams.shotWidth = String(focusedShot.width)` and `shotHeight` likewise. To make the param assembly unit-testable (the conditional-inclusion logic is real pure logic worth pinning), extract a `buildShareRouteParams` pure helper and call it from `handleShare`.

- [ ] **Step 1: Write the failing test.** Create `__tests__/unit/pilgrimage/share-route-params.test.ts` with the complete contents:

```ts
import { describe, expect, it } from 'bun:test';
import { buildShareRouteParams } from '../../../libs/services/pilgrimage/share-route-params';

const base = {
  spotId: 'spot-7',
  imageUrl: 'https://cdn/scene.jpg',
  shotUri: 'file:///shot.jpg',
  name: '駅前の坂道',
  ep: '3',
  animeId: '12345',
  animeTitle: 'My Anime',
  themeColor: '#FF9F0A',
  spotLat: '35.0316',
  spotLng: '135.7721',
  shotWidth: 3024,
  shotHeight: 4032,
} as const;

describe('buildShareRouteParams', () => {
  it('always forwards the captured shot dimensions as strings', () => {
    const params = buildShareRouteParams(base);
    expect(params.shotWidth).toBe('3024');
    expect(params.shotHeight).toBe('4032');
  });

  it('carries the core scene metadata through verbatim', () => {
    const params = buildShareRouteParams(base);
    expect(params.spotId).toBe('spot-7');
    expect(params.imageUrl).toBe('https://cdn/scene.jpg');
    expect(params.shotUri).toBe('file:///shot.jpg');
    expect(params.name).toBe('駅前の坂道');
    expect(params.ep).toBe('3');
    expect(params.animeId).toBe('12345');
    expect(params.animeTitle).toBe('My Anime');
    expect(params.themeColor).toBe('#FF9F0A');
    expect(params.spotLat).toBe('35.0316');
    expect(params.spotLng).toBe('135.7721');
  });

  it('coerces null-ish scalar fields to empty strings (router-safe)', () => {
    const params = buildShareRouteParams({
      ...base,
      ep: null,
      animeId: null,
      animeTitle: null,
      spotLat: null,
      spotLng: null,
    });
    expect(params.ep).toBe('');
    expect(params.animeId).toBe('');
    expect(params.animeTitle).toBe('');
    expect(params.spotLat).toBe('');
    expect(params.spotLng).toBe('');
  });

  it('omits optional sensor/score params when their values are absent', () => {
    const params = buildShareRouteParams(base);
    expect('tilt' in params).toBe(false);
    expect('headingDeltaDeg' in params).toBe(false);
    expect('matchScore' in params).toBe(false);
    expect('frameValid' in params).toBe(false);
    expect('frameReason' in params).toBe(false);
    expect('positionScore' in params).toBe(false);
  });

  it('includes the sensor + score params when present, stringified', () => {
    const params = buildShareRouteParams({
      ...base,
      tilt: 1.5,
      headingDeltaDeg: -4.25,
      matchScore: 72,
      frameValid: true,
      frameReason: 'dark',
      positionScore: 88,
    });
    expect(params.tilt).toBe('1.5');
    expect(params.headingDeltaDeg).toBe('-4.25');
    expect(params.matchScore).toBe('72');
    expect(params.frameValid).toBe('1');
    expect(params.frameReason).toBe('dark');
    expect(params.positionScore).toBe('88');
  });

  it('encodes frameValid=false as "0" (suppresses a misleading badge downstream)', () => {
    const params = buildShareRouteParams({ ...base, frameValid: false });
    expect(params.frameValid).toBe('0');
  });
});
```

- [ ] **Step 2: Run the test — confirm RED.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/share-route-params.test.ts
```

Expected output (FAIL): `error: Cannot find module '.../libs/services/pilgrimage/share-route-params'` — 0 tests pass.

- [ ] **Step 3: Create the implementation.** Create `libs/services/pilgrimage/share-route-params.ts` with the complete contents:

```ts
// Pure builder for the share-route params object. `preview.tsx` hands over the
// already-resolved focused-shot values; this module stringifies them into the
// router-safe `Record<string, string>` the share screen reads back. The shot's
// captured width/height are ALWAYS forwarded (the orientation truth the share
// pipeline letterboxes against); the optional sensor/score fields are only
// included when present so the share screen can tell "absent" from "0".

export type ShareRouteParamsInput = {
  spotId: string;
  imageUrl: string;
  shotUri: string;
  name: string;
  ep: string | null;
  animeId: string | null;
  animeTitle: string | null;
  themeColor: string;
  spotLat: string | null;
  spotLng: string | null;
  /** Captured shot pixel dimensions — the orientation truth, always forwarded. */
  shotWidth: number;
  shotHeight: number;
  /** Optional capture-time sensor snapshot (forwarded only when measured). */
  tilt?: number | null;
  headingDeltaDeg?: number | null;
  /** Optional analysis results (forwarded only when computed). */
  matchScore?: number | null;
  frameValid?: boolean | null;
  frameReason?: string | null;
  positionScore?: number | null;
};

export function buildShareRouteParams(input: ShareRouteParamsInput): Record<string, string> {
  const params: Record<string, string> = {
    spotId: input.spotId,
    imageUrl: input.imageUrl,
    shotUri: input.shotUri,
    name: input.name,
    ep: input.ep ?? '',
    animeId: input.animeId ?? '',
    animeTitle: input.animeTitle ?? '',
    themeColor: input.themeColor,
    spotLat: input.spotLat ?? '',
    spotLng: input.spotLng ?? '',
    // Orientation truth — always carried so the share pipeline can letterbox.
    shotWidth: String(input.shotWidth),
    shotHeight: String(input.shotHeight),
  };
  if (input.tilt != null) params.tilt = String(input.tilt);
  if (input.headingDeltaDeg != null) params.headingDeltaDeg = String(input.headingDeltaDeg);
  if (input.matchScore != null) params.matchScore = String(input.matchScore);
  if (input.frameValid != null) params.frameValid = input.frameValid ? '1' : '0';
  if (input.frameReason != null && input.frameReason.length > 0) {
    params.frameReason = input.frameReason;
  }
  if (input.positionScore != null) params.positionScore = String(input.positionScore);
  return params;
}
```

- [ ] **Step 4: Run the test — confirm GREEN.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/share-route-params.test.ts
```

Expected output (PASS): `6 pass, 0 fail`.

- [ ] **Step 5: Wire `preview.tsx` to use the builder.** Add the import. The current import block ends at lines 41-42 with:

```tsx
import { getNumberParam, getStringParam } from '../../../../libs/utils/route-params';
import { AnitabiOriginCredit } from '../../../../components/pilgrimage/common/AnitabiOriginCredit';
```

Insert the new import between them:

```tsx
import { getNumberParam, getStringParam } from '../../../../libs/utils/route-params';
import { buildShareRouteParams } from '../../../../libs/services/pilgrimage/share-route-params';
import { AnitabiOriginCredit } from '../../../../components/pilgrimage/common/AnitabiOriginCredit';
```

- [ ] **Step 6: Replace the hand-built `shareParams` in `handleShare`.** The current `handleShare` body (lines 482-516) is:

```tsx
  const handleShare = useCallback(() => {
    if (!focusedShot) return;
    hapticsBridge.tap();
    const shareParams: Record<string, string> = {
      spotId,
      imageUrl,
      shotUri: focusedShot.uri,
      name: sceneName,
      ep: ep ?? '',
      animeId: animeId ?? '',
      animeTitle: animeTitle ?? '',
      themeColor,
      spotLat: spotLat ?? '',
      spotLng: spotLng ?? '',
    };
    // Forward the shot's sensor snapshot so the share screen's auto-perspective
    // (Track C #8) can correct tilt/heading without re-measuring.
    if (focusedShot.tilt != null) shareParams.tilt = String(focusedShot.tilt);
    if (focusedShot.headingDeltaDeg != null) {
      shareParams.headingDeltaDeg = String(focusedShot.headingDeltaDeg);
    }
    if (frameMatch?.total != null) {
      shareParams.matchScore = String(Math.round(frameMatch.total * 100));
    }
    if (frameMatch) {
      shareParams.frameValid = frameMatch.valid ? '1' : '0';
      if (frameMatch.reason) shareParams.frameReason = frameMatch.reason;
    }
    if (positionScore?.total != null) {
      shareParams.positionScore = String(Math.round(positionScore.total * 100));
    }
    router.push({
      pathname: '/pilgrimage/compare/share',
      params: shareParams,
    });
  }, [
```

Replace that body (everything from `const shareParams` through the `router.push({...})` call) with a single call to the builder, which now also forwards `shotWidth`/`shotHeight`:

```tsx
  const handleShare = useCallback(() => {
    if (!focusedShot) return;
    hapticsBridge.tap();
    // The captured width/height is the orientation truth — forward it so the
    // share screen + ShareCard letterbox a portrait shot instead of cropping.
    // The sensor snapshot (tilt/headingDeltaDeg) feeds the share screen's
    // auto-perspective (Track C #8) without re-measuring.
    const shareParams = buildShareRouteParams({
      spotId,
      imageUrl,
      shotUri: focusedShot.uri,
      name: sceneName,
      ep,
      animeId,
      animeTitle,
      themeColor,
      spotLat,
      spotLng,
      shotWidth: focusedShot.width,
      shotHeight: focusedShot.height,
      tilt: focusedShot.tilt,
      headingDeltaDeg: focusedShot.headingDeltaDeg,
      matchScore: frameMatch?.total != null ? Math.round(frameMatch.total * 100) : null,
      frameValid: frameMatch ? frameMatch.valid : null,
      frameReason: frameMatch?.reason ?? null,
      positionScore:
        positionScore?.total != null ? Math.round(positionScore.total * 100) : null,
    });
    router.push({
      pathname: '/pilgrimage/compare/share',
      params: shareParams,
    });
  }, [
```

Leave the existing dependency array (lines 517-531) unchanged — it already lists `router, focusedShot, spotId, imageUrl, sceneName, ep, animeId, animeTitle, themeColor, spotLat, spotLng, frameMatch, positionScore`, all of which the new body still reads (`focusedShot.width/height/tilt/headingDeltaDeg` are covered by `focusedShot`).

- [ ] **Step 7: Typecheck.**

```bash
bunx tsc --noEmit
```

Expected output: no errors (exit 0). `ep`, `animeId`, `animeTitle`, `spotLat`, `spotLng` are `string | null` in scope (from `getStringParam`), matching the `ShareRouteParamsInput` field types; `focusedShot.width`/`.height` are `number` on `CaptureSessionShot`.

- [ ] **Step 8: Commit.**

```bash
git add libs/services/pilgrimage/share-route-params.ts __tests__/unit/pilgrimage/share-route-params.test.ts app/\(tabs\)/pilgrimage/compare/preview.tsx
git commit -m "feat(camera): forward captured shot dimensions through the share route params"
```

---

### Task 3.4: `share.tsx` reads dims, derives aspect, defaults the portrait ratio (B2)

**Files:**
- Modify: `app/(tabs)/pilgrimage/compare/share.tsx` (import block lines 33-41; param reads lines 93-94; ratio state line 97; ShareCard call lines 362-368)
- Test: none for `share.tsx` itself (the derivation logic is the already-tested `shareRatioForShot`/`shotContentFitForCell`; the screen only threads values — verified by `tsc` + Task 3.7)

- [ ] **Step 1: Import the aspect helpers.** The current import block has (lines 33-41):

```tsx
import { getNumberParam, getStringParam } from '../../../../libs/utils/route-params';
import {
  ShareCard,
  SHARE_TEMPLATES,
  SHARE_RATIOS,
  ratioToAspect,
  type ShareRatio,
  type ShareTemplate,
} from '../../../../components/pilgrimage/ShareCard';
```

Add the `share-aspect` import directly after the `ShareCard` import:

```tsx
import { getNumberParam, getStringParam } from '../../../../libs/utils/route-params';
import {
  ShareCard,
  SHARE_TEMPLATES,
  SHARE_RATIOS,
  ratioToAspect,
  type ShareRatio,
  type ShareTemplate,
} from '../../../../components/pilgrimage/ShareCard';
import { shareRatioForShot } from '../../../../libs/services/pilgrimage/share-aspect';
```

- [ ] **Step 2: Read the shot dimensions from params.** The current scalar param reads end at (lines 93-94):

```tsx
  const imageUrl = getStringParam(params, 'imageUrl') ?? '';
  const shotUri = getStringParam(params, 'shotUri') ?? '';
```

Add the two dimension reads immediately after (`getNumberParam` is already imported at line 33):

```tsx
  const imageUrl = getStringParam(params, 'imageUrl') ?? '';
  const shotUri = getStringParam(params, 'shotUri') ?? '';
  // Captured shot dimensions (orientation truth) forwarded by preview.tsx via
  // buildShareRouteParams. `0` / missing → unknown; the helpers fall back to
  // square/cover and never invent a letterbox.
  const shotWidth = getNumberParam(params, 'shotWidth') ?? 0;
  const shotHeight = getNumberParam(params, 'shotHeight') ?? 0;
```

- [ ] **Step 3: Default the ratio state to the shot-aware ratio.** The current ratio state is (line 97):

```tsx
  const [ratio, setRatio] = useState<ShareRatio>('1:1');
```

Seed the initial value from the shot so a portrait shot opens on 9:16 (lazy initializer reads the route-param dims, which are stable for the screen's lifetime). The user can still tap another ratio chip afterward:

```tsx
  const [ratio, setRatio] = useState<ShareRatio>(() => shareRatioForShot(shotWidth, shotHeight));
```

- [ ] **Step 4: Pass `shotWidth`/`shotHeight` into `<ShareCard>`.** The current `<ShareCard>` call opens (lines 362-368):

```tsx
              <ShareCard
                ref={cardRef}
                template={template}
                ratio={ratio}
                width={cardWidth}
                imageUrl={imageUrl}
                shotUri={effectiveShotUri}
```

Add the two dimension props right after `shotUri` so `ShareCard` can decide per-cell `contentFit`:

```tsx
              <ShareCard
                ref={cardRef}
                template={template}
                ratio={ratio}
                width={cardWidth}
                imageUrl={imageUrl}
                shotUri={effectiveShotUri}
                shotWidth={shotWidth}
                shotHeight={shotHeight}
```

- [ ] **Step 5: Typecheck.** This will FAIL until Task 3.5 adds the props to `ShareCardProps`.

```bash
bunx tsc --noEmit
```

Expected output (FAIL, expected): an error at the `<ShareCard>` call — `Type '{ ...; shotWidth: number; shotHeight: number; }' is not assignable ... Property 'shotWidth' does not exist on type ...`. This is resolved by the next task; do NOT commit yet.

- [ ] **Step 6: Proceed to Task 3.5, then return.** After Task 3.5 lands the props, re-run `bunx tsc --noEmit` here and confirm exit 0, then commit both screens together in Task 3.5 Step 13.

---

### Task 3.5: `ShareCard` gains `shotWidth?`/`shotHeight?` and lets the user cell letterbox (B2)

**Files:**
- Modify: `components/pilgrimage/ShareCard.tsx` (`ShareCardProps` lines 87-93; import lines 28-32; `ShareCard` body + template spread lines 101-129; `TemplateProps` line 144; `ImagePair` lines 148-213; `PerspectiveImage` lines 268-307; `ImageCell` lines 309-342; four template `ImagePair` calls; Manga `real` cell lines 1035-1042)
- Test: none (prop threading + `contentFit` selection delegated to the already-tested `shotContentFitForCell` — verified by `tsc` + Task 3.7)

The user-shot cell renders through `PerspectiveImage` → `FilteredImage` with a hardcoded `contentFit="cover"` (ShareCard.tsx:300, 303). We thread a computed `contentFit` down to the user cell only; the anime cell's `ImageCell`/`Image` stays `cover`. The per-cell aspect differs by ratio and layout (portrait ratio stacks → each cell ~`width : height/2`; landscape ratios place cells side by side). We pass the cell's orientation as a simple aspect and let `shotContentFitForCell` decide.

- [ ] **Step 1: Add the two optional props to `ShareCardProps`.** The current `ShareCardProps` ends (lines 87-93):

```tsx
  /**
   * Manual corner-pin warp as [0..1] corner fractions (order tl, tr, br, bl).
   * Rebuilt into a matrix at each cell's measured size (resolution-independent).
   */
  shotManualWarpCorners?: readonly Pt[] | null;
  ref?: Ref<View>;
};
```

Insert the two dimension props before `ref`:

```tsx
  /**
   * Manual corner-pin warp as [0..1] corner fractions (order tl, tr, br, bl).
   * Rebuilt into a matrix at each cell's measured size (resolution-independent).
   */
  shotManualWarpCorners?: readonly Pt[] | null;
  /**
   * Captured shot pixel dimensions (orientation truth). When the shot's
   * orientation differs from its cell's, the user-shot cell uses
   * `contentFit="contain"` (letterbox, no crop); the anime reference cell
   * always stays `cover`. Missing / 0 → fall back to `cover`.
   */
  shotWidth?: number;
  shotHeight?: number;
  ref?: Ref<View>;
};
```

- [ ] **Step 2: Import `shotContentFitForCell` + `shotOrientation`.** The current `share-perspective` import (lines 28-32) ends:

```tsx
import {
  cornerFractionsToMatrix4,
  type Pt,
  type RNPerspectiveTransform,
} from '../../libs/services/pilgrimage/share-perspective';
```

Add a sibling import directly after it:

```tsx
import {
  cornerFractionsToMatrix4,
  type Pt,
  type RNPerspectiveTransform,
} from '../../libs/services/pilgrimage/share-perspective';
import { shotContentFitForCell, shotOrientation } from '../../libs/services/pilgrimage/share-aspect';
```

- [ ] **Step 3: Compute the user-cell `contentFit` in `ShareCard` and thread it to the templates.** First derive it in the `ShareCard` function. The current `ShareCard` body opens (lines 101-117):

```tsx
export function ShareCard(props: ShareCardProps) {
  const {
    template,
    ratio,
    width,
    watermarkText,
    watermarkPosition,
    watermarkOpacity,
    watermarkColor,
    watermarkFont,
    theme,
  } = props;
  const aspect = RATIO_VALUES[ratio];
  const height = Math.round(width / aspect);
  const canvasBg = resolveBackgroundColor(template, props.customBg, theme.background.secondary);

  return (
```

Add a `shotContentFit` derivation after `canvasBg`. Each ImagePair cell takes a portrait-ish shape in `9:16` (cells stacked vertically) and a landscape-ish shape in `1:1`/`16:9` (cells side by side) — so the *cell* aspect is `< 1` (portrait) for the `9:16` ratio and `>= 1` (landscape/square) otherwise. Encode that as the cell aspect we feed the helper:

```tsx
export function ShareCard(props: ShareCardProps) {
  const {
    template,
    ratio,
    width,
    watermarkText,
    watermarkPosition,
    watermarkOpacity,
    watermarkColor,
    watermarkFont,
    theme,
  } = props;
  const aspect = RATIO_VALUES[ratio];
  const height = Math.round(width / aspect);
  const canvasBg = resolveBackgroundColor(template, props.customBg, theme.background.secondary);

  // Per-cell contentFit for the USER shot only. In 9:16 the two cells stack
  // (each cell is portrait-ish); in 1:1 / 16:9 they sit side by side (each cell
  // is landscape-ish). Feed that cell orientation + the shot orientation to the
  // pure helper so a portrait shot in a landscape cell letterboxes instead of
  // cropping. The anime reference cell always stays `cover`.
  const shotAspect =
    shotOrientation(props.shotWidth, props.shotHeight) === 'unknown'
      ? null
      : (props.shotWidth as number) / (props.shotHeight as number);
  const cellAspect = ratio === '9:16' ? 9 / 16 : 16 / 9;
  const shotContentFit = shotContentFitForCell(shotAspect, cellAspect);

  return (
```

- [ ] **Step 4: Thread `shotContentFit` into every template.** The `ShareCard` return spreads `{...props}` plus `height`/`canvasBg` into each template (lines 119-129):

```tsx
      {template === 'polaroid' ? (
        <PolaroidTemplate {...props} height={height} canvasBg={canvasBg} />
      ) : template === 'classic' ? (
        <ClassicTemplate {...props} height={height} canvasBg={canvasBg} />
      ) : template === 'minimal' ? (
        <MinimalTemplate {...props} height={height} canvasBg={canvasBg} />
      ) : template === 'comic' ? (
        <ComicTemplate {...props} height={height} canvasBg={canvasBg} />
      ) : (
        <MangaTemplate {...props} height={height} canvasBg={canvasBg} />
      )}
```

Replace with (passes the computed `shotContentFit` into every template):

```tsx
      {template === 'polaroid' ? (
        <PolaroidTemplate {...props} height={height} canvasBg={canvasBg} shotContentFit={shotContentFit} />
      ) : template === 'classic' ? (
        <ClassicTemplate {...props} height={height} canvasBg={canvasBg} shotContentFit={shotContentFit} />
      ) : template === 'minimal' ? (
        <MinimalTemplate {...props} height={height} canvasBg={canvasBg} shotContentFit={shotContentFit} />
      ) : template === 'comic' ? (
        <ComicTemplate {...props} height={height} canvasBg={canvasBg} shotContentFit={shotContentFit} />
      ) : (
        <MangaTemplate {...props} height={height} canvasBg={canvasBg} shotContentFit={shotContentFit} />
      )}
```

- [ ] **Step 5: Widen `TemplateProps` to carry `shotContentFit`.** The current type alias (line 144):

```tsx
type TemplateProps = ShareCardProps & { height: number; canvasBg: string };
```

Replace with:

```tsx
type TemplateProps = ShareCardProps & {
  height: number;
  canvasBg: string;
  shotContentFit: 'cover' | 'contain';
};
```

- [ ] **Step 6: Extend `ImagePair` to accept + forward `shotContentFit` to the `real` cell.** Its current parameter list + body opens (lines 148-213):

```tsx
function ImagePair({
  ratio,
  imageUrl,
  shotUri,
  accent,
  successColor,
  swapOrder = false,
  badgeStyle = 'pill',
  borderRadius = 8,
  gap = 6,
  shotFilterMatrix = null,
  shotPerspectiveTransform,
  shotManualWarpCorners,
}: {
  ratio: ShareRatio;
  imageUrl: string;
  shotUri: string;
  accent: string;
  successColor: string;
  swapOrder?: boolean;
  badgeStyle?: 'pill' | 'square' | 'sticker';
  borderRadius?: number;
  gap?: number;
  shotFilterMatrix?: number[] | null;
  shotPerspectiveTransform?: RNPerspectiveTransform;
  shotManualWarpCorners?: readonly Pt[] | null;
}) {
  const isPortrait = ratio === '9:16';
  const order = resolveImagePairOrder(swapOrder);
  const cells = {
    anime: (
      <ImageCell
        key="anime"
        uri={imageUrl}
        badge="ANIME"
        color={accent}
        radius={borderRadius}
        style={badgeStyle}
      />
    ),
    real: (
      <ImageCell
        key="real"
        uri={shotUri}
        badge="REAL"
        color={successColor}
        radius={borderRadius}
        style={badgeStyle}
        filterMatrix={shotFilterMatrix}
        perspectiveTransform={shotPerspectiveTransform}
        manualWarpCorners={shotManualWarpCorners}
      />
    ),
  };
```

Replace with (adds `shotContentFit` param defaulting to `'cover'`, and forwards it to ONLY the `real` cell):

```tsx
function ImagePair({
  ratio,
  imageUrl,
  shotUri,
  accent,
  successColor,
  swapOrder = false,
  badgeStyle = 'pill',
  borderRadius = 8,
  gap = 6,
  shotFilterMatrix = null,
  shotPerspectiveTransform,
  shotManualWarpCorners,
  shotContentFit = 'cover',
}: {
  ratio: ShareRatio;
  imageUrl: string;
  shotUri: string;
  accent: string;
  successColor: string;
  swapOrder?: boolean;
  badgeStyle?: 'pill' | 'square' | 'sticker';
  borderRadius?: number;
  gap?: number;
  shotFilterMatrix?: number[] | null;
  shotPerspectiveTransform?: RNPerspectiveTransform;
  shotManualWarpCorners?: readonly Pt[] | null;
  shotContentFit?: 'cover' | 'contain';
}) {
  const isPortrait = ratio === '9:16';
  const order = resolveImagePairOrder(swapOrder);
  const cells = {
    anime: (
      <ImageCell
        key="anime"
        uri={imageUrl}
        badge="ANIME"
        color={accent}
        radius={borderRadius}
        style={badgeStyle}
      />
    ),
    real: (
      <ImageCell
        key="real"
        uri={shotUri}
        badge="REAL"
        color={successColor}
        radius={borderRadius}
        style={badgeStyle}
        filterMatrix={shotFilterMatrix}
        perspectiveTransform={shotPerspectiveTransform}
        manualWarpCorners={shotManualWarpCorners}
        contentFit={shotContentFit}
      />
    ),
  };
```

- [ ] **Step 7: Extend `ImageCell` to accept + forward `contentFit`, defaulting to `cover`.** The current `ImageCell` signature and `PerspectiveImage` usage (lines 309-342):

```tsx
function ImageCell({
  uri,
  badge,
  color,
  radius,
  style,
  filterMatrix = null,
  perspectiveTransform,
  manualWarpCorners,
}: {
  uri: string;
  badge: string;
  color: string;
  radius: number;
  style: 'pill' | 'square' | 'sticker';
  filterMatrix?: number[] | null;
  perspectiveTransform?: RNPerspectiveTransform;
  manualWarpCorners?: readonly Pt[] | null;
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
        position: 'relative',
      }}>
      <PerspectiveImage
        uri={uri}
        filterMatrix={filterMatrix}
        manualWarpCorners={manualWarpCorners}
        autoTransform={perspectiveTransform}
      />
```

Replace with (adds `contentFit` param + forwards it to `PerspectiveImage`):

```tsx
function ImageCell({
  uri,
  badge,
  color,
  radius,
  style,
  filterMatrix = null,
  perspectiveTransform,
  manualWarpCorners,
  contentFit = 'cover',
}: {
  uri: string;
  badge: string;
  color: string;
  radius: number;
  style: 'pill' | 'square' | 'sticker';
  filterMatrix?: number[] | null;
  perspectiveTransform?: RNPerspectiveTransform;
  manualWarpCorners?: readonly Pt[] | null;
  contentFit?: 'cover' | 'contain';
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
        position: 'relative',
      }}>
      <PerspectiveImage
        uri={uri}
        filterMatrix={filterMatrix}
        manualWarpCorners={manualWarpCorners}
        autoTransform={perspectiveTransform}
        contentFit={contentFit}
      />
```

- [ ] **Step 8: Extend `PerspectiveImage` to honor `contentFit` on the `FilteredImage`s, defaulting to `cover`.** The current `PerspectiveImage` signature + the two `FilteredImage` renders (lines 268-307):

```tsx
function PerspectiveImage({
  uri,
  filterMatrix = null,
  manualWarpCorners,
  autoTransform,
}: {
  uri: string;
  filterMatrix?: number[] | null;
  manualWarpCorners?: readonly Pt[] | null;
  autoTransform?: RNPerspectiveTransform;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }
    );
  }, []);

  const transform = useMemo<RNPerspectiveTransform | undefined>(() => {
    if (manualWarpCorners && manualWarpCorners.length === 4 && size) {
      const m = cornerFractionsToMatrix4(size.w, size.h, manualWarpCorners);
      return m ? [{ matrix: m }] : undefined;
    }
    return autoTransform && autoTransform.length > 0 ? autoTransform : undefined;
  }, [manualWarpCorners, size, autoTransform]);

  const needsMeasure = !!(manualWarpCorners && manualWarpCorners.length === 4);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={needsMeasure ? onLayout : undefined}>
      {transform ? (
        <View style={[StyleSheet.absoluteFill, { transform }]}>
          <FilteredImage uri={uri} matrix={filterMatrix} contentFit="cover" />
        </View>
      ) : (
        <FilteredImage uri={uri} matrix={filterMatrix} contentFit="cover" />
      )}
    </View>
  );
}
```

Replace with (adds `contentFit` param defaulting to `'cover'`, applies to both branches):

```tsx
function PerspectiveImage({
  uri,
  filterMatrix = null,
  manualWarpCorners,
  autoTransform,
  contentFit = 'cover',
}: {
  uri: string;
  filterMatrix?: number[] | null;
  manualWarpCorners?: readonly Pt[] | null;
  autoTransform?: RNPerspectiveTransform;
  contentFit?: 'cover' | 'contain';
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }
    );
  }, []);

  const transform = useMemo<RNPerspectiveTransform | undefined>(() => {
    if (manualWarpCorners && manualWarpCorners.length === 4 && size) {
      const m = cornerFractionsToMatrix4(size.w, size.h, manualWarpCorners);
      return m ? [{ matrix: m }] : undefined;
    }
    return autoTransform && autoTransform.length > 0 ? autoTransform : undefined;
  }, [manualWarpCorners, size, autoTransform]);

  const needsMeasure = !!(manualWarpCorners && manualWarpCorners.length === 4);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={needsMeasure ? onLayout : undefined}>
      {transform ? (
        <View style={[StyleSheet.absoluteFill, { transform }]}>
          <FilteredImage uri={uri} matrix={filterMatrix} contentFit={contentFit} />
        </View>
      ) : (
        <FilteredImage uri={uri} matrix={filterMatrix} contentFit={contentFit} />
      )}
    </View>
  );
}
```

- [ ] **Step 9: Add `shotContentFit={props.shotContentFit}` to the four `ImagePair` calls.** Each of the four templates already passes `shotFilterMatrix` / `shotPerspectiveTransform` / `shotManualWarpCorners` as the last three `ImagePair` props. In **PolaroidTemplate** (lines 474-476), **ClassicTemplate** (lines 648-650), **MinimalTemplate** (lines 746-748), and **ComicTemplate** (lines 891-893), the block reads (identical in all four except indentation):

```tsx
          shotFilterMatrix={props.shotFilterMatrix}
          shotPerspectiveTransform={props.shotPerspectiveTransform}
          shotManualWarpCorners={props.shotManualWarpCorners}
        />
```

In each of those four occurrences, append the `shotContentFit` line before the closing `/>`:

```tsx
          shotFilterMatrix={props.shotFilterMatrix}
          shotPerspectiveTransform={props.shotPerspectiveTransform}
          shotManualWarpCorners={props.shotManualWarpCorners}
          shotContentFit={props.shotContentFit}
        />
```

(Apply this edit four times — once per template. The four sites are byte-identical, so an exact-string editor must target each with enough surrounding context, or use a replace-all across the file since the four-line block is the same in all four ImagePair calls.)

- [ ] **Step 10: Manga template — forward `contentFit` to the `real` cell's `PerspectiveImage`.** Manga does not use `ImagePair`; it renders the user shot directly (lines 1035-1042):

```tsx
    real: (
      <View key="real" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <PerspectiveImage
          uri={shotUri}
          filterMatrix={props.shotFilterMatrix ?? null}
          manualWarpCorners={props.shotManualWarpCorners}
          autoTransform={props.shotPerspectiveTransform}
        />
```

Add `contentFit={props.shotContentFit}` (the anime cell above it at lines 1009-1013 uses a plain `<Image ... contentFit="cover" />` and stays unchanged):

```tsx
    real: (
      <View key="real" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <PerspectiveImage
          uri={shotUri}
          filterMatrix={props.shotFilterMatrix ?? null}
          manualWarpCorners={props.shotManualWarpCorners}
          autoTransform={props.shotPerspectiveTransform}
          contentFit={props.shotContentFit}
        />
```

- [ ] **Step 11: Typecheck the full wiring (Tasks 3.4 + 3.5 together).**

```bash
bunx tsc --noEmit
```

Expected output: no errors (exit 0). `ShareCardProps` now has `shotWidth?`/`shotHeight?` (resolving the Task 3.4 Step 5 error), `TemplateProps` carries `shotContentFit`, and every `ImagePair`/`ImageCell`/`PerspectiveImage` call passes a valid `'cover' | 'contain'` literal or omits it (defaulted).

- [ ] **Step 12: Run the full pilgrimage unit suite to confirm no regression in share-card tests.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/share-card.test.ts __tests__/unit/pilgrimage/share-aspect.test.ts __tests__/unit/pilgrimage/share-route-params.test.ts
```

Expected output (PASS): all three files green — the existing `share card metadata` 4 tests + `shotOrientation`/`shareRatioForShot`/`shotContentFitForCell` 8 + `buildShareRouteParams` 6 = `18 pass, 0 fail`.

- [ ] **Step 13: Commit Tasks 3.4 + 3.5 together.**

```bash
git add app/\(tabs\)/pilgrimage/compare/share.tsx components/pilgrimage/ShareCard.tsx
git commit -m "feat(camera): letterbox the user-shot share cell on orientation mismatch; default portrait ratio"
```

---

### Task 3.6: Route-only preview decodes true dims via `resolveCapturedPhotoDimensions` when 0 (B3, TDD)

**Files:**
- Modify: `libs/services/pilgrimage/capture-preview-route.ts` (add type-only `PhotoDimensions` import after line 7; add pure decision + async resolver after `setsEqual`, line 85; existing `buildCaptureSessionShotFromRoute` already defaults dims to `0` at lines 42-43)
- Test: `__tests__/unit/pilgrimage/capture-preview-route.test.ts` (append a new `describe` after line 82; extend imports lines 3-7)
- Modify: `app/(tabs)/pilgrimage/compare/preview.tsx` (extend `capture-preview-route` import lines 28-32; add imports near lines 41-42; add decoded-dims state + effect after line 199; full-mode sizing lines 829-835; share builder dims + dep array from Task 3.3)

When the preview is opened via a deep link / album route (no live session), `buildCaptureSessionShotFromRoute` sets `width`/`height` to `0` when the params omit them (lines 42-43). With `0` dims, `resolveFullModeStageHeight` falls back to 16:9 and a portrait shot is mislabeled landscape in full mode. Add a pure decision (`routeShotDimensionsNeedDecode`) and a thin async resolver (`resolveRouteShotDimensions`) that decodes true dims via the injected `resolveCapturedPhotoDimensions` only when needed. We inject the decoder so the resolver is unit-testable without Skia.

- [ ] **Step 1: Append the failing test.** Add this `describe` block to the END of `__tests__/unit/pilgrimage/capture-preview-route.test.ts` (after the existing `capture preview state reconciliation` block, which closes at line 82), and update the imports at the top. The current import lines 3-7 are:

```ts
import {
  buildCaptureSessionShotFromRoute,
  reconcileCapturePreviewSelection,
  resolveCapturePreviewFocus,
} from '../../../libs/services/pilgrimage/capture-preview-route';
```

Replace with:

```ts
import {
  buildCaptureSessionShotFromRoute,
  reconcileCapturePreviewSelection,
  resolveCapturePreviewFocus,
  resolveRouteShotDimensions,
  routeShotDimensionsNeedDecode,
} from '../../../libs/services/pilgrimage/capture-preview-route';
import type { PhotoDimensions } from '../../../libs/services/pilgrimage/camera-engine-parity';
```

Then append at the end of the file:

```ts
describe('routeShotDimensionsNeedDecode', () => {
  it('needs a decode when either dimension is missing / non-positive', () => {
    expect(routeShotDimensionsNeedDecode(0, 4032)).toBe(true);
    expect(routeShotDimensionsNeedDecode(3024, 0)).toBe(true);
    expect(routeShotDimensionsNeedDecode(0, 0)).toBe(true);
    expect(routeShotDimensionsNeedDecode(Number.NaN, 4032)).toBe(true);
    expect(routeShotDimensionsNeedDecode(-1, 4032)).toBe(true);
  });

  it('does not need a decode when both dimensions are already positive', () => {
    expect(routeShotDimensionsNeedDecode(3024, 4032)).toBe(false);
    expect(routeShotDimensionsNeedDecode(1, 1)).toBe(false);
  });
});

describe('resolveRouteShotDimensions', () => {
  it('returns the current dims unchanged (no decode) when they are already valid', async () => {
    let calls = 0;
    const decode = async (): Promise<PhotoDimensions> => {
      calls += 1;
      return { width: 1, height: 1 };
    };
    const current = { width: 3024, height: 4032 };
    const result = await resolveRouteShotDimensions(current, decode, 'file:///shot.jpg');
    expect(result).toEqual({ width: 3024, height: 4032 });
    expect(calls).toBe(0);
  });

  it('decodes the true dims (passing current as the fallback) when dims are 0', async () => {
    const seen: { uri: string; fallback: PhotoDimensions }[] = [];
    const decode = async (uri: string, fallback: PhotoDimensions): Promise<PhotoDimensions> => {
      seen.push({ uri, fallback });
      return { width: 1080, height: 1920 };
    };
    const result = await resolveRouteShotDimensions(
      { width: 0, height: 0 },
      decode,
      'file:///portrait.jpg'
    );
    expect(result).toEqual({ width: 1080, height: 1920 });
    expect(seen).toEqual([{ uri: 'file:///portrait.jpg', fallback: { width: 0, height: 0 } }]);
  });
});
```

- [ ] **Step 2: Run the test — confirm RED.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/capture-preview-route.test.ts
```

Expected output (FAIL): the existing tests still pass, but the new ones error because `resolveRouteShotDimensions` / `routeShotDimensionsNeedDecode` are not exported yet — `error: ... has no exported member 'resolveRouteShotDimensions'`. (Bun reports the import/binding failure; net result is the new `describe`s fail.)

- [ ] **Step 3: Add the pure decision + resolver to `capture-preview-route.ts`.** The current import block (lines 1-7) is:

```ts
import {
  sanitizeCaptureNote,
  type CaptureGeoLocation,
  type CaptureSessionShot,
  type CaptureSessionSource,
} from './capture-session';
import { getNumberParam, getStringParam, type RouterParams } from '../../utils/route-params';
```

Add a type-only import of `PhotoDimensions`:

```ts
import {
  sanitizeCaptureNote,
  type CaptureGeoLocation,
  type CaptureSessionShot,
  type CaptureSessionSource,
} from './capture-session';
import { getNumberParam, getStringParam, type RouterParams } from '../../utils/route-params';
import type { PhotoDimensions } from './camera-engine-parity';
```

Then append the two new exports at the END of the file (after `setsEqual`, which closes at line 85):

```ts
/**
 * True when a route-hydrated shot is missing real pixel dimensions (either
 * dim is non-finite or <= 0). `buildCaptureSessionShotFromRoute` defaults
 * absent dims to `0`, which would make the full-mode stage fall back to 16:9
 * and mislabel a portrait shot as landscape — so we re-decode in that case.
 */
export function routeShotDimensionsNeedDecode(width: number, height: number): boolean {
  return !(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0);
}

/**
 * Resolves a route-only shot's true dimensions. When `current` is already
 * valid, returns it unchanged (no I/O). Otherwise awaits the injected decoder
 * (`resolveCapturedPhotoDimensions`), passing `current` as the fallback so a
 * partial/zero dim still degrades gracefully. The decoder is injected so this
 * stays unit-testable without the native Skia decode.
 */
export async function resolveRouteShotDimensions(
  current: PhotoDimensions,
  decode: (uri: string, fallback: PhotoDimensions) => Promise<PhotoDimensions>,
  uri: string
): Promise<PhotoDimensions> {
  if (!routeShotDimensionsNeedDecode(current.width, current.height)) return current;
  return decode(uri, current);
}
```

- [ ] **Step 4: Run the test — confirm GREEN.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/capture-preview-route.test.ts
```

Expected output (PASS): the original 5 tests plus `routeShotDimensionsNeedDecode` (2) and `resolveRouteShotDimensions` (2) — `9 pass, 0 fail`.

- [ ] **Step 5: Wire the route-only decode into `preview.tsx` — imports.** The route-only branch is when `routeOnlyPreview` is true (preview.tsx:159) and `routeShot` carries `width: 0, height: 0`. Add an effect that, for a route-only shot with missing dims, decodes the true dims and stores them, so `resolveFullModeStageHeight` (full mode) and `shareRatioForShot` (share) read the real orientation.

  First extend the existing `capture-preview-route` import (lines 28-32) to add `resolveRouteShotDimensions`:

```tsx
import {
  buildCaptureSessionShotFromRoute,
  reconcileCapturePreviewSelection,
  resolveCapturePreviewFocus,
} from '../../../../libs/services/pilgrimage/capture-preview-route';
```

Replace with:

```tsx
import {
  buildCaptureSessionShotFromRoute,
  reconcileCapturePreviewSelection,
  resolveCapturePreviewFocus,
  resolveRouteShotDimensions,
} from '../../../../libs/services/pilgrimage/capture-preview-route';
```

  Then add the `resolveCapturedPhotoDimensions` import alongside the `buildShareRouteParams` import added in Task 3.3 Step 5 (lines 41-43 after that task lands):

```tsx
import { getNumberParam, getStringParam } from '../../../../libs/utils/route-params';
import { buildShareRouteParams } from '../../../../libs/services/pilgrimage/share-route-params';
import { AnitabiOriginCredit } from '../../../../components/pilgrimage/common/AnitabiOriginCredit';
```

  Replace with:

```tsx
import { getNumberParam, getStringParam } from '../../../../libs/utils/route-params';
import { buildShareRouteParams } from '../../../../libs/services/pilgrimage/share-route-params';
import { resolveCapturedPhotoDimensions } from '../../../../libs/services/pilgrimage/camera-engine-parity';
import { AnitabiOriginCredit } from '../../../../components/pilgrimage/common/AnitabiOriginCredit';
```

  (Net new imports for this task: extend the `capture-preview-route` import with `resolveRouteShotDimensions`, and add `resolveCapturedPhotoDimensions`. `useEffect` and `useState` are already imported at line 1.)

- [ ] **Step 6: Add decoded-dims state + the decode effect.** After the `stagePx` state (preview.tsx:199):

```tsx
  const [stagePx, setStagePx] = useState({ width: 0, height: 0 });
```

Add:

```tsx
  const [stagePx, setStagePx] = useState({ width: 0, height: 0 });
  // Route-only previews (deep link / album) may arrive with width/height = 0.
  // Decode the true pixel dims once so full-mode sizing + the share ratio see
  // the real orientation instead of falling back to 16:9 / landscape.
  const [decodedShotDims, setDecodedShotDims] = useState<{ width: number; height: number } | null>(
    null
  );
  useEffect(() => {
    if (!routeOnlyPreview || !routeShot || !routeShot.uri) {
      setDecodedShotDims(null);
      return;
    }
    let cancelled = false;
    void resolveRouteShotDimensions(
      { width: routeShot.width, height: routeShot.height },
      resolveCapturedPhotoDimensions,
      routeShot.uri
    )
      .then((dims) => {
        if (cancelled) return;
        setDecodedShotDims(dims.width > 0 && dims.height > 0 ? dims : null);
      })
      .catch(() => {
        if (!cancelled) setDecodedShotDims(null);
      });
    return () => {
      cancelled = true;
    };
  }, [routeOnlyPreview, routeShot]);
```

- [ ] **Step 7: Use the decoded dims for full-mode sizing.** The full-mode stage height currently reads the focused shot's dims directly (preview.tsx:829-835):

```tsx
                mode === 'full' && {
                  height: resolveFullModeStageHeight(
                    stagePx.width,
                    focusedShot?.width,
                    focusedShot?.height
                  ),
                },
```

Prefer the decoded dims when present (they only differ from `focusedShot` in the route-only/zero case):

```tsx
                mode === 'full' && {
                  height: resolveFullModeStageHeight(
                    stagePx.width,
                    decodedShotDims?.width ?? focusedShot?.width,
                    decodedShotDims?.height ?? focusedShot?.height
                  ),
                },
```

- [ ] **Step 8: Forward decoded dims into the share params too.** In the `handleShare` builder call (Task 3.3 Step 6), the `shotWidth`/`shotHeight` currently read `focusedShot.width`/`.height`. Prefer decoded dims so a route-only portrait shot shares as portrait. Change those two lines inside `buildShareRouteParams({...})`:

```tsx
      shotWidth: focusedShot.width,
      shotHeight: focusedShot.height,
```

to:

```tsx
      shotWidth: decodedShotDims?.width ?? focusedShot.width,
      shotHeight: decodedShotDims?.height ?? focusedShot.height,
```

Add `decodedShotDims` to the `handleShare` dependency array (lines 517-531). The current array starts:

```tsx
  }, [
    router,
    focusedShot,
    spotId,
```

Insert `decodedShotDims,` after `focusedShot,`:

```tsx
  }, [
    router,
    focusedShot,
    decodedShotDims,
    spotId,
```

- [ ] **Step 9: Typecheck.**

```bash
bunx tsc --noEmit
```

Expected output: no errors (exit 0). `resolveCapturedPhotoDimensions` matches the injected decoder signature `(uri: string, fallback: PhotoDimensions) => Promise<PhotoDimensions>`; `decodedShotDims` is `{ width: number; height: number } | null`.

- [ ] **Step 10: Run the affected unit suites + commit.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/capture-preview-route.test.ts __tests__/unit/pilgrimage/compare-layout.test.ts
```

Expected output (PASS): `capture-preview-route` 9 + `compare-layout` 4 = `13 pass, 0 fail`. Then:

```bash
git add libs/services/pilgrimage/capture-preview-route.ts __tests__/unit/pilgrimage/capture-preview-route.test.ts app/\(tabs\)/pilgrimage/compare/preview.tsx
git commit -m "fix(camera): decode true dimensions for route-only previews so portrait shots aren't sized 16:9"
```

---

### Task 3.7: Downstream verification — full unit run, typecheck, and on-device aspect check

**Files:**
- Modify: none (verification only)
- Test: full unit suite + manual device pass

This task has no pure logic to TDD; per the REPO TDD RULE the letterbox/threading wiring is verified by `tsc` plus a precise on-device check (spec section "Testing & verification" point 4 — "preview/share show the full frame (letterboxed), not cropped").

- [ ] **Step 1: Full type check.**

```bash
bunx tsc --noEmit
```

Expected output: no errors (exit 0).

- [ ] **Step 2: Full unit suite.**

```bash
bun run test:unit
```

Expected output: the whole suite is green, including the three new/updated pilgrimage files (`share-aspect.test.ts`, `share-route-params.test.ts`, `capture-preview-route.test.ts`) and the untouched `compare-layout.test.ts` / `share-card.test.ts`. No `fail`.

- [ ] **Step 3: On-device — preview letterbox (portrait shot).** Build/run the app, capture (or open from album) a **portrait** shot, open the compare preview. Verify for `stacked`, `sideBySide`, `overlay`, and `slider` modes: the user's shot shows the WHOLE frame with letterbox bars (background `theme.background.secondary` showing top/bottom or sides), NOT cropped. Confirm the anime reference image still fills its area (`cover`). Confirm `full` mode is unchanged (stage already matches the shot aspect).

- [ ] **Step 4: On-device — share letterbox + default ratio (portrait shot).** From that portrait preview, tap Share. Verify the share screen opens on the **9:16** ratio chip selected by default. In the live `ShareCard` preview, confirm the REAL (user) cell shows the whole portrait frame letterboxed within its cell while the ANIME cell stays filled. Switch the ratio to `16:9` and confirm the REAL cell letterboxes (portrait shot in a landscape cell) rather than cropping. Capture/save once and confirm the exported PNG matches the on-screen card (no crop of the user shot).

- [ ] **Step 5: On-device — landscape shot stays cover.** Repeat with a **landscape** shot: preview modes and the share REAL cell should FILL (cover) in the landscape/`1:1`/`16:9` cells (same orientation → no letterbox), and the share screen should default to the `1:1` ratio. This confirms we only letterbox on a genuine orientation mismatch.

- [ ] **Step 6: On-device — route-only / album deep link.** Open a preview via the album/deep-link path (so `routeOnlyPreview` is true) for a portrait capture whose params omit `shotWidth`/`shotHeight`. Confirm full mode renders portrait (not a 16:9 letterbox-of-a-letterbox) — i.e., the decode in Task 3.6 populated real dims — and that tapping Share opens on 9:16.

- [ ] **Step 7: Record the verification result.** Note in the PR description (or the spec's closeout) that Steps 3-6 passed on both iOS and Android per spec section "Testing & verification" point 4. No commit (docs/PR only; this phase introduces no source change in this task).

---

## Phase 4 — Camera-screen state cleanup (targeted, C2/C3/C4 + 3.5)

*(Tasks below are numbered 1–6, local to Phase 4. Run Task 3 → Task 5 without a suite gate between them — Task 3 intentionally leaves the route file with tsc errors that Task 5 resolves.)*

> **Phase scope.** Targeted Rule-9 cleanup of `app/(tabs)/pilgrimage/compare/[spotId].tsx` — items **C2, C3, C4** of spec §3.3 plus §3.5 (lifecycle / interruptions). It does **not** touch orientation threading (**C1** — owned by the orientation phase via `useCameraOrientation` / `cameraOrientationSource`) or the downstream letterbox + share work (§3.2). Those symbols appear in the SHARED CONTRACT and are referenced, not re-authored. This phase leaves the route's existing orientation code (`cameraOrientationLockIntent` import at `:32`, the two `ScreenOrientation` effects at `:641` / `:653`, `OrientationChip`) exactly as-is so it can land independently of C1.
>
> **Verification model (REPO TDD RULE).** Two genuinely-pure additions get a failing-first Bun test: (1) `cameraHudInitialState` seeding from a settings object (Task 1), (2) `resolveCameraActiveWithInterruption` (Task 2). Everything else here is *wiring* with no new branch math — moving an `AppState` subscription into a hook, deriving `active` instead of setting it, writing a ref inside a setter instead of the render body, extracting effects verbatim into a hook, funnelling two MMKV-mirror effects into one inline write-through. Per the TDD rule that wiring is verified by `bunx tsc --noEmit`, by the existing `camera-hud.test.ts` / `camera-ui.test.ts` / `camera-settings.test.ts` staying green, and by an explicit on-device manual gate (Task 6). We do **not** fabricate RN hook/component render tests — this repo's Bun harness has no `@testing-library/react-hooks`, and CLAUDE.md Rule 8 forbids fake tests.
>
> **Why no interruption props on `CameraStage`.** vision-camera v5 exposes `onInterruptionStarted` / `onInterruptionEnded`, but the SHARED CONTRACT freezes `CameraStageProps` additions to exactly `orientationSource`. `CameraStage` today forwards only `onStarted → onCameraReady` and `onError → onMountError` (verified: `onStarted={handleStarted}` / `onError={handleMountError}` at CameraStage `:632`/`:633`, props `onCameraReady?` `:116` / `onMountError?` `:118`; no `onInterruption*` prop exists). Threading new interruption callbacks would mean an out-of-contract `CameraStageProps` change. So the §3.5 recovery is driven by the signals already plumbed: **`onMountError`** (the explicitly-named "`onError`-ended" path) plus **`AppState`** foreground transitions. After an `onError` the hook forces an `active` off→on re-arm cycle so the dead session restarts — the actual HIGH-severity bug.
>
> **Phase sequencing.** Task 1 (C3 pure seed + hook signature) → Task 2 (C2 pure resolver) → Task 3 (C2 lifecycle rewrite) → Task 4 (C4 `useFreezeFrame`) → Task 5 (route-file integration consuming Tasks 1–4) → Task 6 (full typecheck + suite + manual gate). Tasks 1, 2, 4 are independently green-and-committable. Task 3 intentionally leaves the route file with known tsc errors that **Task 5 resolves** — do not run the full suite as a gate between Task 3 and Task 5.

---

### Task 1: C3 — seed the HUD overlay knobs from persisted settings via the reducer's lazy initializer

Make the HUD reducer the runtime source of truth, seeded once from `loadCameraSettingsSync()` through its lazy initializer. This is the first half of killing the seed→mirror loop (the write-through half moves to Task 5).

**Files:**
- Modify: `hooks/useCameraHud.ts` (imports 1–13; add `CameraHudSeed` + `cameraHudInitialState` after line 88; change `useCameraHud` signature at 110–118)
- Test: `__tests__/unit/pilgrimage/camera-hud.test.ts` (imports 1–6; append a `cameraHudInitialState` describe after line 55)

- [ ] **Step 1: Write the failing seed test.** Append this block to `__tests__/unit/pilgrimage/camera-hud.test.ts` after the existing `describe('cameraHudReducer', …)` closes (line 55):

```ts

describe('cameraHudInitialState', () => {
  it('seeds the four persisted overlay knobs from the settings argument', () => {
    const seeded = cameraHudInitialState({
      overlayMode: 'anime',
      edgeIntensity: 'high',
      subjectFocus: 'wide',
      subjectCombine: true,
    });
    expect(seeded.overlayMode).toBe('anime');
    expect(seeded.edgeIntensity).toBe('high');
    expect(seeded.subjectFocus).toBe('wide');
    expect(seeded.subjectCombine).toBe(true);
  });

  it('leaves every non-overlay HUD default untouched', () => {
    const seeded = cameraHudInitialState({
      overlayMode: 'sketch',
      edgeIntensity: 'mid',
      subjectFocus: 'tight',
      subjectCombine: false,
    });
    expect(seeded.facing).toBe(INITIAL_CAMERA_HUD.facing);
    expect(seeded.aspect).toBe(INITIAL_CAMERA_HUD.aspect);
    expect(seeded.quickControlsOpen).toBe(INITIAL_CAMERA_HUD.quickControlsOpen);
    expect(seeded.orientationMode).toBe(INITIAL_CAMERA_HUD.orientationMode);
    expect(seeded.captureModeToast).toBeNull();
  });

  it('returns a fresh object, never the shared INITIAL_CAMERA_HUD', () => {
    const seeded = cameraHudInitialState({
      overlayMode: 'edge',
      edgeIntensity: 'low',
      subjectFocus: 'normal',
      subjectCombine: false,
    });
    expect(seeded).not.toBe(INITIAL_CAMERA_HUD);
    seeded.facing = 'front';
    expect(INITIAL_CAMERA_HUD.facing).toBe('back');
  });
});
```

> Verified against the real `CameraHudState`/`INITIAL_CAMERA_HUD`: `facing: 'back'`, `aspect: '16:9'`, `quickControlsOpen: true`, `orientationMode: 'auto'`, `captureModeToast: null`. The literal values used in the test (`'anime'`/`'sketch'`/`'edge'` for `OverlayMode`, `'high'`/`'mid'`/`'low'` for `EdgeIntensity`, `'wide'`/`'tight'`/`'normal'` for `SubjectFocus`) are members of the real union types imported into `useCameraHud.ts`.

- [ ] **Step 2: Pull the new symbol into the test imports.** Replace the import block at the top of `__tests__/unit/pilgrimage/camera-hud.test.ts` (lines 1–6):

```ts
import { describe, expect, it } from 'bun:test';
import {
  cameraHudReducer,
  INITIAL_CAMERA_HUD,
  type CameraHudState,
} from '../../../hooks/useCameraHud';
```

with:

```ts
import { describe, expect, it } from 'bun:test';
import {
  cameraHudInitialState,
  cameraHudReducer,
  INITIAL_CAMERA_HUD,
  type CameraHudState,
} from '../../../hooks/useCameraHud';
```

- [ ] **Step 3: Run the test — expect RED.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-hud.test.ts
```

Expected (the symbol does not exist yet):

```
error: Export named 'cameraHudInitialState' not found in module '.../hooks/useCameraHud.ts'.
```

- [ ] **Step 4: Add the `CameraSettings` type import to `hooks/useCameraHud.ts`.** Replace the import block (lines 1–13):

```ts
import { useReducer } from 'react';
import type { CameraOrientationMode } from '../libs/services/pilgrimage/camera-ui';
import type { EdgeIntensity } from '../libs/services/pilgrimage/edge-overlay';
import type { SubjectFocus } from '../libs/services/pilgrimage/subject-overlay';
import type {
  AspectRatio,
  CameraFacing,
  FlashMode,
  OverlayMode,
} from '../components/pilgrimage/camera/types';
import type { CaptureModeToastValue } from '../components/pilgrimage/camera/CaptureModeToast';
import type { AutoCaptureToastValue } from '../components/pilgrimage/camera/AutoCaptureToast';
import type { CamSwitchToastValue } from '../components/pilgrimage/camera/CamSwitchToast';
```

with:

```ts
import { useReducer } from 'react';
import type { CameraOrientationMode } from '../libs/services/pilgrimage/camera-ui';
import type { EdgeIntensity } from '../libs/services/pilgrimage/edge-overlay';
import type { SubjectFocus } from '../libs/services/pilgrimage/subject-overlay';
import type { CameraSettings } from '../libs/services/pilgrimage/camera-settings';
import type {
  AspectRatio,
  CameraFacing,
  FlashMode,
  OverlayMode,
} from '../components/pilgrimage/camera/types';
import type { CaptureModeToastValue } from '../components/pilgrimage/camera/CaptureModeToast';
import type { AutoCaptureToastValue } from '../components/pilgrimage/camera/AutoCaptureToast';
import type { CamSwitchToastValue } from '../components/pilgrimage/camera/CamSwitchToast';
```

> Verified: `camera-settings.ts` exports `CameraSettings` (`export interface CameraSettings` at `:65`) with all four fields — `overlayMode` `:91`, `edgeIntensity` `:97`, `subjectFocus` `:102`, `subjectCombine` `:106` — so the `Pick<>` in Step 5 resolves.

- [ ] **Step 5: Add `CameraHudSeed` + `cameraHudInitialState`.** Insert this block in `hooks/useCameraHud.ts` immediately after the `INITIAL_CAMERA_HUD` constant closes (after line 88, before the `CameraHudPatch` doc comment at line 90):

```ts

/**
 * The persisted overlay knobs the HUD seeds from on mount. These four fields
 * live in `CameraSettings` (MMKV) and are the only HUD values that survive a
 * relaunch — everything else starts from {@link INITIAL_CAMERA_HUD}.
 */
export type CameraHudSeed = Pick<
  CameraSettings,
  'overlayMode' | 'edgeIntensity' | 'subjectFocus' | 'subjectCombine'
>;

/**
 * Lazy initializer for the HUD reducer. Merges {@link INITIAL_CAMERA_HUD} with
 * the four persisted overlay knobs so the camera screen opens with the user's
 * real overlay pick on the FIRST frame — no post-mount mirror effect, no flash
 * of the default 'edge' overlay (CLAUDE.md Rule 9 + Rule 10).
 *
 * Pure: returns a fresh object every call and never mutates the shared default.
 */
export function cameraHudInitialState(seed: CameraHudSeed): CameraHudState {
  return {
    ...INITIAL_CAMERA_HUD,
    overlayMode: seed.overlayMode,
    edgeIntensity: seed.edgeIntensity,
    subjectFocus: seed.subjectFocus,
    subjectCombine: seed.subjectCombine,
  };
}
```

- [ ] **Step 6: Change `useCameraHud` to accept an optional seed and use the lazy initializer.** Replace the hook (lines 110–118):

```ts
/**
 * Owns the camera screen's discrete HUD state behind a small `{ hud, setHud }`
 * API. `setHud` is the reducer dispatch, so it is referentially stable and
 * safe to omit from / include in `useCallback` dependency arrays.
 */
export function useCameraHud(): UseCameraHudResult {
  const [hud, setHud] = useReducer(cameraHudReducer, INITIAL_CAMERA_HUD);
  return { hud, setHud };
}
```

with:

```ts
/**
 * Owns the camera screen's discrete HUD state behind a small `{ hud, setHud }`
 * API. `setHud` is the reducer dispatch, so it is referentially stable and
 * safe to omit from / include in `useCallback` dependency arrays.
 *
 * Pass `initialSettings` (the synchronously-loaded `CameraSettings`) so the
 * four persisted overlay knobs seed the reducer via its lazy initializer on the
 * first render. Omitting it falls back to {@link INITIAL_CAMERA_HUD} defaults —
 * used only by tests that don't care about persistence.
 */
export function useCameraHud(initialSettings?: CameraHudSeed): UseCameraHudResult {
  const [hud, setHud] = useReducer(
    cameraHudReducer,
    initialSettings,
    (seed: CameraHudSeed | undefined): CameraHudState =>
      seed ? cameraHudInitialState(seed) : { ...INITIAL_CAMERA_HUD }
  );
  return { hud, setHud };
}
```

> `useReducer(reducer, initialArg, init)` calls `init(initialArg)` exactly once. Here `initialArg` is `initialSettings` (typed `CameraHudSeed | undefined`), so the lazy `init` seeds from real settings when present and falls back to a fresh `INITIAL_CAMERA_HUD` copy otherwise — no render-time merge cost on subsequent renders.

- [ ] **Step 7: Run the seed test — expect GREEN.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-hud.test.ts
```

Expected: 5 original `cameraHudReducer` cases + 3 new `cameraHudInitialState` cases all pass, e.g.

```
 8 pass
 0 fail
```

- [ ] **Step 8: Typecheck the hook.**

```bash
bunx tsc --noEmit
```

Expected: **no** new tsc errors from this task. The existing call site `useCameraHud()` (route `:226`, no argument) still compiles because the new parameter is optional. If tsc reports any error inside `hooks/useCameraHud.ts`, fix it before committing.

- [ ] **Step 9: Commit.**

```bash
git add hooks/useCameraHud.ts __tests__/unit/pilgrimage/camera-hud.test.ts
git commit -m "refactor(camera): seed HUD overlay knobs via reducer lazy initializer"
```

---

### Task 2: C2 — pure interruption-aware active resolver

The only new pure logic the lifecycle hook needs: fold an `interrupted` flag into the already-tested `resolveCameraActive`.

**Files:**
- Modify: `libs/services/pilgrimage/camera-ui.ts` (add type + function after `resolveCameraActive`, currently 123–125)
- Test: `__tests__/unit/pilgrimage/camera-ui.test.ts` (imports 2–17; add a case after line 60)

- [ ] **Step 1: Write the failing resolver test.** Insert this `it(...)` into `__tests__/unit/pilgrimage/camera-ui.test.ts` immediately after the existing `resolveCameraActive` test (ends line 60, before the chrome-height test at line 62):

```ts

  it('drops the camera while an interruption is active, even when foregrounded', () => {
    expect(
      resolveCameraActiveWithInterruption({
        appIsForeground: true,
        settingsOpen: false,
        interrupted: false,
      })
    ).toBe(true);
    expect(
      resolveCameraActiveWithInterruption({
        appIsForeground: true,
        settingsOpen: false,
        interrupted: true,
      })
    ).toBe(false);
    // Backgrounded or sheet-covered still wins regardless of interruption.
    expect(
      resolveCameraActiveWithInterruption({
        appIsForeground: false,
        settingsOpen: false,
        interrupted: false,
      })
    ).toBe(false);
    expect(
      resolveCameraActiveWithInterruption({
        appIsForeground: true,
        settingsOpen: true,
        interrupted: false,
      })
    ).toBe(false);
  });
```

- [ ] **Step 2: Add the symbol to the test import block.** Replace the import in `__tests__/unit/pilgrimage/camera-ui.test.ts` (lines 2–17), inserting `resolveCameraActiveWithInterruption` after `resolveCameraActive`:

```ts
import {
  ANDROID_GESTURE_NAV_MIN_INSET,
  cameraOrientationLockIntent,
  CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
  CAMERA_LANDSCAPE_CLUSTER_RESERVE,
  CAMERA_SHUTTER_ROW_HEIGHT,
  CAMERA_TOP_BAR_CONTENT_HEIGHT,
  CAMERA_TOP_BAR_ROW2_HEIGHT,
  formatCameraHeader,
  isCameraCapturePath,
  resolveCameraActive,
  resolveCameraActiveWithInterruption,
  resolveCameraBottomInset,
  resolveCameraTopChromeHeight,
  resolveTransientCameraHudVisibility,
  roundExposureValue,
} from '../../../libs/services/pilgrimage/camera-ui';
```

> This task does **not** modify the existing `cameraOrientationLockIntent` test at lines 45–48 (`expect(cameraOrientationLockIntent('auto')).toBe('unlock')`). That assertion belongs to the orientation phase (the `'unlock' → 'portrait'` change). Verified that the current `camera-ui.ts` still returns `'unlock'` for `'auto'` (`:95`), so this test is green against the tree as it stands today — leave it alone.

- [ ] **Step 3: Run the test — expect RED.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-ui.test.ts
```

Expected:

```
error: Export named 'resolveCameraActiveWithInterruption' not found in module '.../libs/services/pilgrimage/camera-ui.ts'.
```

- [ ] **Step 4: Add the type + function.** Insert in `libs/services/pilgrimage/camera-ui.ts` immediately after the existing `resolveCameraActive` (after line 125, before the `resolveCameraBottomInset` doc comment at line 127):

```ts

export interface CameraInterruptionInput extends CameraActiveInput {
  /**
   * A native session interruption (phone call, FaceTime, another app grabbing
   * the camera, control-center) is currently in effect, OR the camera is being
   * re-armed after an `onError`-ended session. While this is true we keep
   * `isActive` low so we don't fight the OS for the device; clearing it lets the
   * session restart (§3.5 interruption / error recovery).
   */
  interrupted: boolean;
}

/**
 * {@link resolveCameraActive} plus an interruption gate. The camera is active
 * only while foregrounded, the settings sheet is closed, AND no interruption /
 * re-arm cycle is in effect. Pure — same inputs always yield the same boolean.
 */
export function resolveCameraActiveWithInterruption(input: CameraInterruptionInput): boolean {
  return resolveCameraActive(input) && !input.interrupted;
}
```

> Verified: `CameraActiveInput` (`{ appIsForeground; settingsOpen }`) is declared at `:15`, so `CameraInterruptionInput extends CameraActiveInput` resolves; `resolveCameraActive` is declared at `:123–125`.

- [ ] **Step 5: Run the test — expect GREEN.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-ui.test.ts
```

Expected: the full camera-ui suite plus the new interruption case all pass, e.g.

```
 12 pass
 0 fail
```

- [ ] **Step 6: Commit.**

```bash
git add libs/services/pilgrimage/camera-ui.ts __tests__/unit/pilgrimage/camera-ui.test.ts
git commit -m "feat(camera): pure interruption-aware active resolver"
```

---

### Task 3: C2 — `useCameraLifecycle` owns AppState + active derivation + onError re-arm

Move the `AppState` foreground subscription (route effect #10, `:601`) and the `resolveCameraActive` derivation (route effect #11, `:608`) into the hook. `active` becomes **derived** (no public `setActive`). After an `onMountError` the hook forces an `active` off→on re-arm tick so a dead session restarts.

**Files:**
- Modify: `hooks/useCameraLifecycle.ts` (full file — currently 1–64)
- Test: none new — the gating logic is covered by Task 2's pure resolver; the AppState subscription + timer re-arm is side-effectful wiring (TDD rule: no fabricated hook test). Verified by `tsc` + suites + Task 6 manual gate.

- [ ] **Step 1: Rewrite `hooks/useCameraLifecycle.ts` in full.** Replace the entire file:

```ts
// CameraView lifecycle bookkeeping. We track three independent things plus a
// derived `active`:
//   1. isReady — flips true on the first `onCameraReady` and STAYS sticky.
//      `onCameraReady` fires exactly once, when the native capture session
//      first starts. Pausing/resuming via the `active` prop only calls
//      startRunning()/stopRunning() natively — it does NOT re-fire
//      `onCameraReady`. So `isReady` must never be cleared on a resume: doing
//      that strands the "Preparing camera…" warmup veil forever, and with it
//      the shutter (gated on `isReady` in the screen).
//   2. mountError — string from `onMountError`, cleared on the next ready event
//      so a recovered camera no longer shows the error banner.
//   3. rearming — true for one short tick right after `onMountError`. vision-
//      camera leaves `isActive` true after an `onError`-ended session, but the
//      native session is dead and never restarts unless `isActive` toggles
//      off→on. Setting `rearming` forces `active` low; a timer clears it so the
//      camera comes back. This is the §3.5 recovery for the HIGH-severity
//      "dead session, no recovery" finding. (CameraStage forwards `onError`
//      only — vision-camera's onInterruption* callbacks are not in the
//      CameraStage prop contract, so we recover off the error signal + AppState.)
//   4. active — DERIVED from app foreground state, the settings sheet, and the
//      re-arm tick via `resolveCameraActiveWithInterruption`. Callers no longer
//      set this directly; they pass `settingsOpen` in and the hook owns both the
//      AppState subscription and the derivation.
//
// `reset()` is the only thing that clears `isReady` — call it solely for a
// genuine remount (e.g. a keyed CameraView), never for an `active` toggle.

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { resolveCameraActiveWithInterruption } from '../libs/services/pilgrimage/camera-ui';

// How long to hold `active` low after an onError before re-arming. Long enough
// for VisionCamera to tear the failed session down, short enough to feel like a
// blip, not a freeze.
const REARM_DELAY_MS = 350;

export interface UseCameraLifecycleInput {
  /** Camera should pause while the settings sheet covers the preview. */
  settingsOpen: boolean;
  /** Initial foreground assumption before the first AppState event. */
  initialActive?: boolean;
}

export interface UseCameraLifecycleOutput {
  isReady: boolean;
  mountError: string | null;
  /** Bind to `CameraStage.onCameraReady`. Callers can compose with other listeners. */
  onCameraReady: () => void;
  /** Bind to `CameraStage.onMountError`. Triggers the off→on re-arm cycle. */
  onMountError: (e: { nativeEvent: { message: string } }) => void;
  /** Derived: whether the native camera session should be running right now. */
  active: boolean;
  /** Force `isReady` back to false. Use only on intentional remounts. */
  reset: () => void;
}

export function useCameraLifecycle({
  settingsOpen,
  initialActive = true,
}: UseCameraLifecycleInput): UseCameraLifecycleOutput {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [appIsForeground, setAppIsForeground] = useState<boolean>(() =>
    initialActive ? AppState.currentState === 'active' : false
  );
  const [rearming, setRearming] = useState<boolean>(false);

  // Own the AppState subscription here (moved off the route file). The camera
  // session pauses on background and resumes on the next 'active' event.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppIsForeground(state === 'active');
    });
    return () => sub.remove();
  }, []);

  // After an onError, hold `active` low briefly then re-arm so the dead session
  // restarts (§3.5). Cleared automatically; also cleared early if a genuine
  // ready event lands first (onCameraReady below).
  useEffect(() => {
    if (!rearming) return;
    const timer = setTimeout(() => setRearming(false), REARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [rearming]);

  const onCameraReady = useCallback(() => {
    setIsReady(true);
    setMountError(null);
    // A fresh ready event means the session is genuinely running again — end
    // any in-flight re-arm immediately.
    setRearming(false);
  }, []);

  const onMountError = useCallback((e: { nativeEvent: { message: string } }) => {
    const msg = e?.nativeEvent?.message ?? 'Camera failed to mount';
    setMountError(msg);
    // Force the off→on cycle: `active` drops while `rearming` is true, the timer
    // above clears it, and the derived `active` comes back true (foreground +
    // sheet permitting), restarting the session instead of wedging it dead.
    setRearming(true);
  }, []);

  const reset = useCallback(() => {
    setIsReady(false);
  }, []);

  const active = resolveCameraActiveWithInterruption({
    appIsForeground,
    settingsOpen,
    interrupted: rearming,
  });

  return {
    isReady,
    mountError,
    onCameraReady,
    onMountError,
    active,
    reset,
  };
}
```

- [ ] **Step 2: Typecheck — errors expected ONLY at the route call site.**

```bash
bunx tsc --noEmit
```

Expected: errors confined to `app/(tabs)/pilgrimage/compare/[spotId].tsx` — the old `useCameraLifecycle(true)` positional call (`:305`), the destructured `setActive: setCameraActive` (`:311`), and effects #10/#11 still referencing `appIsForeground` / `setCameraActive` (`:609–610`). These are fixed in Task 5. **No** error should originate inside `hooks/useCameraLifecycle.ts`; if one does, fix it before committing.

- [ ] **Step 3: Confirm there is exactly one consumer.**

```bash
grep -rn "useCameraLifecycle(" app hooks components | grep -v "hooks/useCameraLifecycle.ts"
```

Expected: a single hit in `app/(tabs)/pilgrimage/compare/[spotId].tsx` (currently at `:305`). If more appear, each needs the new `{ settingsOpen }` call shape — but per spec only the camera route consumes it.

- [ ] **Step 4: Commit** (the route file is intentionally still broken; this is the hook-only half. Do NOT run the full suite as a gate here.)

```bash
git add hooks/useCameraLifecycle.ts
git commit -m "refactor(camera): useCameraLifecycle owns AppState + onError re-arm recovery"
```

---

### Task 4: C4 — extract `useFreezeFrame`, moving the ref write off the render body

Route line 356 (`freezeFrameUriRef.current = freezeFrameUri;`) runs on **every render** — a render-phase side effect (React purity violation, Rule 9). Extract a hook that writes the ref inside the setter and folds in the clear-after-swap effect (#3, `:366`) and the unmount-sweep effect (#4, `:381`) verbatim.

**Files:**
- Create: `hooks/useFreezeFrame.ts` (NEW)
- Test: none new — `expo-file-system` deletion + a `setTimeout` cleanup are side-effectful wiring with no branch math (TDD rule: no fabricated hook test). Verified by `tsc` + the Task 6 manual swap check.

- [ ] **Step 1: Create `hooks/useFreezeFrame.ts`.** Write the complete file:

```ts
// Android lens-swap freeze-frame state.
//
// During a CameraX session swap the live preview goes black for ~200–400ms.
// To hide that, the route grabs a snapshot of the OLD lens right before the
// swap and paints it as a still overlay until the new session is up. This hook
// owns that snapshot URI plus the temp-file lifecycle:
//
//   - `setFreezeFrameUri(uri)` updates BOTH the rendered state AND a ref mirror
//     IN THE SETTER — never in the render body. (The old route wrote
//     `freezeFrameUriRef.current = state` on every render, a render-phase side
//     effect. CLAUDE.md Rule 9.)
//   - `getFreezeFrameUri()` reads the latest URI from the ref so cleanup paths
//     (rapid double-tap, unmount) see the freshest value without depending on a
//     stale render closure.
//   - When `isSwitching` flips false and a freeze-frame is present, it is
//     cleared after the warmup fade (~260ms) and its temp file deleted.
//   - On unmount any pending temp file is swept so backgrounded swaps don't leak.
//
// iOS never produces a freeze-frame (PreviewView.takeSnapshot is Android-only),
// so on iOS `freezeFrameUri` simply stays null and every effect is a no-op.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

export interface UseFreezeFrameInput {
  /** True while the strategic lens-switch FSM is mid-swap. */
  isSwitching: boolean;
  /**
   * File deleter — defaults to a best-effort `FileSystem.deleteAsync`. Injectable
   * so the route can share one stable deleter and tests can stub it.
   */
  deleteFile?: (uri: string) => void;
}

export interface UseFreezeFrameResult {
  freezeFrameUri: string | null;
  /** Sets the rendered URI and mirrors it into the ref in the same call. */
  setFreezeFrameUri: (uri: string | null) => void;
  /** Latest URI from the ref mirror — safe to read in cleanup closures. */
  getFreezeFrameUri: () => string | null;
}

const defaultDeleteFile = (uri: string): void => {
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
};

export function useFreezeFrame({
  isSwitching,
  deleteFile = defaultDeleteFile,
}: UseFreezeFrameInput): UseFreezeFrameResult {
  const [freezeFrameUri, setFreezeFrameUriState] = useState<string | null>(null);
  // Mirror so cleanup paths can read the latest URI without a stale closure.
  // Written ONLY inside the setter below — never in the render body.
  const freezeFrameUriRef = useRef<string | null>(null);

  const setFreezeFrameUri = useCallback((uri: string | null) => {
    freezeFrameUriRef.current = uri;
    setFreezeFrameUriState(uri);
  }, []);

  const getFreezeFrameUri = useCallback(() => freezeFrameUriRef.current, []);

  // Clear the freeze-frame once the new session is up and the warmup overlay
  // has finished its fade-out (~260ms). Also delete the temp file so we don't
  // leak ~100 kB JPEGs into the cache each swap.
  useEffect(() => {
    if (isSwitching) return;
    if (!freezeFrameUri) return;
    const uri = freezeFrameUri;
    const timer = setTimeout(() => {
      setFreezeFrameUri(null);
      // Best-effort cleanup; if the file vanished already or the path is
      // malformed we just move on. No error toast — the snapshot is purely a
      // visual nicety; failure should never reach the user.
      deleteFile(uri);
    }, 260);
    return () => clearTimeout(timer);
  }, [isSwitching, freezeFrameUri, deleteFile, setFreezeFrameUri]);

  // Always sweep the temp file on unmount so backgrounded swaps don't leak.
  useEffect(() => {
    return () => {
      const pending = freezeFrameUriRef.current;
      if (pending) deleteFile(pending);
    };
  }, [deleteFile]);

  return { freezeFrameUri, setFreezeFrameUri, getFreezeFrameUri };
}
```

> `expo-file-system/legacy` is the same module path the route uses today (route `:16`), so the import resolves identically.

- [ ] **Step 2: Typecheck the new hook.**

```bash
bunx tsc --noEmit
```

Expected: no errors referencing `hooks/useFreezeFrame.ts`. (Route-file errors from Task 3 may still be present — that is fine; just confirm `useFreezeFrame.ts` itself is clean.)

- [ ] **Step 3: Commit.**

```bash
git add hooks/useFreezeFrame.ts
git commit -m "refactor(camera): extract useFreezeFrame (ref write off the render body)"
```

---

### Task 5: Route-file integration — consume the new hooks, delete the dead state (C2 + C3 + C4)

The integration commit. It consumes Tasks 1–4 and removes: the `appIsForeground` state (`:249`), the seed/mirror effects #1 + #2 and the `overlaySettingsSyncedRef` latch (`:265–304`), the inline `freezeFrameUri` state + render-body ref write + `deleteFreezeFrame` + effects #3 + #4 (`:347–386`), and effects #10 + #11 + the `AppState` listener (`:600–610`). After this task the route's `useEffect` count drops toward the §3.3 target.

**Files:**
- Modify: `app/(tabs)/pilgrimage/compare/[spotId].tsx`
- Test: none new (route wiring). Verified by `tsc` + suites + the Task 6 manual gate.

> Earlier phases (C1 §3.1, §3.2) also edit this file. Quote-and-replace only the exact blocks below. If a block was already altered by another phase, re-anchor on the nearest unchanged line — the SHARED CONTRACT pins the load-bearing names so intent stays unambiguous. **This phase touches nothing orientation-related** (leave the `cameraOrientationLockIntent` import at `:32`, `OrientationChip`, and the two `ScreenOrientation` effects at `:641` / `:653` exactly as they are — they are C1's to refactor).

- [ ] **Step 1: Import the two new hooks.** Replace the lifecycle import line (line 96):

```ts
import { useCameraLifecycle } from '../../../../hooks/useCameraLifecycle';
```

with:

```ts
import { useCameraLifecycle } from '../../../../hooks/useCameraLifecycle';
import { useFreezeFrame } from '../../../../hooks/useFreezeFrame';
```

- [ ] **Step 2: Extend the `useCameraSettings` import to also pull `type CameraSettings`.** Replace lines 88–93:

```ts
import {
  useCameraSettings,
  qualityToNumber,
  qualityToPrioritization,
  type CaptureMode,
} from '../../../../hooks/useCameraSettings';
```

with:

```ts
import {
  useCameraSettings,
  qualityToNumber,
  qualityToPrioritization,
  type CameraSettings,
  type CaptureMode,
} from '../../../../hooks/useCameraSettings';
```

> Verified `CameraSettings` is not already imported as a value/type into the route (line 73 is the unrelated `CameraSettingsSheet` component), so this adds no duplicate. `useCameraSettings.ts` re-exports `type CameraSettings` (`:21–27`).

- [ ] **Step 3: Remove the now-unused `AppState` import.** The `AppState` subscription moves into `useCameraLifecycle`; `AppState.currentState` is no longer read in the route. Replace the `react-native` import block (lines 2–11):

```ts
import {
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
```

with:

```ts
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
```

- [ ] **Step 4: Move `useCameraSettings` above `useCameraHud` and seed the HUD.** First delete the current settings line (line 263):

```ts
  const { settings, setSettings, hydrated: settingsHydrated } = useCameraSettings();
```

Then insert it (without the unused `hydrated` alias) immediately before the `// CLAUDE.md Rule 9:` comment that precedes the HUD hook (i.e. directly above line 222). The region around line 222 currently reads:

```ts
  // CLAUDE.md Rule 9: the camera HUD's discrete interaction state (facing,
  // flash, aspect, overlay config, panels, toasts) lives in one reducer hook,
  // not ~19 loose top-level useStates. Destructured so existing reads stay as
  // bare identifiers; writes go through `setHud(patch)`.
  const { hud, setHud } = useCameraHud();
```

Replace that block with:

```ts
  const { settings, setSettings } = useCameraSettings();

  // CLAUDE.md Rule 9: the camera HUD's discrete interaction state (facing,
  // flash, aspect, overlay config, panels, toasts) lives in one reducer hook,
  // not ~19 loose top-level useStates. Destructured so existing reads stay as
  // bare identifiers; writes go through `setHud(patch)`. The four persisted
  // overlay knobs seed the reducer's lazy initializer from `settings`.
  const { hud, setHud } = useCameraHud(settings);
```

> Ordering is safe: `useCameraSettings()` takes no arguments, and nothing between the old (`:263`) and new (`~:222`) positions feeds it. `useSceneSwitcherSpots(animeId, sceneSwitcherOpen)` at `:258` reads `sceneSwitcherOpen` from `hud` (destructured right after the HUD hook), not from `settings`, so it is unaffected.

- [ ] **Step 5: Delete the `appIsForeground` state.** Remove line 249:

```ts
  const [appIsForeground, setAppIsForeground] = useState(() => AppState.currentState === 'active');
```

(`appIsForeground` now lives inside `useCameraLifecycle`. No replacement line.)

- [ ] **Step 6: Replace the seed/mirror block (effects #1 + #2 + the latch) with a write-through helper.** Delete the entire span from the comment at line 265 through the close of the second effect at line 304:

```ts
  // Persistence wiring for overlay-mode + its sub-knobs (edge intensity,
  // subject focus / combine). The hud reducer is the source of truth at
  // runtime; `CameraSettings` is the write-through cache. We seed once from
  // persisted MMKV settings and then mirror every subsequent hud change so a
  // mode/intensity/focus picked this session restores on the next launch.
  //
  // The ref-gated one-shot seed prevents the post-hydration sync from
  // clobbering a brand-new in-session pick during the brief window
  // between user interaction and the next render commit.
  const overlaySettingsSyncedRef = useRef(false);
  useEffect(() => {
    if (!settingsHydrated || overlaySettingsSyncedRef.current) return;
    overlaySettingsSyncedRef.current = true;
    setHud({
      overlayMode: settings.overlayMode,
      edgeIntensity: settings.edgeIntensity,
      subjectFocus: settings.subjectFocus,
      subjectCombine: settings.subjectCombine,
    });
  }, [
    settingsHydrated,
    settings.overlayMode,
    settings.edgeIntensity,
    settings.subjectFocus,
    settings.subjectCombine,
    setHud,
  ]);
  // Mirror hud → settings on every change after the one-shot seed has run.
  // Guarding on the ref keeps the mirror dormant during the pre-hydration
  // window where hud holds its INITIAL_CAMERA_HUD defaults (not the user's
  // persisted choices yet).
  useEffect(() => {
    if (!overlaySettingsSyncedRef.current) return;
    setSettings({
      overlayMode: hud.overlayMode,
      edgeIntensity: hud.edgeIntensity,
      subjectFocus: hud.subjectFocus,
      subjectCombine: hud.subjectCombine,
    });
  }, [hud.overlayMode, hud.edgeIntensity, hud.subjectFocus, hud.subjectCombine, setSettings]);
```

Replace it with this comment + write-through `useCallback`:

```ts
  // Overlay knobs (overlayMode / edgeIntensity / subjectFocus / subjectCombine)
  // are SEEDED into the HUD reducer's lazy initializer from `settings` above
  // (useCameraHud(settings)). Persistence now happens inline via this
  // write-through — NOT a mirror effect. This kills the seed→mirror loop and
  // the synced-ref latch (CLAUDE.md Rule 9: derive / write-through, don't
  // reconcile two stores with a pair of effects).
  const persistOverlayKnob = useCallback(
    (
      patch: Partial<
        Pick<CameraSettings, 'overlayMode' | 'edgeIntensity' | 'subjectFocus' | 'subjectCombine'>
      >
    ) => {
      setHud(patch);
      setSettings(patch);
    },
    [setHud, setSettings]
  );
```

- [ ] **Step 7: Update `lifecycle` to the new call shape and drop `setCameraActive`.** Replace lines 305–312:

```ts
  const lifecycle = useCameraLifecycle(true);
  const {
    active: cameraActive,
    isReady: cameraIsReady,
    onCameraReady,
    onMountError,
    setActive: setCameraActive,
  } = lifecycle;
```

with:

```ts
  const lifecycle = useCameraLifecycle({ settingsOpen, initialActive: true });
  const {
    active: cameraActive,
    isReady: cameraIsReady,
    onCameraReady,
    onMountError,
  } = lifecycle;
```

> `settingsOpen` is already destructured from `hud` at line 238, above this call — so it is in scope. `cameraActive` (consumed at `:1410` as `active={cameraActive}`) and `cameraIsReady` (consumed at `:1421` in `showWarmup={!cameraIsReady || strategic.isSwitching}`) are unchanged. The wrappers `handleCameraReady` (`:418–421`) / `handleMountError` (`:422–428`) still call `onCameraReady` / `onMountError` and remain valid against the hook's unchanged output names.

- [ ] **Step 8: Replace the inline freeze-frame state + render-body ref write + `deleteFreezeFrame` + effects #3/#4 with the hook.** Delete the span from the comment at line 347 through the close of effect #4 at line 386:

```ts
  // Snapshot of the previous lens's preview, captured right before a session
  // swap so CameraStage can render it as a freeze-frame overlay while
  // CameraX tears down the old session. Android-only (engine.takeSnapshot
  // returns null on iOS); the animated vignette covers the iOS path.
  const [freezeFrameUri, setFreezeFrameUri] = useState<string | null>(null);
  // Mirror so cleanup paths can read the latest URI without depending on the
  // closure-captured state value — used when a new switch arrives before the
  // previous swap has finished cleaning up its temp file.
  const freezeFrameUriRef = useRef<string | null>(null);
  freezeFrameUriRef.current = freezeFrameUri;

  const deleteFreezeFrame = useCallback((uri: string | null) => {
    if (!uri) return;
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }, []);

  // Clear the freeze-frame once the new session is up and the warmup overlay
  // has finished its fade-out (~250ms). Also delete the temp file so we don't
  // leak ~100 kB JPEGs into the cache each swap.
  useEffect(() => {
    if (strategic.isSwitching) return;
    if (!freezeFrameUri) return;
    const uri = freezeFrameUri;
    const timer = setTimeout(() => {
      setFreezeFrameUri(null);
      // Best-effort cleanup; if the file vanished already or the path is
      // malformed we just move on. No error toast — the snapshot is purely a
      // visual nicety; failure should never reach the user.
      deleteFreezeFrame(uri);
    }, 260);
    return () => clearTimeout(timer);
  }, [strategic.isSwitching, freezeFrameUri, deleteFreezeFrame]);

  // Always sweep the temp file on unmount so backgrounded swaps don't leak.
  useEffect(() => {
    return () => {
      const pending = freezeFrameUriRef.current;
      if (pending) deleteFreezeFrame(pending);
    };
  }, [deleteFreezeFrame]);
```

Replace it with the hook call:

```ts
  // Android lens-swap freeze-frame: snapshot of the previous lens held still
  // while CameraX tears down the old session. The hook owns the URI + temp-file
  // lifecycle (clear-after-swap, unmount sweep) and writes its ref mirror in the
  // SETTER, not the render body (CLAUDE.md Rule 9). Android-only — on iOS the
  // URI stays null and the hook's effects are no-ops.
  const { freezeFrameUri, setFreezeFrameUri, getFreezeFrameUri } = useFreezeFrame({
    isSwitching: strategic.isSwitching,
  });
```

- [ ] **Step 9: Rewire `handleRequestSwitch` to the hook's `getFreezeFrameUri()` + an inline best-effort delete.** The current callback (lines 394–415) reads `freezeFrameUriRef.current` and calls the removed `deleteFreezeFrame`. Replace it:

```ts
  const handleRequestSwitch = useCallback(
    (target: 'wide' | 'ultra-wide') => {
      if (Platform.OS === 'android') {
        // If a previous freeze-frame is still hanging around (rapid double-
        // tap), delete it before overwriting. The ref read avoids racing the
        // cleanup-timer effect that hasn't fired yet.
        const previous = freezeFrameUriRef.current;
        const snap = cameraRef.current?.takeSnapshot();
        if (snap) {
          snap
            .then((uri) => {
              if (!uri) return;
              if (previous && previous !== uri) deleteFreezeFrame(previous);
              setFreezeFrameUri(uri);
            })
            .catch(() => undefined);
        }
      }
      strategic.requestSwitch(target);
    },
    [strategic, deleteFreezeFrame]
  );
```

with:

```ts
  const handleRequestSwitch = useCallback(
    (target: 'wide' | 'ultra-wide') => {
      if (Platform.OS === 'android') {
        // If a previous freeze-frame is still hanging around (rapid double-
        // tap), delete it before overwriting. getFreezeFrameUri() reads the
        // hook's ref mirror, avoiding a race with its cleanup-timer effect.
        const previous = getFreezeFrameUri();
        const snap = cameraRef.current?.takeSnapshot();
        if (snap) {
          snap
            .then((uri) => {
              if (!uri) return;
              if (previous && previous !== uri) {
                FileSystem.deleteAsync(previous, { idempotent: true }).catch(() => undefined);
              }
              setFreezeFrameUri(uri);
            })
            .catch(() => undefined);
        }
      }
      strategic.requestSwitch(target);
    },
    [strategic, getFreezeFrameUri, setFreezeFrameUri]
  );
```

> `FileSystem` is already imported at route line 16 (`import * as FileSystem from 'expo-file-system/legacy';`), so the inline best-effort delete of the previous snapshot compiles without a new import. `FileSystem` is still referenced after this (here), so its import is NOT now unused.

- [ ] **Step 10: Delete effects #10 + #11 + the AppState listener.** Remove lines 600–610:

```ts
  // T1 fix: drive the camera's active flag off app lifecycle + settings sheet.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppIsForeground(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setCameraActive(resolveCameraActive({ appIsForeground, settingsOpen }));
  }, [appIsForeground, settingsOpen, setCameraActive]);
```

Replace with a one-line note (no effect — `active` is derived inside the hook now):

```ts
  // Camera `active` is derived inside useCameraLifecycle from app foreground
  // state + settingsOpen + onError re-arm; the route just passes `settingsOpen`
  // in (above) and reads `cameraActive` (below). No effect here.
```

- [ ] **Step 11: Remove the now-unused `resolveCameraActive` import.** The route imported `resolveCameraActive` from `camera-ui` (line 35) only for the deleted effect #11. Remove it from the import group (lines 31–38):

```ts
import {
  cameraOrientationLockIntent,
  CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
  resolveCameraBottomInset,
  resolveCameraActive,
  resolveCameraTopChromeHeight,
  resolveTransientCameraHudVisibility,
} from '../../../../libs/services/pilgrimage/camera-ui';
```

becomes:

```ts
import {
  cameraOrientationLockIntent,
  CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
  resolveCameraBottomInset,
  resolveCameraTopChromeHeight,
  resolveTransientCameraHudVisibility,
} from '../../../../libs/services/pilgrimage/camera-ui';
```

> Leave `cameraOrientationLockIntent` in place — it is still consumed by the orientation effect at `:653` (`const lockIntent = cameraOrientationLockIntent(orientationMode);`), which this phase does not touch.

- [ ] **Step 12: Route the overlay-knob writes through `persistOverlayKnob` so they persist.** In the `OverlayControlsBar` JSX (lines 1379–1388) the mode/intensity/combine handlers currently call `setHud` only, so a session pick no longer survives relaunch (the mirror effect that used to persist it is gone). Replace the `onSelectMode` / `onSelectEdgeIntensity` / `onToggleSubjectCombine` handlers:

```ts
      onSelectMode={(m) => {
        const seed = OVERLAY_MODE_TOAST[m];
        setHud({
          overlayMode: m,
          overlayVisible: true,
          switchToast: { icon: seed.icon, label: t(seed.labelKey), hint: seed.hint },
        });
      }}
      onSelectEdgeIntensity={(i) => setHud({ edgeIntensity: i })}
      onToggleSubjectCombine={() => setHud((h) => ({ subjectCombine: !h.subjectCombine }))}
```

with (mode bundles visual-only fields on `setHud`, persists just the knob; intensity persists directly; combine reads the live value off `hud` then persists the toggle):

```ts
      onSelectMode={(m) => {
        const seed = OVERLAY_MODE_TOAST[m];
        // Visual-only fields (overlayVisible, switchToast) stay on setHud; the
        // persisted knob goes through the write-through so it restores on relaunch.
        setHud({
          overlayVisible: true,
          switchToast: { icon: seed.icon, label: t(seed.labelKey), hint: seed.hint },
        });
        persistOverlayKnob({ overlayMode: m });
      }}
      onSelectEdgeIntensity={(i) => persistOverlayKnob({ edgeIntensity: i })}
      onToggleSubjectCombine={() => persistOverlayKnob({ subjectCombine: !subjectCombine })}
```

> `subjectCombine` is already destructured from `hud` at line 233, so reading the live value for the toggle is in scope. `persistOverlayKnob({ overlayMode: m })` both updates the reducer and writes MMKV, so the overlay mode still drives `edgeOrSketch` / `subjectReady` exactly as before. (`onChangeOpacity` at `:1390` keeps using `setHud` — `overlayOpacity` is not one of the four persisted knobs and is intentionally session-only.)

- [ ] **Step 13: Check that the `onSelectOff` "off" path stays transient.** The sibling `onSelectOff` handler at lines 1372–1378 sets `overlayVisible: false` (it does not change `overlayMode`). It must stay `setHud` (OFF is a visibility toggle, not a persisted overlay mode). Confirm it is untouched:

```bash
grep -n "overlayVisible: false" "app/(tabs)/pilgrimage/compare/[spotId].tsx"
```

Expected: one hit around line 1375, inside the `onSelectOff` handler, still using `setHud`. No change needed — OFF is correctly transient.

- [ ] **Step 14: Typecheck the route file.**

```bash
bunx tsc --noEmit
```

Expected: **clean** (exit 0, no output). All Task 3 route errors are now resolved. If tsc names any leftover unused symbol, remove exactly what it names and re-run. (`useState` is still used at `:248`/`:250`/`:252`/`:256`; `useRef` at `:219`/`:251`; `useMemo` at `:327`; `useEffect`/`useCallback` throughout — so the React import line at line 1 stays as-is.)

- [ ] **Step 15: Commit.**

```bash
git add "app/(tabs)/pilgrimage/compare/[spotId].tsx"
git commit -m "refactor(camera): wire useCameraLifecycle/useFreezeFrame, kill mirror+AppState effects"
```

---

### Task 6: Full verification — typecheck, suite, effect-count check, and on-device gate

No code changes. This task proves the phase landed correctly and produces the §3.5 manual evidence the spec's verification gate requires.

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck.**

```bash
bunx tsc --noEmit
```

Expected: exit 0, no output.

- [ ] **Step 2: Run the three affected unit suites — expect all green.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/camera-hud.test.ts __tests__/unit/pilgrimage/camera-ui.test.ts __tests__/unit/pilgrimage/camera-settings.test.ts
```

Expected: `0 fail` across all three files (camera-hud now 8 cases, camera-ui includes the new interruption case, camera-settings unchanged and still green). Baseline before this phase: 31 pass / 0 fail across these three files; after Tasks 1–2 it is 31 + 3 (hud) + 1 (ui) = 35 pass.

- [ ] **Step 3: Run the full unit suite to confirm no collateral breakage.**

```bash
bun run test:unit
```

Expected: the whole suite passes (`0 fail`). If a previously-green camera feature-parity / overlay-controls test fails, it is consuming the old `useCameraHud()` / `useCameraLifecycle(true)` shape — re-check Task 5 wiring; do not edit tests to paper over a real regression (Rule 8).

- [ ] **Step 4: Confirm the route's effect count dropped.** §3.3 targets ~14 → ~6–8 effects; this phase removes 4 of them (#1, #2, #3, #4) plus the two lifecycle effects (#10, #11) — i.e. 6 effects gone, 2 net new owned inside hooks. Count remaining top-level effects in the route:

```bash
grep -c "useEffect(" "app/(tabs)/pilgrimage/compare/[spotId].tsx"
```

Expected: **6 fewer** than the pre-phase baseline. Verified the current baseline is **14** `useEffect(` occurrences, so the post-phase count must be **8**. If it is higher than 8, an effect that should have been removed is still present — re-audit Steps 6, 8, 10.

- [ ] **Step 5: Confirm the render-phase ref write is gone.**

```bash
grep -n "freezeFrameUriRef.current = " "app/(tabs)/pilgrimage/compare/[spotId].tsx"
```

Expected: **no output** (the render-body assignment at old line 356 is deleted; the only ref write now lives inside `useFreezeFrame`'s setter).

- [ ] **Step 6: On-device manual gate (the part unit tests cannot cover — spec §3.5 + Testing point 4).** Build to a device/simulator and verify each, recording pass/fail:

  1. **Settings persist (C3).** Open the camera, change overlay mode (e.g. edge → anime), edge intensity, and subject-combine. Fully kill and relaunch the app, reopen the same spot's camera. Expected: the overlay mode/intensity/combine you picked is restored on the **first frame** (no flash of the default `edge`), proving the lazy-initializer seed + write-through replaced the mirror loop with no regression.
  2. **Backgrounding pauses (C2).** With the camera open, background the app (home gesture). Expected: preview freezes/stops (session paused). Foreground again. Expected: preview resumes within ~1s without a stuck "Preparing camera…" veil (sticky `isReady`).
  3. **Settings sheet pauses (C2).** Open the in-camera settings sheet. Expected: live preview pauses behind it; closing it resumes. (`settingsOpen` → derived `active`.)
  4. **Interruption / error recovery (C2 + §3.5).** Trigger a session error or interruption — easiest reproducible path: start a phone/FaceTime call (or on simulator, toggle the camera away to another app that grabs it) while the camera is open, then return. Expected: the camera **re-arms and the live preview comes back** within ~1–2s rather than staying black/dead. (This exercises the `onMountError` → `rearming` off→on cycle.)
  5. **Lens swap freeze-frame still works (C4 regression).** On an Android device with an ultra-wide, pinch/tap-switch between wide and 0.5×. Expected: the previous-lens still frame holds during the swap (no black flash), then clears cleanly — i.e. moving the ref write into the setter did not break the snapshot timing.

  Record the five results in the PR description. Any failure on 1–5 is a phase blocker, not a deferred item.

---

## Phase 5 — i18n cleanup (Rule 11)

**Phase scope.** Localize the camera HUD / toast / error / chip stragglers (spec §3.4). All new keys land in the flat `pilgrimageUi` namespace, **en.json first then zh-Hant.json**, alphabetically interleaved with the existing keys. Three non-React copy modules (`capture-mode-copy.ts`, `edge-overlay.ts`, `subject-overlay.ts`) are converted to return `TranslationKey`s, resolved with `t()` at every call site — mirroring the `MODES: ModeMeta[]` pattern `OverlayControls.tsx` / `OverlayControlsBar.tsx` already use. `CameraErrorBoundary` (a class component) resolves its strings inside the existing `CameraErrorFallback` function child and **stops rendering the raw `Error.message`** (it logs it instead and shows a localized generic message).

**TDD note (REPO TDD RULE).** Pure conversions are unit-tested (the copy modules now return `TranslationKey` strings that must resolve via `translate('en', key)` to the expected English copy). RN/JSX wiring (threading `t()` into `<Text>`, a11y labels) has no pure logic — its gate is `bunx tsc --noEmit` plus the parity test. The i18n parity test (`__tests__/unit/i18n.test.ts`) guards en/zh-Hant shape and must stay green after every key addition. **Two existing tests hard-depend on the converted modules and are updated in the same task as the conversion that touches them** — `edge-overlay.test.ts` / `subject-overlay.test.ts` (Tasks 5.3 / 5.4) and `camera-feature-parity.test.tsx` (Task 5.2). A third, `camera-overlay-controls.test.tsx`, asserts `accessibilityLabel === 'Pick character'` against a `useT` mock backed by `en.json`; it stays green because Task 5.1 adds the en value `Pick character` before Task 5.8 rewires that label (no edit needed there, but the dependency is real).

**Key inventory (added across this phase).** Every key below is added to **en.json first, then zh-Hant.json** with the exact values listed in its task:

| Key (`pilgrimageUi.*`) | en | zh-Hant |
|---|---|---|
| `aligned` | `Aligned · {percent}` | `已對齊 · {percent}` |
| `autoCaptured` | `Auto-captured · {count}` | `已自動預拍 · {count}` |
| `positionLocked` | `Position locked — shoot now` | `位置已鎖定 — 立即拍攝` |
| `cameraNeedsRestart` | `Camera needs to restart` | `相機需要重新啟動` |
| `restartCamera` | `Restart camera` | `重新啟動相機` |
| `cameraTemporarilyUnavailable` | `The camera is temporarily unavailable. Tap to restart.` | `相機暫時無法使用,點一下重新啟動。` |
| `afLock` | `AF LOCK` | `AF 鎖定` |
| `overlayModeA11y` | `Overlay mode {mode}` | `疊層模式 {mode}` |
| `hideOverlay` | `Hide overlay` | `隱藏疊層` |
| `edgeIntensityA11y` | `Edge intensity {intensity}` | `邊緣強度 {intensity}` |
| `subjectFocusA11y` | `Subject focus {focus}` | `角色聚焦 {focus}` |
| `lockOverlayPosition` | `Lock overlay position` | `鎖定疊層位置` |
| `repositionOverlay` | `Reposition overlay` | `重新定位疊層` |
| `repositioning` | `Repositioning` | `定位中` |
| `reposition` | `Reposition` | `重新定位` |
| `swapCharacter` | `Swap character` | `更換角色` |
| `pickCharacter` | `Pick character` | `挑選角色` |
| `captureModeSingleLabel` | `Photo` | `照片` |
| `captureModeSingleHint` | `One sharp shot` | `一張清晰照片` |
| `captureModeBurstLabel` | `Burst` | `連拍` |
| `captureModeBurstHint` | `Captures 6 frames, keeps the best-aligned` | `連拍 6 張,保留對齊最佳的一張` |
| `captureModeAutoLabel` | `Auto` | `自動` |
| `captureModeAutoHint` | `Detects high-contrast scenes and brackets exposure when needed` | `偵測高對比場景,必要時包圍曝光` |
| `captureModeAutoHintHdr` | `High-contrast scene — using hardware HDR on this device` | `高對比場景 — 此裝置使用硬體 HDR` |
| `captureModeHelp` | `Single: one shot. Burst: 6 frames, keeps the best-aligned. Auto: detects high-contrast scenes and brackets exposure when needed (uses hardware HDR if supported).` | `照片:單張。連拍:6 張,保留對齊最佳的一張。自動:偵測高對比場景,必要時包圍曝光(支援時使用硬體 HDR)。` |
| `edgeIntensityLow` | `Edge+` | `邊緣+` |
| `edgeIntensityMid` | `Edge` | `邊緣` |
| `edgeIntensityHigh` | `Edge Max` | `邊緣強化` |
| `subjectFocusTight` | `Tight` | `緊湊` |
| `subjectFocusNormal` | `Normal` | `標準` |
| `subjectFocusWide` | `Wide` | `寬廣` |

Existing keys reused (no addition): `commonUi.anime`, `common.off`, `common.reset`, `pilgrimageUi.combine`, `pilgrimageUi.character`, `pilgrimageUi.flip`, `pilgrimageUi.overlay`, `pilgrimageUi.overlayOpacity`, `pilgrimageUi.flipOverlayHorizontally`, `pilgrimageUi.combineSubjectOverlayIntoThe`, `pilgrimageUi.combineSubjectOverlayIntoCaptured`, `pilgrimageUi.resetOverlayPosition`. (Verified present: `commonUi.anime` en.json:1360, `common.off` :23, `common.reset` :16; the `pilgrimageUi.*` reuses all exist in the 1414–1584 block.)

---

### Task 5.1: Add the camera-straggler keys to en.json then zh-Hant.json

**Files:**
- Modify: `libs/i18n/locales/en.json` (`pilgrimageUi` block, lines 1414–1584 — insert alphabetically)
- Modify: `libs/i18n/locales/zh-Hant.json` (`pilgrimageUi` block, lines 1414–1584 — same keys, same order)
- Test: `__tests__/unit/i18n.test.ts` (existing parity test — run it, no edit)

This task adds the keys consumed by Tasks 5.2–5.7. The `pilgrimageUi` namespace is flat and sorted identically in both files (verified: both blocks span 1414–1584 and every key line matches); insert each key at its alphabetical slot so the parity walk and future diffs stay clean.

- [ ] **Step 1: Add `afLock` to en.json.** Place it **after** `"accuracy"` / `"accuracyAndSafetyChecks"` / `"addWhereWhyOrWhat"` / `"adjustLockedFocusExposure"` (line 1418) and **before** `"albumDescription"` (line 1419) — `"adjustLockedFocusExposure"` < `"afLock"` < `"albumDescription"`. Change:

```json
    "adjustLockedFocusExposure": "Adjust locked focus exposure",
    "albumDescription": "Album description",
```
to:
```json
    "adjustLockedFocusExposure": "Adjust locked focus exposure",
    "afLock": "AF LOCK",
    "albumDescription": "Album description",
```

- [ ] **Step 2: Add `aligned` to en.json.** After `"alignWithScene": "Align with scene",` (line 1420) and before `"allowCameraSoYouCan"` (line 1421). Change:

```json
    "alignWithScene": "Align with scene",
    "allowCameraSoYouCan": "Allow camera so you can frame this scene against its anime reference.",
```
to:
```json
    "alignWithScene": "Align with scene",
    "aligned": "Aligned · {percent}",
    "allowCameraSoYouCan": "Allow camera so you can frame this scene against its anime reference.",
```

- [ ] **Step 3: Add `autoCaptured` to en.json.** After `"autoCaptureWhenAligned": "Auto-capture when aligned",` (line 1431) and before `"autoLens"` (line 1432). Change:

```json
    "autoCaptureWhenAligned": "Auto-capture when aligned",
    "autoLens": "Auto lens",
```
to:
```json
    "autoCaptureWhenAligned": "Auto-capture when aligned",
    "autoCaptured": "Auto-captured · {count}",
    "autoLens": "Auto lens",
```

- [ ] **Step 4: Add the `cameraNeedsRestart` / `cameraTemporarilyUnavailable` keys to en.json.** After `"cameraAngle": "Camera Angle",` (line 1443) and before `"cameraSettings"` (line 1444). Change:

```json
    "cameraAngle": "Camera Angle",
    "cameraSettings": "Camera settings",
```
to:
```json
    "cameraAngle": "Camera Angle",
    "cameraNeedsRestart": "Camera needs to restart",
    "cameraSettings": "Camera settings",
    "cameraTemporarilyUnavailable": "The camera is temporarily unavailable. Tap to restart.",
```

- [ ] **Step 5: Add the `captureMode*` copy keys to en.json.** After `"captureMode": "Capture mode",` (line 1447) and before `"character"` (line 1448). Change:

```json
    "captureMode": "Capture mode",
    "character": "Character",
```
to:
```json
    "captureMode": "Capture mode",
    "captureModeAutoHint": "Detects high-contrast scenes and brackets exposure when needed",
    "captureModeAutoHintHdr": "High-contrast scene — using hardware HDR on this device",
    "captureModeAutoLabel": "Auto",
    "captureModeBurstHint": "Captures 6 frames, keeps the best-aligned",
    "captureModeBurstLabel": "Burst",
    "captureModeHelp": "Single: one shot. Burst: 6 frames, keeps the best-aligned. Auto: detects high-contrast scenes and brackets exposure when needed (uses hardware HDR if supported).",
    "captureModeSingleHint": "One sharp shot",
    "captureModeSingleLabel": "Photo",
    "character": "Character",
```

- [ ] **Step 6: Add the `edgeIntensity*` keys to en.json.** After `"edge": "Edge",` (line 1471) and before `"enableGps"` (line 1472). Change:

```json
    "edge": "Edge",
    "enableGps": "Enable GPS",
```
to:
```json
    "edge": "Edge",
    "edgeIntensityA11y": "Edge intensity {intensity}",
    "edgeIntensityHigh": "Edge Max",
    "edgeIntensityLow": "Edge+",
    "edgeIntensityMid": "Edge",
    "enableGps": "Enable GPS",
```

- [ ] **Step 7: Add `hideOverlay` to en.json.** After `"histogram": "Histogram",` (line 1489) and before `"imageUnavailable"` (line 1490). Change:

```json
    "histogram": "Histogram",
    "imageUnavailable": "Image unavailable",
```
to:
```json
    "histogram": "Histogram",
    "hideOverlay": "Hide overlay",
    "imageUnavailable": "Image unavailable",
```

- [ ] **Step 8: Add `lockOverlayPosition` to en.json.** After `"locationIsOff": "Location is off",` (line 1500) and before `"magenta"` (line 1501). Change:

```json
    "locationIsOff": "Location is off",
    "magenta": "Magenta",
```
to:
```json
    "locationIsOff": "Location is off",
    "lockOverlayPosition": "Lock overlay position",
    "magenta": "Magenta",
```

- [ ] **Step 9: Add the `overlayModeA11y` key to en.json.** It sorts **before** `"overlayOff"` ('M' < 'O'), so insert it above the `overlayOff` line (line 1521). The `overlay` key (`"overlay": "Overlay",`, line 1520) is one line earlier and stays untouched. Change:

```json
    "overlayOff": "Overlay Off",
    "overlayOpacity": "Overlay opacity",
```
to:
```json
    "overlayModeA11y": "Overlay mode {mode}",
    "overlayOff": "Overlay Off",
    "overlayOpacity": "Overlay opacity",
```

- [ ] **Step 10: Add the `pickCharacter` key to en.json.** After `"photoTipsBestFrame": "Photo Tips & Best Frame",` (line 1527) and before `"pickPhotoFromLibrary"` (line 1528). Change:

```json
    "photoTipsBestFrame": "Photo Tips & Best Frame",
    "pickPhotoFromLibrary": "Pick photo from library",
```
to:
```json
    "photoTipsBestFrame": "Photo Tips & Best Frame",
    "pickCharacter": "Pick character",
    "pickPhotoFromLibrary": "Pick photo from library",
```

- [ ] **Step 11: Add `positionLocked` to en.json.** After `"positionLock": "Position Lock",` (line 1532) and before `"precisionAlignment"` (line 1533). Change:

```json
    "positionLock": "Position Lock",
    "precisionAlignment": "Precision Alignment",
```
to:
```json
    "positionLock": "Position Lock",
    "positionLocked": "Position locked — shoot now",
    "precisionAlignment": "Precision Alignment",
```

- [ ] **Step 12: Add the `reposition` / `repositionOverlay` / `repositioning` keys to en.json.** After `"referenceBasedGuidance": "Reference-based guidance",` (line 1537) and before `"resetCorners"` (line 1538). Change:

```json
    "referenceBasedGuidance": "Reference-based guidance",
    "resetCorners": "Reset corners",
```
to:
```json
    "referenceBasedGuidance": "Reference-based guidance",
    "reposition": "Reposition",
    "repositionOverlay": "Reposition overlay",
    "repositioning": "Repositioning",
    "resetCorners": "Reset corners",
```

> Note: `"restartCamera"` sorts after `"resolution"` (line 1540) and before `"retake"` (line 1541). In the same file pass, change `"resolution": "Resolution",\n    "retake": "Retake",` to `"resolution": "Resolution",\n    "restartCamera": "Restart camera",\n    "retake": "Retake",`.

- [ ] **Step 13: Add the `subjectFocus*` keys + `swapCharacter` to en.json.** After `"subject": "Subject",` (line 1563) and before `"switchAnimeReferenceScene"` (line 1564). Change:

```json
    "subject": "Subject",
    "switchAnimeReferenceScene": "Switch anime reference scene",
```
to:
```json
    "subject": "Subject",
    "subjectFocusA11y": "Subject focus {focus}",
    "subjectFocusNormal": "Normal",
    "subjectFocusTight": "Tight",
    "subjectFocusWide": "Wide",
    "swapCharacter": "Swap character",
    "switchAnimeReferenceScene": "Switch anime reference scene",
```

- [ ] **Step 14: Mirror every new key into zh-Hant.json at the same alphabetical slots.** Apply the identical insertions to `libs/i18n/locales/zh-Hant.json` (`pilgrimageUi` block, lines 1414–1584) with the Traditional Chinese values. The zh-Hant block was verified line-identical to en.json (same start 1414, same end 1584, same key order), so each slot matches its English counterpart line-for-line. The 29 lines to add:

```json
    "afLock": "AF 鎖定",
    "aligned": "已對齊 · {percent}",
    "autoCaptured": "已自動預拍 · {count}",
    "cameraNeedsRestart": "相機需要重新啟動",
    "cameraTemporarilyUnavailable": "相機暫時無法使用,點一下重新啟動。",
    "captureModeAutoHint": "偵測高對比場景,必要時包圍曝光",
    "captureModeAutoHintHdr": "高對比場景 — 此裝置使用硬體 HDR",
    "captureModeAutoLabel": "自動",
    "captureModeBurstHint": "連拍 6 張,保留對齊最佳的一張",
    "captureModeBurstLabel": "連拍",
    "captureModeHelp": "照片:單張。連拍:6 張,保留對齊最佳的一張。自動:偵測高對比場景,必要時包圍曝光(支援時使用硬體 HDR)。",
    "captureModeSingleHint": "一張清晰照片",
    "captureModeSingleLabel": "照片",
    "edgeIntensityA11y": "邊緣強度 {intensity}",
    "edgeIntensityHigh": "邊緣強化",
    "edgeIntensityLow": "邊緣+",
    "edgeIntensityMid": "邊緣",
    "hideOverlay": "隱藏疊層",
    "lockOverlayPosition": "鎖定疊層位置",
    "overlayModeA11y": "疊層模式 {mode}",
    "pickCharacter": "挑選角色",
    "positionLocked": "位置已鎖定 — 立即拍攝",
    "reposition": "重新定位",
    "repositionOverlay": "重新定位疊層",
    "repositioning": "定位中",
    "restartCamera": "重新啟動相機",
    "subjectFocusA11y": "角色聚焦 {focus}",
    "subjectFocusNormal": "標準",
    "subjectFocusTight": "緊湊",
    "subjectFocusWide": "寬廣",
    "swapCharacter": "更換角色"
```

Insert each at the slot matching its English counterpart (e.g. `"afLock"` after `"adjustLockedFocusExposure"` line 1418; `"aligned"` after `"alignWithScene"` line 1420; `"subjectFocusA11y"…"swapCharacter"` after `"subject"` line 1563; etc.).

- [ ] **Step 15 (TEST — must PASS): run the i18n parity test.** Both catalogs gained the same keys, so parity holds. (Verified baseline currently green.)

```bash
bun test --preload ./test-setup.ts __tests__/unit/i18n.test.ts
```

Expected output (tail):

```
catalog parity > zh-Hant has no stale keys and no shape drift [PASS]
catalog parity > zh-Hans has no stale keys and no shape drift [PASS]
catalog parity > ja has no stale keys and no shape drift [PASS]
catalog parity > ko has no stale keys and no shape drift [PASS]
...
 N pass
 0 fail
```

> If parity fails with `stale key (not in English catalog)`, a key was added to zh-Hant.json that is missing or misspelled in en.json — re-check Steps 1–13 vs Step 14.

- [ ] **Step 16: Commit.**

```bash
git add libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json
git commit -m "i18n(camera): add HUD/toast/error/chip keys to pilgrimageUi (en + zh-Hant)"
```

---

### Task 5.2: Convert `capture-mode-copy.ts` to return TranslationKeys (TDD)

**Files:**
- Modify: `libs/services/pilgrimage/capture-mode-copy.ts` (whole file, lines 1–41)
- Create: `__tests__/unit/pilgrimage/capture-mode-copy.test.ts`
- Modify: `__tests__/unit/pilgrimage/camera-feature-parity.test.tsx` (import lines 4–6; the test "keeps capture mode copy aligned with the real capture implementations", lines 93–106) — this existing test imports `CAPTURE_MODE_HELP_TEXT` (removed here) and asserts English substrings against `captureModeToastCopy(...).hint`, so it MUST be updated in the same commit or it fails.
- Test: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/capture-mode-copy.test.ts __tests__/unit/pilgrimage/camera-feature-parity.test.tsx`

`CaptureModeCopyMode` is `'single' | 'burst' | 'auto'` (matches `CaptureMode` from `useCameraSettings`). The module today returns English literals in `label`/`hint` (`MODE_COPY`, lines 15–27) and a help-text literal (`CAPTURE_MODE_HELP_TEXT`, lines 12–13). Convert `label`/`hint` to `TranslationKey` (icon stays a glyph name — it is not user-facing text), and convert `CAPTURE_MODE_HELP_TEXT` to a `TranslationKey` named `CAPTURE_MODE_HELP_TEXT_KEY`. Call sites resolve with `t()` in Task 5.5.

- [ ] **Step 1 (TEST — write FIRST, must FAIL): create the conversion test.** It asserts the module now returns `TranslationKey`s that resolve to the expected English copy via the engine.

```ts
import { describe, expect, it } from 'bun:test';
import {
  CAPTURE_MODE_HELP_TEXT_KEY,
  captureModeToastCopy,
  type CaptureModeCopyMode,
} from '../../../libs/services/pilgrimage/capture-mode-copy';
import { translate } from '../../../libs/i18n/engine';

describe('capture mode copy', () => {
  it('returns translation keys that resolve to the English label/hint', () => {
    const single = captureModeToastCopy('single', false);
    expect(single.icon).toBe('camera-outline');
    expect(translate('en', single.label)).toBe('Photo');
    expect(translate('en', single.hint)).toBe('One sharp shot');

    const burst = captureModeToastCopy('burst', false);
    expect(translate('en', burst.label)).toBe('Burst');
    expect(translate('en', burst.hint)).toBe('Captures 6 frames, keeps the best-aligned');

    const auto = captureModeToastCopy('auto', false);
    expect(translate('en', auto.label)).toBe('Auto');
    expect(translate('en', auto.hint)).toBe(
      'Detects high-contrast scenes and brackets exposure when needed'
    );
  });

  it('swaps in the hardware-HDR hint key when native HDR is active for auto mode', () => {
    const hdr = captureModeToastCopy('auto', true);
    expect(translate('en', hdr.hint)).toBe(
      'High-contrast scene — using hardware HDR on this device'
    );
    // Non-auto modes ignore the HDR flag.
    expect(translate('en', captureModeToastCopy('single', true).hint)).toBe('One sharp shot');
  });

  it('exposes the help-text key resolving to the full help copy', () => {
    expect(translate('en', CAPTURE_MODE_HELP_TEXT_KEY)).toBe(
      'Single: one shot. Burst: 6 frames, keeps the best-aligned. Auto: detects high-contrast scenes and brackets exposure when needed (uses hardware HDR if supported).'
    );
  });

  it('resolves the Traditional Chinese label for single mode', () => {
    expect(translate('zh-Hant', captureModeToastCopy('single', false).label)).toBe('照片');
  });

  it('keeps the type as CaptureModeCopyMode (single | burst | auto)', () => {
    const modes: CaptureModeCopyMode[] = ['single', 'burst', 'auto'];
    expect(modes).toHaveLength(3);
  });
});
```

Run it — it FAILS because `CAPTURE_MODE_HELP_TEXT_KEY` does not exist yet (the import errors, failing the whole file). Once that exists, the help-text and zh-Hant assertions still exercise real keys.

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/capture-mode-copy.test.ts
```

Expected: failure, e.g. `error: Export named 'CAPTURE_MODE_HELP_TEXT_KEY' not found in module …/capture-mode-copy.ts`.

> Note on the label assertions: with the CURRENT module, `single.label === 'Photo'` (a literal), and `translate('en','Photo')` falls through to the unknown-key passthrough and ALSO returns `'Photo'`, so those specific lines would pass either way. The genuine red is the missing `CAPTURE_MODE_HELP_TEXT_KEY` export (whole-file import error) plus the help-text/zh-Hant assertions, which only resolve once the key exists.

- [ ] **Step 2 (GREEN): rewrite `capture-mode-copy.ts`.** Replace the entire file with:

```ts
import type { TranslationKey } from '../../i18n';

// User-facing CaptureMode union. Mirrors the persisted CaptureMode in
// camera-settings.ts — the retired 'hdr' value migrates to 'auto' on load, so
// nothing here ever needs to render 'hdr' copy.
export type CaptureModeCopyMode = 'single' | 'burst' | 'auto';

export interface CaptureModeCopy {
  /** Translation key — resolve with `t()` at the call site. */
  label: TranslationKey;
  /** Translation key — resolve with `t()` at the call site. */
  hint: TranslationKey;
  /** Ionicons glyph name — not user-facing text. */
  icon: string;
}

/** Translation key for the capture-mode help paragraph. Resolve with `t()`. */
export const CAPTURE_MODE_HELP_TEXT_KEY: TranslationKey = 'pilgrimageUi.captureModeHelp';

const MODE_COPY: Record<CaptureModeCopyMode, CaptureModeCopy> = {
  single: {
    label: 'pilgrimageUi.captureModeSingleLabel',
    hint: 'pilgrimageUi.captureModeSingleHint',
    icon: 'camera-outline',
  },
  burst: {
    label: 'pilgrimageUi.captureModeBurstLabel',
    hint: 'pilgrimageUi.captureModeBurstHint',
    icon: 'albums-outline',
  },
  auto: {
    label: 'pilgrimageUi.captureModeAutoLabel',
    hint: 'pilgrimageUi.captureModeAutoHint',
    icon: 'sparkles-outline',
  },
};

export function captureModeToastCopy(
  mode: CaptureModeCopyMode,
  nativeHdrActive: boolean
): CaptureModeCopy {
  if (mode === 'auto' && nativeHdrActive) {
    return {
      ...MODE_COPY.auto,
      hint: 'pilgrimageUi.captureModeAutoHintHdr',
    };
  }
  return MODE_COPY[mode];
}
```

> The old `CAPTURE_MODE_HELP_TEXT` constant (a plain English string, lines 12–13) is **removed** — its consumers (`CameraSettingsSheet.tsx`, Task 5.5; and `camera-feature-parity.test.tsx`, Step 2b below) are rewired to use `CAPTURE_MODE_HELP_TEXT_KEY`. The icon glyph names (`camera-outline` / `albums-outline` / `sparkles-outline`) are preserved verbatim.

- [ ] **Step 2b (GREEN, same commit): update the existing `camera-feature-parity.test.tsx`.** It imports the now-removed `CAPTURE_MODE_HELP_TEXT` and asserts English substrings directly against `captureModeToastCopy(...).hint` (which is now a key). Resolve through the engine instead. Change the import (lines 4–6):

```ts
import {
  CAPTURE_MODE_HELP_TEXT,
  captureModeToastCopy,
} from '../../../libs/services/pilgrimage/capture-mode-copy';
```
to:
```ts
import {
  CAPTURE_MODE_HELP_TEXT_KEY,
  captureModeToastCopy,
} from '../../../libs/services/pilgrimage/capture-mode-copy';
import { translate } from '../../../libs/i18n/engine';
```

Change the test body (lines 93–106):

```ts
  it('keeps capture mode copy aligned with the real capture implementations', () => {
    expect(CAPTURE_MODE_HELP_TEXT).toContain('best-aligned');
    expect(CAPTURE_MODE_HELP_TEXT).toContain('hardware HDR');
    expect(CAPTURE_MODE_HELP_TEXT).not.toContain('sharpest');
    expect(CAPTURE_MODE_HELP_TEXT).not.toContain('blends 3 exposures');

    expect(captureModeToastCopy('burst', false).hint).toContain('best-aligned');
    // 'auto' is the replacement for the retired 'hdr' mode. When the scene
    // analyzer agrees AND the device has native photo-HDR, the toast advertises
    // hardware HDR. Otherwise it describes the bracket fallback honestly.
    expect(captureModeToastCopy('auto', true).hint).toContain('hardware HDR');
    expect(captureModeToastCopy('auto', false).hint).toContain('bracket');
    expect(captureModeToastCopy('auto', true).hint).not.toContain('Android');
  });
```
to:
```ts
  it('keeps capture mode copy aligned with the real capture implementations', () => {
    const help = translate('en', CAPTURE_MODE_HELP_TEXT_KEY);
    expect(help).toContain('best-aligned');
    expect(help).toContain('hardware HDR');
    expect(help).not.toContain('sharpest');
    expect(help).not.toContain('blends 3 exposures');

    expect(translate('en', captureModeToastCopy('burst', false).hint)).toContain('best-aligned');
    // 'auto' is the replacement for the retired 'hdr' mode. When the scene
    // analyzer agrees AND the device has native photo-HDR, the toast advertises
    // hardware HDR. Otherwise it describes the bracket fallback honestly.
    expect(translate('en', captureModeToastCopy('auto', true).hint)).toContain('hardware HDR');
    expect(translate('en', captureModeToastCopy('auto', false).hint)).toContain('bracket');
    expect(translate('en', captureModeToastCopy('auto', true).hint)).not.toContain('Android');
  });
```

> Verified the en values from Task 5.1 satisfy every assertion: help text contains `best-aligned` + `hardware HDR`, not `sharpest`/`blends 3 exposures`; burst hint = "Captures 6 frames, keeps the best-aligned" (contains `best-aligned`); auto+HDR hint = "High-contrast scene — using hardware HDR on this device" (contains `hardware HDR`, not `Android`); auto non-HDR hint = "Detects high-contrast scenes and brackets exposure when needed" (contains `bracket`). The unrelated assertions in this file (lines 33–91, 108–124) and the `orientationSource="device"` check (lines 56–59, owned by a different phase) are untouched.

- [ ] **Step 3 (TEST — must PASS): re-run both files.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/capture-mode-copy.test.ts __tests__/unit/pilgrimage/camera-feature-parity.test.tsx
```

Expected:

```
capture mode copy > returns translation keys that resolve to the English label/hint [PASS]
capture mode copy > swaps in the hardware-HDR hint key when native HDR is active for auto mode [PASS]
capture mode copy > exposes the help-text key resolving to the full help copy [PASS]
capture mode copy > resolves the Traditional Chinese label for single mode [PASS]
capture mode copy > keeps the type as CaptureModeCopyMode (single | burst | auto) [PASS]
camera feature parity > keeps capture mode copy aligned with the real capture implementations [PASS]
 ... (other camera-feature-parity tests still pass)
 0 fail
```

- [ ] **Step 4: Commit.**

```bash
git add libs/services/pilgrimage/capture-mode-copy.ts __tests__/unit/pilgrimage/capture-mode-copy.test.ts __tests__/unit/pilgrimage/camera-feature-parity.test.tsx
git commit -m "refactor(camera): capture-mode-copy returns TranslationKey label/hint/help"
```

---

### Task 5.3: Convert `edge-overlay.ts` LABEL to TranslationKeys (TDD)

**Files:**
- Modify: `libs/services/pilgrimage/edge-overlay.ts` (lines 17–21 `LABEL`, lines 31–33 `edgeIntensityLabel`; add a `TranslationKey` import above line 1)
- Modify: `__tests__/unit/pilgrimage/edge-overlay.test.ts` (import lines 1–7; label assertions lines 15, 28–29; fallback test lines 39–41)
- Test: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/edge-overlay.test.ts`

`edgeIntensityLabel(value)` currently returns English literals (`Edge+` / `Edge` / `Edge Max`). Convert it to return a `TranslationKey`; callers (`OverlayControls.tsx`, `OverlayControlsBar.tsx`) resolve with `t()` in Task 5.5. The config helpers (`getEdgeOverlayConfig`, `EDGE_INTENSITIES`) are unchanged.

- [ ] **Step 1 (TEST — write FIRST, must FAIL): update the label assertions in `edge-overlay.test.ts`.** Change the import block (lines 1–7):

```ts
import { describe, expect, it } from 'bun:test';
import {
  EDGE_INTENSITIES,
  edgeIntensityLabel,
  getEdgeOverlayConfig,
  type EdgeIntensity,
} from '../../../libs/services/pilgrimage/edge-overlay';
```
to:
```ts
import { describe, expect, it } from 'bun:test';
import {
  EDGE_INTENSITIES,
  edgeIntensityLabel,
  getEdgeOverlayConfig,
  type EdgeIntensity,
} from '../../../libs/services/pilgrimage/edge-overlay';
import { translate } from '../../../libs/i18n/engine';
```

Change line 15 (`expect(edgeIntensityLabel('low')).toBe('Edge+');`) to two assertions:
```ts
    expect(edgeIntensityLabel('low')).toBe('pilgrimageUi.edgeIntensityLow');
    expect(translate('en', edgeIntensityLabel('low'))).toBe('Edge+');
```

Change lines 28–29:
```ts
    expect(edgeIntensityLabel('mid')).toBe('Edge');
    expect(edgeIntensityLabel('high')).toBe('Edge Max');
```
to:
```ts
    expect(translate('en', edgeIntensityLabel('mid'))).toBe('Edge');
    expect(translate('en', edgeIntensityLabel('high'))).toBe('Edge Max');
```

Change the fallback test (lines 39–41):
```ts
  it('falls back to low for unknown persisted values', () => {
    expect(getEdgeOverlayConfig('other' as EdgeIntensity)).toEqual(getEdgeOverlayConfig('low'));
  });
```
to:
```ts
  it('falls back to low for unknown persisted values', () => {
    expect(getEdgeOverlayConfig('other' as EdgeIntensity)).toEqual(getEdgeOverlayConfig('low'));
    expect(edgeIntensityLabel('other' as EdgeIntensity)).toBe(edgeIntensityLabel('low'));
  });
```

Run it — FAILS at the new `toBe('pilgrimageUi.edgeIntensityLow')` assertion because the current label returns the literal `'Edge+'`:

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/edge-overlay.test.ts
```

Expected: FAIL — `Expected: "pilgrimageUi.edgeIntensityLow" / Received: "Edge+"`.

- [ ] **Step 2 (GREEN): rewrite the `LABEL` map and `edgeIntensityLabel` in `edge-overlay.ts`.** Add the type import at the top — change line 1 (`export type EdgeIntensity = 'low' | 'mid' | 'high';`) to:

```ts
import type { TranslationKey } from '../../i18n';

export type EdgeIntensity = 'low' | 'mid' | 'high';
```

Change the `LABEL` map (lines 17–21):
```ts
const LABEL: Record<EdgeIntensity, string> = {
  low: 'Edge+',
  mid: 'Edge',
  high: 'Edge Max',
};
```
to:
```ts
const LABEL: Record<EdgeIntensity, TranslationKey> = {
  low: 'pilgrimageUi.edgeIntensityLow',
  mid: 'pilgrimageUi.edgeIntensityMid',
  high: 'pilgrimageUi.edgeIntensityHigh',
};
```

Change `edgeIntensityLabel` (lines 31–33):
```ts
export function edgeIntensityLabel(value: EdgeIntensity): string {
  return LABEL[isEdgeIntensity(value) ? value : 'low'];
}
```
to:
```ts
export function edgeIntensityLabel(value: EdgeIntensity): TranslationKey {
  return LABEL[isEdgeIntensity(value) ? value : 'low'];
}
```

- [ ] **Step 3 (TEST — must PASS): re-run.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/edge-overlay.test.ts
```

Expected:

```
edge overlay intensity > exposes low, mid, and high in UI order [PASS]
edge overlay intensity > maps low to Edge+ with a faint reference backdrop and sparse lines [PASS]
edge overlay intensity > maps mid and high to progressively denser but still pale edge-only overlays [PASS]
edge overlay intensity > falls back to low for unknown persisted values [PASS]
 4 pass
 0 fail
```

- [ ] **Step 4: Commit.**

```bash
git add libs/services/pilgrimage/edge-overlay.ts __tests__/unit/pilgrimage/edge-overlay.test.ts
git commit -m "refactor(camera): edgeIntensityLabel returns TranslationKey"
```

---

### Task 5.4: Convert `subject-overlay.ts` LABEL to TranslationKeys (TDD)

**Files:**
- Modify: `libs/services/pilgrimage/subject-overlay.ts` (lines 18–22 `LABEL`, lines 32–34 `subjectFocusLabel`; add a `TranslationKey` import above line 1)
- Modify: `__tests__/unit/pilgrimage/subject-overlay.test.ts` (import lines 1–8; label test lines 15–19; fallback assertion line 39)
- Test: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/subject-overlay.test.ts`

Same conversion as Task 5.3 for `subjectFocusLabel` (returns `Tight`/`Normal`/`Wide` → translation keys).

- [ ] **Step 1 (TEST — write FIRST, must FAIL): update `subject-overlay.test.ts`.** Add the engine import after the existing import block (which spans lines 1–8):

```ts
import { translate } from '../../../libs/i18n/engine';
```

Change the label test (lines 15–19):
```ts
  it('labels each focus level for compact camera controls', () => {
    expect(subjectFocusLabel('tight')).toBe('Tight');
    expect(subjectFocusLabel('normal')).toBe('Normal');
    expect(subjectFocusLabel('wide')).toBe('Wide');
  });
```
to:
```ts
  it('labels each focus level for compact camera controls', () => {
    expect(subjectFocusLabel('tight')).toBe('pilgrimageUi.subjectFocusTight');
    expect(subjectFocusLabel('normal')).toBe('pilgrimageUi.subjectFocusNormal');
    expect(subjectFocusLabel('wide')).toBe('pilgrimageUi.subjectFocusWide');
    expect(translate('en', subjectFocusLabel('tight'))).toBe('Tight');
    expect(translate('en', subjectFocusLabel('normal'))).toBe('Normal');
    expect(translate('en', subjectFocusLabel('wide'))).toBe('Wide');
  });
```

Change the fallback assertion (line 39):
```ts
    expect(subjectFocusLabel('other' as SubjectFocus)).toBe('Normal');
```
to:
```ts
    expect(subjectFocusLabel('other' as SubjectFocus)).toBe('pilgrimageUi.subjectFocusNormal');
```

Run it — FAILS (`Expected "pilgrimageUi.subjectFocusTight" / Received "Tight"`):

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/subject-overlay.test.ts
```

- [ ] **Step 2 (GREEN): rewrite `LABEL` and `subjectFocusLabel` in `subject-overlay.ts`.** Add the import — change line 1 (`export type SubjectFocus = 'tight' | 'normal' | 'wide';`) to:

```ts
import type { TranslationKey } from '../../i18n';

export type SubjectFocus = 'tight' | 'normal' | 'wide';
```

Change the `LABEL` map (lines 18–22):
```ts
const LABEL: Record<SubjectFocus, string> = {
  tight: 'Tight',
  normal: 'Normal',
  wide: 'Wide',
};
```
to:
```ts
const LABEL: Record<SubjectFocus, TranslationKey> = {
  tight: 'pilgrimageUi.subjectFocusTight',
  normal: 'pilgrimageUi.subjectFocusNormal',
  wide: 'pilgrimageUi.subjectFocusWide',
};
```

Change `subjectFocusLabel` (lines 32–34):
```ts
export function subjectFocusLabel(value: SubjectFocus): string {
  return LABEL[isSubjectFocus(value) ? value : 'normal'];
}
```
to:
```ts
export function subjectFocusLabel(value: SubjectFocus): TranslationKey {
  return LABEL[isSubjectFocus(value) ? value : 'normal'];
}
```

- [ ] **Step 3 (TEST — must PASS): re-run.**

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/subject-overlay.test.ts
```

Expected:

```
subject overlay focus > exposes tight, normal, and wide in UI order [PASS]
subject overlay focus > labels each focus level for compact camera controls [PASS]
subject overlay focus > widens the subject matte progressively [PASS]
subject overlay focus > falls back to normal for unknown persisted values [PASS]
 4 pass
 0 fail
```

- [ ] **Step 4: Commit.**

```bash
git add libs/services/pilgrimage/subject-overlay.ts __tests__/unit/pilgrimage/subject-overlay.test.ts
git commit -m "refactor(camera): subjectFocusLabel returns TranslationKey"
```

---

### Task 5.5: Resolve the converted copy keys with `t()` at every call site

**Files:**
- Modify: `components/pilgrimage/camera/CaptureModeToast.tsx` (import lines 11–13; add `const t = useT();` at line 48; render lines 80–90)
- Modify: `components/pilgrimage/camera/CameraSettingsSheet.tsx` (import line 19; usage lines 130–132)
- Modify: `components/pilgrimage/camera/chips/OverlayControls.tsx` (edge a11y+text lines 146/158; subject a11y+text lines 177/189)
- Modify: `components/pilgrimage/camera/OverlayControlsBar.tsx` (line 132)
- Test: `bunx tsc --noEmit` (RN/JSX wiring — no pure logic to unit-test per the REPO TDD RULE; baseline verified exit 0)

After Tasks 5.2–5.4 the copy modules return `TranslationKey`s; every place that rendered the returned string must now pass it through `t()`. Otherwise the raw key string leaks into the UI (and `tsc` flags string-vs-`TranslationKey` mismatches in places that typed the value as `string`).

- [ ] **Step 1: `CaptureModeToast.tsx` — import `useT` and resolve label/hint.** The component does not import `useT` today. Change the import block (lines 11–13):

```tsx
import { readableTextOn, ThemedText } from '../../themed';
import type { CaptureMode } from '../../../hooks/useCameraSettings';
import { captureModeToastCopy } from '../../../libs/services/pilgrimage/capture-mode-copy';
```
to:
```tsx
import { readableTextOn, ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import type { CaptureMode } from '../../../hooks/useCameraSettings';
import { captureModeToastCopy } from '../../../libs/services/pilgrimage/capture-mode-copy';
```

Add `const t = useT();` at the top of the component body (before the early `if (!toast) return null;` at line 68 so the hook is unconditional). Change line 48:
```tsx
  const opacity = useSharedValue(0);
```
to:
```tsx
  const t = useT();
  const opacity = useSharedValue(0);
```

Resolve label/hint in the render. Change lines 80–90:
```tsx
      <View style={styles.text}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={[styles.label, { color: themeColor }]}>
          {copy.label.toUpperCase()}
        </ThemedText>
        <ThemedText variant="caption" weight="600" style={styles.hint}>
          {copy.hint}
        </ThemedText>
      </View>
```
to:
```tsx
      <View style={styles.text}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={[styles.label, { color: themeColor }]}>
          {t(copy.label).toUpperCase()}
        </ThemedText>
        <ThemedText variant="caption" weight="600" style={styles.hint}>
          {t(copy.hint)}
        </ThemedText>
      </View>
```

> `copy.icon` (line 75) is unchanged — it is still an Ionicons glyph name.

- [ ] **Step 2: `CameraSettingsSheet.tsx` — resolve the help text key.** It already has `const t = useT();` (line 70). Change the import (line 19):

```tsx
import { CAPTURE_MODE_HELP_TEXT } from '../../../libs/services/pilgrimage/capture-mode-copy';
```
to:
```tsx
import { CAPTURE_MODE_HELP_TEXT_KEY } from '../../../libs/services/pilgrimage/capture-mode-copy';
```

Change the usage (lines 130–132):
```tsx
              <ThemedText variant="caption" tone="secondary">
                {CAPTURE_MODE_HELP_TEXT}
              </ThemedText>
```
to:
```tsx
              <ThemedText variant="caption" tone="secondary">
                {t(CAPTURE_MODE_HELP_TEXT_KEY)}
              </ThemedText>
```

> The local `CAPTURE_MODE_LABEL` const (lines 22–26) and the still-English `4K keeps the most detail…` caption (lines 152–154) are separate concerns — leave both untouched for this phase.

- [ ] **Step 3: `chips/OverlayControls.tsx` — resolve `edgeIntensityLabel` / `subjectFocusLabel`.** `t` is already in scope (line 75). Both helpers now return keys, so wrap each in `t()`. Change the edge a11y + text (lines 146 and 158):

```tsx
                accessibilityLabel={`Edge intensity ${edgeIntensityLabel(intensity)}`}
```
to:
```tsx
                accessibilityLabel={t('pilgrimageUi.edgeIntensityA11y', {
                  intensity: t(edgeIntensityLabel(intensity)),
                })}
```
and:
```tsx
                  {edgeIntensityLabel(intensity)}
```
to:
```tsx
                  {t(edgeIntensityLabel(intensity))}
```

Change the subject a11y + text (lines 177 and 189):
```tsx
                  accessibilityLabel={`Subject focus ${subjectFocusLabel(focus)}`}
```
to:
```tsx
                  accessibilityLabel={t('pilgrimageUi.subjectFocusA11y', {
                    focus: t(subjectFocusLabel(focus)),
                  })}
```
and:
```tsx
                    {subjectFocusLabel(focus)}
```
to:
```tsx
                    {t(subjectFocusLabel(focus))}
```

> The `overlayModeA11y` line (line 116, `accessibilityLabel={`Overlay mode ${label}`}`) and the Reposition action (lines 238/254) are localized in Task 5.8, not here.

- [ ] **Step 4: `OverlayControlsBar.tsx` — resolve `edgeIntensityLabel` inside the SubSegment options.** `t` is in scope (line 76). The `SubSegment` `options` prop is typed `{ id: string; label: string }[]` and renders `o.label` directly, so resolve the key when building the array. Change line 132:

```tsx
            options={EDGE_INTENSITIES.map((i) => ({ id: i, label: edgeIntensityLabel(i) }))}
```
to:
```tsx
            options={EDGE_INTENSITIES.map((i) => ({ id: i, label: t(edgeIntensityLabel(i)) }))}
```

> `SubSegment`'s `label: string` type is satisfied because `t()` returns a `string`. No change needed inside `SubSegment` itself.

- [ ] **Step 5 (TEST — must PASS): typecheck.** This proves every converted-key consumer now resolves through `t()` and no `TranslationKey`-vs-`string` mismatch remains.

```bash
bunx tsc --noEmit
```

Expected output: no output (exit 0). If you see `Type 'TranslationKey' is not assignable to type 'string'` or `Property 'toUpperCase' does not exist on type 'TranslationKey'`, a call site still renders the raw key — re-check Steps 1–4.

- [ ] **Step 6: Commit.**

```bash
git add components/pilgrimage/camera/CaptureModeToast.tsx components/pilgrimage/camera/CameraSettingsSheet.tsx components/pilgrimage/camera/chips/OverlayControls.tsx components/pilgrimage/camera/OverlayControlsBar.tsx
git commit -m "i18n(camera): resolve capture-mode/edge/subject keys with t() at call sites"
```

---

### Task 5.6: Localize visible labels in AlignmentHUD, AutoCaptureToast, FocusExposureBar

**Files:**
- Modify: `components/pilgrimage/camera/AlignmentHUD.tsx` (aligned badge lines 116–121; perfect banner lines 165–167)
- Modify: `components/pilgrimage/camera/AutoCaptureToast.tsx` (import line 11; add `const t = useT();` at line 38; label lines 65–67)
- Modify: `components/pilgrimage/camera/FocusExposureBar.tsx` (lines 43–45)
- Test: `bunx tsc --noEmit` (RN/JSX wiring — no pure logic to unit-test)

These three components hardcode user-visible English/Chinese literals. `AlignmentHUD` already has `const t = useT();` (line 69); `FocusExposureBar` already has `const t = useT();` (line 28); `AutoCaptureToast` must add it.

- [ ] **Step 1: `AlignmentHUD.tsx` — localize the aligned badge.** The off-state half (`${percentText} · ${distance} · ${heading}`) is composed from live numeric formatters and stays as-is. Only the `Aligned · {percent}` half is a fixed label. Change lines 116–121:

```tsx
              {aligned
                ? `Aligned · ${percentText}`
                : `${percentText} · ${formatDistance(score.distanceMeters)} · ${formatHeadingDelta(
                    score.headingDeltaDeg
                  )}`}
```
to:
```tsx
              {aligned
                ? t('pilgrimageUi.aligned', { percent: percentText })
                : `${percentText} · ${formatDistance(score.distanceMeters)} · ${formatHeadingDelta(
                    score.headingDeltaDeg
                  )}`}
```

- [ ] **Step 2: `AlignmentHUD.tsx` — localize the perfect banner.** Change lines 165–167:

```tsx
          <ThemedText variant="bodySmall" weight="700" style={{ color: '#fff' }}>
            Position locked — shoot now
          </ThemedText>
```
to:
```tsx
          <ThemedText variant="bodySmall" weight="700" style={{ color: '#fff' }}>
            {t('pilgrimageUi.positionLocked')}
          </ThemedText>
```

- [ ] **Step 3: `AutoCaptureToast.tsx` — import `useT` and localize the count line.** Change the import (line 11):

```tsx
import { readableTextOn, ThemedText } from '../../themed';
```
to:
```tsx
import { readableTextOn, ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
```

Add `const t = useT();` at the top of the component body (before the early `if (!toast) return null;` at line 58). Change line 38:
```tsx
  const opacity = useSharedValue(0);
```
to:
```tsx
  const t = useT();
  const opacity = useSharedValue(0);
```

Change the hardcoded Chinese label (lines 65–67):
```tsx
      <ThemedText variant="caption" weight="700" style={styles.label}>
        {`已自動預拍 · ${toast.sessionCount}`}
      </ThemedText>
```
to:
```tsx
      <ThemedText variant="caption" weight="700" style={styles.label}>
        {t('pilgrimageUi.autoCaptured', { count: toast.sessionCount })}
      </ThemedText>
```

> `toast.sessionCount` is a `number`; `TranslationValues` accepts `string | number`, so `{ count: toast.sessionCount }` is type-correct.

- [ ] **Step 4: `FocusExposureBar.tsx` — localize the AF LOCK pill.** `EV` numeric formatting (`formatEV`) stays. Only the static `AF LOCK` label changes. Change lines 43–45:

```tsx
          <ThemedText variant="captionSmall" weight="700" style={styles.lockText}>
            AF LOCK
          </ThemedText>
```
to:
```tsx
          <ThemedText variant="captionSmall" weight="700" style={styles.lockText}>
            {t('pilgrimageUi.afLock')}
          </ThemedText>
```

- [ ] **Step 5 (TEST — must PASS): typecheck.**

```bash
bunx tsc --noEmit
```

Expected: no output (exit 0). Note: `t()` accepts `TranslationKey | string`, so a typo (e.g. `pilgrimageUi.alignedd`) will **not** fail tsc — it silently falls back to the key at runtime. Guard instead by confirming the exact key strings against the Task 5.1 inventory.

- [ ] **Step 6: Commit.**

```bash
git add components/pilgrimage/camera/AlignmentHUD.tsx components/pilgrimage/camera/AutoCaptureToast.tsx components/pilgrimage/camera/FocusExposureBar.tsx
git commit -m "i18n(camera): localize AlignmentHUD/AutoCaptureToast/FocusExposureBar labels"
```

---

### Task 5.7: Localize CameraErrorBoundary and stop leaking Error.message

**Files:**
- Modify: `components/pilgrimage/camera/CameraErrorBoundary.tsx` (whole file, lines 1–83)
- Test: `bunx tsc --noEmit` (RN/JSX + class-component wiring — no pure logic to unit-test)

`CameraErrorBoundary` is a class component, so hooks can't run in `render()`/`getDerivedStateFromError`. The localized strings are resolved inside the **`CameraErrorFallback` function child** (which already calls `useTheme` and can call `useT`). The class **stops passing `error.message` into the UI**: it logs the error in `componentDidCatch` (already does, line 48) and renders a localized generic message instead. The `error` is still kept in state for the log, but never shown.

- [ ] **Step 1: Rewrite `CameraErrorFallback` to resolve copy via `useT`.** Change the function (lines 22–35):

```tsx
function CameraErrorFallback({ message, onRetry }: CameraErrorFallbackProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.content}>
        <ThemedText variant="titleLarge">相機需要重新啟動</ThemedText>
        <ThemedText variant="bodyMedium" tone="secondary" style={styles.message}>
          {message}
        </ThemedText>
        <ThemedButton size="lg" label="重新啟動相機" onPress={onRetry} fullWidth />
      </View>
    </View>
  );
}
```
to:
```tsx
function CameraErrorFallback({ onRetry }: CameraErrorFallbackProps) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.content}>
        <ThemedText variant="titleLarge">{t('pilgrimageUi.cameraNeedsRestart')}</ThemedText>
        <ThemedText variant="bodyMedium" tone="secondary" style={styles.message}>
          {t('pilgrimageUi.cameraTemporarilyUnavailable')}
        </ThemedText>
        <ThemedButton
          size="lg"
          label={t('pilgrimageUi.restartCamera')}
          onPress={onRetry}
          fullWidth
        />
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Drop the `message` prop from `CameraErrorFallbackProps`.** Change (lines 17–20):

```tsx
interface CameraErrorFallbackProps {
  message: string;
  onRetry: () => void;
}
```
to:
```tsx
interface CameraErrorFallbackProps {
  onRetry: () => void;
}
```

- [ ] **Step 3: Add the `useT` import.** Change (lines 1–5):

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedButton, ThemedText } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing } from '../../../constants/DesignSystem';
```
to:
```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedButton, ThemedText } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { Spacing } from '../../../constants/DesignSystem';
```

- [ ] **Step 4: Stop deriving + passing `error.message` in `render()`.** The error stays in state (so `componentDidCatch`'s `console.warn` keeps the diagnostic), but is never rendered. Change (lines 56–62):

```tsx
  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message ?? '相機暫時無法使用';
      return <CameraErrorFallback message={message} onRetry={this.handleReset} />;
    }
    return this.props.children;
  }
```
to:
```tsx
  render() {
    if (this.state.hasError) {
      // The raw Error.message is developer-facing — it is logged in
      // componentDidCatch, never shown. The fallback renders a localized,
      // generic message instead (Rule 11 + no leaked internals).
      return <CameraErrorFallback onRetry={this.handleReset} />;
    }
    return this.props.children;
  }
```

> `componentDidCatch` (lines 47–49) already does `console.warn('[CameraErrorBoundary]', err, info);` — the error detail is preserved for logs. No change there. The `error` field stays in `CameraErrorBoundaryState` (it is still set by `getDerivedStateFromError`).

- [ ] **Step 5 (TEST — must PASS): typecheck.** Confirms the `message`-prop removal is consistent (the call site no longer passes it, the interface no longer requires it).

```bash
bunx tsc --noEmit
```

Expected: no output (exit 0). If you see `Property 'message' is missing` or `Object literal may only specify known properties, and 'message' does not exist`, Steps 1, 2, and 4 are out of sync — all three must land together.

- [ ] **Step 6: Commit.**

```bash
git add components/pilgrimage/camera/CameraErrorBoundary.tsx
git commit -m "i18n(camera): localize CameraErrorBoundary, stop leaking Error.message"
```

---

### Task 5.8: Localize the remaining hardcoded a11y / chip labels in OverlayControls & OverlayControlsBar

**Files:**
- Modify: `components/pilgrimage/camera/chips/OverlayControls.tsx` (line 116 mode-row a11y; reposition action a11y+text lines 238/254)
- Modify: `components/pilgrimage/camera/OverlayControlsBar.tsx` (lines 108, 174, 224)
- Test: `bunx tsc --noEmit` (RN/JSX wiring — no pure logic to unit-test)

These are the a11y-label / visible-text stragglers spec §3.4 lists for the chips. `t` is already in scope in both files. The `MODES` arrays (already `TranslationKey`-typed) are unchanged.

> Note: `OverlayControlsBar.tsx` line 174 (`'Pick character'`) is also asserted by the existing `camera-overlay-controls.test.tsx` (line 63, against a `useT` mock backed by `en.json`). That test stays green because Task 5.1 Step 10 adds the en value `pickCharacter: "Pick character"` before this task runs — no test edit needed, but the dependency is real.

- [ ] **Step 1: `chips/OverlayControls.tsx` — mode-pill a11y label.** Change line 116:

```tsx
              accessibilityLabel={`Overlay mode ${label}`}
```
to:
```tsx
              accessibilityLabel={t('pilgrimageUi.overlayModeA11y', { mode: label })}
```

> `label` here is already `t(m.label)` (line 110), i.e. the resolved mode name — so the interpolation receives a localized value.

- [ ] **Step 2: `chips/OverlayControls.tsx` — reposition action button (a11y + visible text).** The action button spans lines 235–256; the two literals are at line 238 (a11y) and line 254 (text). Change line 238:

```tsx
          accessibilityLabel={editMode ? 'Lock overlay position' : 'Reposition overlay'}
```
to:
```tsx
          accessibilityLabel={
            editMode
              ? t('pilgrimageUi.lockOverlayPosition')
              : t('pilgrimageUi.repositionOverlay')
          }
```

Change line 254:
```tsx
            {editMode ? 'Repositioning' : 'Reposition'}
```
to:
```tsx
            {editMode ? t('pilgrimageUi.repositioning') : t('pilgrimageUi.reposition')}
```

- [ ] **Step 3: `OverlayControlsBar.tsx` — filter-strip "off" pill a11y.** Change line 108:

```tsx
              accessibilityLabel={m.id === 'off' ? 'Hide overlay' : `Overlay mode ${label}`}
```
to:
```tsx
              accessibilityLabel={
                m.id === 'off'
                  ? t('pilgrimageUi.hideOverlay')
                  : t('pilgrimageUi.overlayModeA11y', { mode: label })
              }
```

> `label` here is `t(m.label)` (line 102), already localized.

- [ ] **Step 4: `OverlayControlsBar.tsx` — character-pill a11y.** Change line 174:

```tsx
            accessibilityLabel={characterSelected ? 'Swap character' : 'Pick character'}
```
to:
```tsx
            accessibilityLabel={
              characterSelected
                ? t('pilgrimageUi.swapCharacter')
                : t('pilgrimageUi.pickCharacter')
            }
```

- [ ] **Step 5: `OverlayControlsBar.tsx` — reposition IconBtn a11y.** Change line 224:

```tsx
          accessibilityLabel={editMode ? 'Lock overlay position' : 'Reposition overlay'}
```
to:
```tsx
          accessibilityLabel={
            editMode
              ? t('pilgrimageUi.lockOverlayPosition')
              : t('pilgrimageUi.repositionOverlay')
          }
```

- [ ] **Step 6 (TEST — must PASS): typecheck + the full unit suite (parity + converted modules + the two component tests together).**

```bash
bunx tsc --noEmit && bun run test:unit
```

Expected: `tsc` emits nothing (exit 0); the unit suite ends with `0 fail` — including `i18n.test.ts` parity, `capture-mode-copy.test.ts`, `edge-overlay.test.ts`, `subject-overlay.test.ts`, `camera-feature-parity.test.tsx`, and `camera-overlay-controls.test.tsx` all green.

- [ ] **Step 7: Commit.**

```bash
git add components/pilgrimage/camera/chips/OverlayControls.tsx components/pilgrimage/camera/OverlayControlsBar.tsx
git commit -m "i18n(camera): localize overlay-chip a11y labels and reposition text"
```

---

### Task 5.9: Phase verification — manual on-device check

**Files:**
- Test: manual / on-device (no pure logic; per the REPO TDD RULE the RN-surface gate is a precise manual check)

- [ ] **Step 1: Confirm the whole unit suite + typecheck are green.**

```bash
bunx tsc --noEmit && bun run test:unit
```

Expected: exit 0, `0 fail`.

- [ ] **Step 2: On device/simulator, set App language to 繁體中文 (Settings → Language → App language → 繁體中文) and open the pilgrimage camera (`/pilgrimage/compare/<spotId>`).** Verify, with no raw English/raw key strings visible:
  - Cycle capture mode (top bar) → `CaptureModeToast` shows the localized label (照片 / 連拍 / 自動) + hint; on an HDR-capable device in Auto with high contrast, the HDR hint reads 高對比場景 — 此裝置使用硬體 HDR.
  - Lock focus (tap-and-hold) → `FocusExposureBar` pill reads **AF 鎖定** (not `AF LOCK`); the EV value still shows numerically.
  - Frame the scene to ≥85% → alignment badge reads **已對齊 · NN%**; at the perfect-banner threshold it reads **位置已鎖定 — 立即拍攝**.
  - Open overlay controls → mode pills (動畫 / 素描 / 邊緣 / 角色), edge sub-row (邊緣+ / 邊緣 / 邊緣強化), subject sub-row (緊湊 / 標準 / 寬廣), and the Reposition / Repositioning toggle text (重新定位 / 定位中) are all localized.
  - Auto-capture fires → `AutoCaptureToast` reads **已自動預拍 · N**.

- [ ] **Step 3: Force the camera error boundary (e.g. revoke camera permission mid-session or trigger a Camera `onError`).** Verify the fallback shows **相機需要重新啟動** + a generic **相機暫時無法使用,點一下重新啟動。** message + a **重新啟動相機** button — and confirm the raw `Error.message` is **not** rendered anywhere on screen (it should appear only in the Metro/console log as `[CameraErrorBoundary] …`).

- [ ] **Step 4: Switch App language to English and re-open the camera; confirm every string above flips to its English value** (Photo/Burst/Auto, AF LOCK, `Aligned · NN%`, `Position locked — shoot now`, Edge+/Edge/Edge Max, Tight/Normal/Wide, Reposition/Repositioning, `Auto-captured · N`, Camera needs to restart). This proves the App-language pick now propagates through every former straggler.

---

## Closeout — on-device acceptance (gate · no code)

> Re-run the Phase 0 matrix after Phases 1–5 land. This is the real orientation check; the unit tests cover only the pure helpers.

- [ ] **Step 1: Full green gate.** `bun run test:unit` (all green, including `i18n.test.ts` parity) and `bunx tsc --noEmit` (clean).

- [ ] **Step 2: Capture acceptance (iOS + Android).**
  - AUTO + phone upright → saved file is **portrait** (`height > width`) and preview/share show the **whole frame letterboxed**, not cropped.
  - AUTO + phone rotated → capture follows the phone while the **HUD stays portrait-fixed** (controls don't reflow).
  - LAND → capture is **landscape** regardless of pose.

- [ ] **Step 3: Share acceptance.** Share a portrait shot at 1:1 / 9:16 / 16:9 — the shot is letterboxed (not center-cropped); 9:16 is the default for a portrait shot.

- [ ] **Step 4: Regression sweep.** Backgrounding pauses the camera; an interruption (incoming call) recovers; overlay settings persist across visits; the HUD / toasts / error screen render in the active app language.

- [ ] **Step 5: Finalize.** Use `superpowers:finishing-a-development-branch` for the merge / PR decision.

---

## Notes — minor reconcile items (cosmetic, non-blocking)

The cross-phase reconcile pass confirmed symbol consistency and that the earlier-flagged blocking issues were already corrected by the per-section verification stage (Phase 5 uses the named `import { translate }`; the `edge-overlay.test.ts` / `subject-overlay.test.ts` / `camera-feature-parity.test.tsx` assertions are already wrapped in `translate('en', …)`). Two cosmetic items remain — fix opportunistically, they do not block execution:

- **Phase 3, Task 3.5 green-run count:** the "expected N pass" tally for `capture-preview-route.test.ts` assumes 6 existing tests; the file currently has 5. Trust the actual `0 fail` result over the pinned number.
- **Phase 1 citation:** the "OrientationSource import precedent" note cites `CameraDevice` type-only imports (`android-camera-device.test.ts:2`, `device-cohort.test.ts:2`); the precedent is type-only vision-camera imports generally, which is correct. The required `import type { OrientationSource } from 'react-native-vision-camera'` is verified accurate.

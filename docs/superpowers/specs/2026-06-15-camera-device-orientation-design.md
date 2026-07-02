# Camera device-orientation mode — fix portrait→landscape capture/display and clean up the camera screen

**Date:** 2026-06-15
**Status:** Approved design, pending spec review (pre-implementation)
**Area:** Pilgrimage camera (`app/(tabs)/pilgrimage/compare/*`, `components/pilgrimage/camera/*`)
**Stack:** react-native-vision-camera v5.0.11 (Nitro), Expo SDK 56, RN 0.85.3

## Problem

Shooting in portrait produces a landscape photo, and it also displays landscape.
A multi-agent audit + adversarial verification (54 agents, 22 confirmed findings)
established that this is **two compounding bugs**, and corrected an initial wrong
hypothesis ("EXIF is stripped on re-encode" — refuted).

## Root cause

**The capture itself is clean.** `CameraEngineHandle.takePhoto()` returns
`{ uri, width, height, lensType }`; `persistPhotoForSkiaPipeline` converts the
in-memory `Photo` via `toImageAsync()`, which **bakes `photo.orientation` /
`photo.isMirrored` into the pixels** before saving (Skia ignores EXIF), so the
saved file's `width/height` already reflect true orientation.
(`libs/services/pilgrimage/vision-camera-photo.ts:70-93`, `CameraStage.tsx:288-328`)

Two real defects remain:

1. **Orientation authority is disconnected from the UI.**
   `<Camera orientationSource="device">` is a hardcoded literal
   (`CameraStage.tsx:631`), while `compare/[spotId].tsx:649-651` comments claim
   `"interface"`. The AUTO/LAND chip (`orientationMode`) only toggles
   `expo-screen-orientation` and is **never passed into `CameraStage`**, so it
   cannot influence capture at all. (`[spotId].tsx:653-660`, `1401-1424`, `1511`)

2. **The downstream destroys portrait** — this is the visible "display is
   landscape" half:
   - `preview.tsx` renders 4 of 5 compare modes inside a hardcoded `height: 360`
     stage with `contentFit="cover"`; only `full` mode is aspect-aware.
     (`preview.tsx:821-919`, style `:1642-1646`; cover at `:853,861,874,1345`)
   - `preview.tsx handleShare` builds `shareParams` by hand and **omits
     `shotWidth`/`shotHeight`** (`:482-531`), so `share.tsx` and `ShareCard` are
     orientation-blind and crop every shot into a fixed `1:1/9:16/16:9` `cover`
     cell. (`ShareCard.tsx:37-93,300-303`)

### Verification gap

`__tests__/unit/pilgrimage/vision-camera-photo.test.ts:23-56` mocks the native
layer and only asserts the JS contract, so it stays green regardless of the real
on-device pixel/EXIF result. This is why the regression shipped. Per prior
project lesson, data/native-layer orientation correctness must be verified by
inspecting a real captured file on device/simulator, not by fake-dep unit tests.

## Goals

1. The orientation chip genuinely controls capture: **AUTO = capture follows the
   phone (stock-camera); LAND = forced landscape.**
2. Portrait captures are never cropped downstream — preview and share show the
   whole frame (letterboxed).
3. The captured `width/height` (the orientation truth) survive end-to-end:
   capture → session → preview → share → ShareCard.
4. Clean up the camera screen's Rule 9 hotspots (targeted, not a full rewrite).
5. Localize the camera HUD/toast/error stragglers (Rule 11).
6. Add an on-device verification gate so this class of bug can't ship green again.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Orientation model | **device mode** (capture follows the phone) |
| Orientation chip | **Keep AUTO / LAND** |
| AUTO HUD behavior | **Fixed portrait (stock-camera): HUD stays put, capture rotates** |
| Refactor depth | **Targeted-clean** (orientation + lifecycle hooks; kill mirror loop; fix render-ref) |
| Portrait display | **Letterbox (`contain`)** in the 4 cropping compare modes |

## Design

### 3.1 Orientation — one authority, threaded end-to-end

Add two pure helpers to `libs/services/pilgrimage/camera-ui.ts` (unit-tested in
`__tests__/unit/pilgrimage/camera-ui.test.ts`):

```ts
import type { OrientationSource } from 'react-native-vision-camera';

// AUTO  → capture follows the physical phone (stock-camera)
// LAND  → capture follows the landscape-locked interface (forced landscape)
export function cameraOrientationSource(mode: CameraOrientationMode): OrientationSource {
  return mode === 'landscape' ? 'interface' : 'device';
}
```

Change the existing lock-intent helper so AUTO locks the **interface to
portrait** (HUD never rotates — stock-camera feel), instead of unlocking:

```ts
export type CameraOrientationLockIntent = 'portrait' | 'landscape';   // was 'unlock' | 'landscape'

export function cameraOrientationLockIntent(mode: CameraOrientationMode): CameraOrientationLockIntent {
  return mode === 'landscape' ? 'landscape' : 'portrait';             // was 'auto' → 'unlock'
}
```

Net behavior:

| Mode | Interface lock | `orientationSource` | Capture result |
|------|----------------|---------------------|----------------|
| AUTO | portrait (HUD fixed) | `device` | follows the phone — portrait when upright, landscape when turned |
| LAND | landscape | `interface` | always landscape (matches the locked UI) |

`CameraStage` change:
- `CameraStageProps` gains `orientationSource: OrientationSource;` (required).
- The `<Camera>` element uses `orientationSource={orientationSource}` instead of
  the hardcoded `"device"` literal (`CameraStage.tsx:631`).
- Delete the stale `"interface"` comment at `[spotId].tsx:649-651`; replace with a
  one-line note that AUTO is device-mode by design.

> Runtime note: `orientationSource` is a plain Camera prop; toggling the chip
> swaps it without rebuilding the photo output. Verify no visible
> reconfigure flicker on the chip toggle during the device pass.

### 3.2 Downstream aspect-aware display (letterbox + dimension propagation)

The captured `width/height` is the carrier. It must flow unbroken:

```
takePhoto() {uri,width,height}
  → recordShot/addShot → CaptureSessionShot{width,height}          (type carries it; confirm recordShot populates for every capture mode)
  → preview focusedShot.width/height                                (already read at preview.tsx:833-834)
  → handleShare → shareParams.shotWidth/shotHeight                  (ADD — currently dropped)
  → share.tsx getNumberParam(shotWidth/shotHeight) → shotAspect     (ADD)
  → <ShareCard shotWidth shotHeight />                              (ADD prop)
```

**B1 — preview compare modes.** In `overlay/slider/stacked/sideBySide`, render the
user's shot with `contentFit="contain"` (was `"cover"`) inside the existing 360
stage, so portrait letterboxes instead of cropping. (`preview.tsx:853,861,874,1345`)
`full` mode already aspect-matches via `resolveFullModeStageHeight` — unchanged.
The anime reference image keeps `cover` (it is context, not the user's frame).

**B2 — share pipeline.**
- `preview.tsx handleShare` (`:482-531`): add
  `shareParams.shotWidth = String(focusedShot.width)` and `shotHeight` likewise.
- `share.tsx` (`:85-94`, `:362-391`): read both via `getNumberParam`, derive
  `shotAspect`/orientation, pass to `<ShareCard>`. Portrait shot → default the
  `ShareRatio` to `9:16`.
- `ShareCard.tsx`: `ShareCardProps` gains `shotWidth?: number; shotHeight?: number;`.
  The user-shot cell uses `contentFit="contain"` when shot orientation ≠ cell
  orientation (no crop). The anime reference cell stays `cover`.
  (`ShareCard.tsx:37-93,175,300-303,1012`)

**B3 — deep-link / route-only preview.** `capture-preview-route.ts:42-43` sets
`width/height` to a finite number or `0`. When `0`, decode true dims via
`resolveCapturedPhotoDimensions(uri, fallback)` before choosing aspect, so full
mode no longer mislabels a portrait shot as 16:9.

### 3.3 Camera-screen state cleanup (targeted)

`app/(tabs)/pilgrimage/compare/[spotId].tsx` today: 7 `useState`, 5 `useRef`,
**14 `useEffect`**, 17 feature hooks. The HUD reducer already owns 18 knobs
(good). Targeted extractions:

| Change | What | Removes from route file |
|--------|------|-------------------------|
| **C1 `useCameraOrientation(orientationMode)`** (new hook) | Returns `{ orientationSource }`; owns the two `ScreenOrientation` effects (apply lock-intent on change; restore PORTRAIT_UP on unmount). | effects #12 (`:641`), #13 (`:653`) |
| **C2 extend `useCameraLifecycle`** | Absorb the `AppState` foreground subscription + `resolveCameraActive`, and add **camera-interruption recovery** (re-arm `isActive` after an interruption/`onError` ended — confirmed HIGH finding). | effects #10 (`:601`), #11 (`:608`) + `appIsForeground` state |
| **C3 collapse settings↔HUD mirror loop** | `useCameraSettings` hydrates synchronously (`hydrated` is always `true`, `loadCameraSettingsSync`). Initialize the HUD reducer's overlay knobs (`overlayMode/edgeIntensity/subjectFocus/subjectCombine`) from `loadCameraSettingsSync()` via the reducer's lazy initializer, and write-through to MMKV inside the change path (not an effect). | effects #1 (`:275`), #2 (`:296`) + `overlaySettingsSyncedRef` latch |
| **C4 fix render-phase ref write** | Move the `freezeFrameUriRef` write off the render body (`:356`) into the `setFreezeFrameUri` call sites (small `useFreezeFrame` hook optional but preferred — also folds effects #3/#4). | render-purity violation |

Result: ~14 effects → ~6–8, each concern with a single owner. `character`,
`deviceInfo`, and the `evValue`→`exposureShared` bridge stay in place (explicitly
out of scope for targeted depth).

### 3.4 i18n cleanup (Rule 11)

All new keys go in the flat `pilgrimageUi` namespace (en.json first, then
`zh-Hant.json`; parity enforced by `__tests__/unit/i18n.test.ts`).

- New visible-label keys: `aligned` (`"Aligned · {percent}"`), `positionLocked`,
  `autoCaptured` (`"Auto-captured · {count}"`), `cameraNeedsRestart`,
  `restartCamera`, `cameraUnavailable`, `reposition`, `repositioning`, plus the
  capture-mode label/hint set and the edge/subject label sets.
- New a11y keys (interpolated): `overlayModeA11y {mode}`, `edgeIntensityA11y
  {intensity}`, `subjectFocusA11y {focus}`, `lockOverlayPosition`,
  `repositionOverlay`, and the icon-button labels in ShutterRow / chips /
  CameraTopBar / ZoomDial / OverlayDock / OverlayControlsBar.
- Non-React copy modules return `TranslationKey`s, resolved with `t()` at the
  call site (the pattern `OverlayControls` already uses for `MODES`):
  `capture-mode-copy.ts`, `edge-overlay.ts` (`LABEL`), `subject-overlay.ts` (`LABEL`).
- `CameraErrorBoundary` (class component): resolve strings inside its
  `CameraErrorFallback` function child (already calls `useTheme`); **stop showing
  the raw `Error.message`** — log it, render a localized generic message.

### 3.5 Camera lifecycle & error handling

- **Interruptions** (C2): handle session interruption / `onError`-ended by
  re-arming `isActive` once the camera can resume, instead of leaving a dead
  session with no recovery (`CameraStage.tsx:620-634`).
- **Capture failure** keeps the existing `persistRawPhotoFallback` path.
- **Error boundary**: localized copy, no developer-facing message leaked.

## Interface changes (summary)

- `camera-ui.ts`: `+cameraOrientationSource(mode)`; `cameraOrientationLockIntent`
  return type `'unlock' | 'landscape'` → `'portrait' | 'landscape'` (AUTO →
  `'portrait'`).
- `CameraStageProps`: `+orientationSource: OrientationSource`.
- `ShareCardProps`: `+shotWidth?: number; +shotHeight?: number;`.
- Share route params: `+shotWidth`, `+shotHeight` (strings).
- New hook `hooks/useCameraOrientation.ts`; extended `hooks/useCameraLifecycle.ts`;
  optional `hooks/useFreezeFrame.ts`.

## Files touched

**New:** `hooks/useCameraOrientation.ts`, (optional) `hooks/useFreezeFrame.ts`.
**Modified:** `libs/services/pilgrimage/camera-ui.ts`,
`components/pilgrimage/camera/CameraStage.tsx`,
`app/(tabs)/pilgrimage/compare/[spotId].tsx`, `.../preview.tsx`, `.../share.tsx`,
`components/pilgrimage/ShareCard.tsx`,
`libs/services/pilgrimage/capture-preview-route.ts`, `hooks/useCameraHud.ts`,
`hooks/useCameraLifecycle.ts`, `libs/services/pilgrimage/capture-mode-copy.ts`,
`libs/services/pilgrimage/edge-overlay.ts`,
`libs/services/pilgrimage/subject-overlay.ts`,
`components/pilgrimage/camera/AlignmentHUD.tsx`, `AutoCaptureToast.tsx`,
`CameraErrorBoundary.tsx`, `chips/OverlayControls.tsx`, `FocusExposureBar.tsx`
(+ a11y-label stragglers), `libs/i18n/locales/en.json`, `zh-Hant.json`.
**Tests:** `__tests__/unit/pilgrimage/camera-ui.test.ts` (update lock-intent +
new source helper), new layout/aspect + share-param unit tests, rename the mocked
orientation contract test.

## Testing & verification

1. **Step 0 — on-device gate (before coding):** capture portrait + landscape in
   AUTO and LAND on iOS and Android; read back each saved file's true pixel
   dimensions + EXIF. Records the real current behavior and proves whether
   device-mode capture is already correct (downstream-only fix) or also needs a
   capture-config change.
2. **Unit tests (TDD, red first):** `cameraOrientationSource`, updated
   `cameraOrientationLockIntent`, letterbox/aspect layout math, share-param
   dimension forwarding, downstream aspect selection. Run via `bun run test:unit`.
3. **Contract test:** rename the mocked `vision-camera-photo` test to make clear
   it only checks the JS contract; the real check is Step 0 / closeout.
4. **Closeout — on device:** portrait capture → file is portrait **and**
   preview/share show the full frame (letterboxed), not cropped; LAND forces
   landscape; AUTO keeps the HUD fixed while the capture rotates.

## Non-goals

- Full route-file extraction (`character`, `deviceInfo`, exposure bridge stay).
- Video / RAW / multi-cam / other camera features.
- Deferred lower-severity findings: photo-settings session reconfigure
  (`CameraStage:205-222`), onFrame re-registration (`useSceneAnalyzer`), sheet
  focus-loss streaming, permission blank-frame chrome, single-shot "saved"
  confirmation. (Tracked separately; not part of critical + point-3 scope.)

## Sequencing

1. Step 0 device verification → 2. pure helpers + unit tests →
3. orientation thread (3.1) → 4. downstream letterbox + dims (3.2) →
5. state cleanup (3.3) → 6. i18n (3.4) → 7. lifecycle/interruptions (3.5) →
8. closeout device verification.

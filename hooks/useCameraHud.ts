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

/**
 * Every piece of camera-screen HUD interaction state, in one place.
 *
 * CLAUDE.md Rule 9: the camera capture screen must not be a state dumping
 * ground. Previously `compare/[spotId].tsx` declared ~19 separate top-level
 * `useState`s for these knobs. They are all driven by user taps (never at
 * sensor/gesture frequency), so a single reducer is the right owner — the
 * route file consumes one `{ hud, setHud }` pair instead.
 *
 * Persisted settings (capture mode, countdown, quality) live in
 * `useCameraSettings`; high-frequency values (zoom, tilt, focus) stay on
 * Reanimated `SharedValue`s. This hook is strictly the discrete HUD state.
 */
export interface CameraHudState {
  // --- Camera capture controls ---
  facing: CameraFacing;
  flashMode: FlashMode;
  aspect: AspectRatio;
  /** Exposure-compensation value the focus/EV bar drives. */
  evValue: number;
  orientationMode: CameraOrientationMode;

  // --- Overlay configuration ---
  overlayMode: OverlayMode;
  /** Off-segment toggle — when false the overlay renders at 0 opacity. */
  overlayVisible: boolean;
  overlayOpacity: number;
  /** Reposition (drag/scale/rotate) mode for the overlay transform. */
  editMode: boolean;
  edgeIntensity: EdgeIntensity;
  subjectFocus: SubjectFocus;
  subjectCombine: boolean;

  // --- HUD panels ---
  settingsOpen: boolean;
  quickControlsOpen: boolean;
  overlayDockOpen: boolean;
  sceneSwitcherOpen: boolean;

  // --- Transient toasts (set-only; the toast components self-dismiss) ---
  captureModeToast: CaptureModeToastValue | null;
  autoCaptureToast: AutoCaptureToastValue | null;
  switchToast: CamSwitchToastValue | null;
}

export const INITIAL_CAMERA_HUD: CameraHudState = {
  facing: 'back',
  flashMode: 'off',
  aspect: '16:9',
  evValue: 0,
  orientationMode: 'auto',

  // Default to 'edge': the anime bitmap overlay covers the live preview
  // too aggressively for first-time framing, while edge sketch lets the
  // user see both reference geometry and the live scene at the same
  // opacity. Persisted in `CameraSettings.overlayMode` so subsequent
  // launches restore the user's pick.
  overlayMode: 'edge',
  overlayVisible: true,
  overlayOpacity: 0.35,
  editMode: false,
  edgeIntensity: 'low',
  subjectFocus: 'normal',
  subjectCombine: false,

  settingsOpen: false,
  quickControlsOpen: true,
  overlayDockOpen: true,
  sceneSwitcherOpen: false,

  captureModeToast: null,
  autoCaptureToast: null,
  switchToast: null,
};

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

/**
 * A patch applied to the HUD state — either a partial object, or a function of
 * the current state (use the functional form for toggles and cycles so they
 * never read a stale render-closure value).
 */
export type CameraHudPatch =
  | Partial<CameraHudState>
  | ((state: CameraHudState) => Partial<CameraHudState>);

export function cameraHudReducer(state: CameraHudState, patch: CameraHudPatch): CameraHudState {
  const next = typeof patch === 'function' ? patch(state) : patch;
  return { ...state, ...next };
}

export interface UseCameraHudResult {
  hud: CameraHudState;
  /** Merge a patch into the HUD state. Stable across renders. */
  setHud: (patch: CameraHudPatch) => void;
}

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

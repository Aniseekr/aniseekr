import type { OrientationSource } from 'react-native-vision-camera';

export interface CameraHeaderInput {
  sceneName?: string | string[] | null;
  animeTitle?: string | string[] | null;
  ep?: string | string[] | number | null;
}

export interface CameraHeaderText {
  title: string;
  subtitle: string;
}

export type CameraOrientationMode = 'auto' | 'landscape';
export type CameraOrientationLockIntent = 'portrait' | 'landscape';

export interface CameraActiveInput {
  appIsForeground: boolean;
  settingsOpen: boolean;
}

// Camera chrome heights — these EXCLUDE the safe-area inset; the screen adds
// `topInset` / `bottomPad(insets)` on top.
//
// The chrome is intentionally light: a soft translucent top strip and a set of
// translucent floating controls along the bottom. There is no solid letterbox
// bar — the live camera preview runs edge to edge behind every control.
export const CAMERA_TOP_BAR_CONTENT_HEIGHT = 56;
// The Row-2 chip strip (inner content) when expanded. Chips are 36px tall;
// the inner view adds 4px top + 10px bottom padding = 50px. Rounded up to 52
// as a static bound for tests. Actual height is measured via onLayout.
export const CAMERA_TOP_BAR_ROW2_HEIGHT = 52;
// Portrait shutter row — the floating capture controls (library / shutter /
// flip). Tall enough for the 72px shutter plus a little breathing room.
export const CAMERA_SHUTTER_ROW_HEIGHT = 88;
// Landscape floats the shutter cluster on the right edge instead of a solid
// rail; this is the horizontal space that cluster reserves so HUD layers stay
// clear of it.
export const CAMERA_LANDSCAPE_CLUSTER_RESERVE = 96;
// Portrait bottom chrome: shutter row (72px) + breathing room. Overlay
// controls live in OverlayDock above this strip and can collapse.
export const CAMERA_BOTTOM_BAR_CONTENT_HEIGHT = 96;

// Minimum bottom inset (px) the camera chrome assumes for the Android gesture
// navigation bar — the "海帶條" pill. Some Android edge-to-edge configurations
// report `useSafeAreaInsets().bottom` as 0 even though the gesture bar is drawn
// over the window; the raw inset would then let the shutter row sit underneath
// it. Flooring the camera's bottom inset at this value keeps the controls
// clear. Deliberately conservative: on a device with no navigation bar this
// only adds a little extra letterbox to an already-letterboxed screen.
export const ANDROID_GESTURE_NAV_MIN_INSET = 24;

const RESERVED_COMPARE_ROUTES = new Set(['align', 'preview', 'share', 'tips']);
const EV_MIN = -2;
const EV_MAX = 2;

export function formatCameraHeader(input: CameraHeaderInput): CameraHeaderText {
  const animeTitle = firstParam(input.animeTitle);
  const episode = formatEpisode(firstParam(input.ep));

  if (animeTitle && episode) {
    return { title: 'Scene Match', subtitle: `${animeTitle} · ${episode}` };
  }
  if (animeTitle) {
    return { title: 'Scene Match', subtitle: `${animeTitle} scene` };
  }
  if (episode) {
    return { title: 'Scene Match', subtitle: `${episode} · anime scene` };
  }
  return { title: 'Scene Match', subtitle: 'Anime reference' };
}

export function isCameraCapturePath(pathname: string | null | undefined): boolean {
  const clean = (pathname ?? '').split(/[?#]/)[0]?.replace(/\/+$/, '') ?? '';
  const parts = clean.split('/').filter(Boolean);
  if (parts.length !== 3) return false;
  if (parts[0] !== 'pilgrimage' || parts[1] !== 'compare') return false;
  return !RESERVED_COMPARE_ROUTES.has(parts[2] ?? '');
}

export function cameraOrientationLockIntent(
  mode: CameraOrientationMode
): CameraOrientationLockIntent {
  return mode === 'landscape' ? 'landscape' : 'portrait';
}

// AUTO  → capture follows the physical phone (stock-camera): 'device'.
// LAND  → capture follows the landscape-locked interface (forced landscape): 'interface'.
// `OrientationSource` is the vision-camera prop type ('interface' | 'device').
export function cameraOrientationSource(mode: CameraOrientationMode): OrientationSource {
  return mode === 'landscape' ? 'interface' : 'device';
}

// Keep CameraView remount policy out of this helper module. The old
// `shouldRemountCameraForOrientationSettle(previousIsLandscape, isLandscape)`
// helper treated any physical rotation as a remount signal, which can black out
// the native preview. The screen must gate remounts with its one-shot
// programmatic LAND-chip flag instead.
export function roundExposureValue(value: number): number {
  const clamped = Math.max(EV_MIN, Math.min(EV_MAX, value));
  return Number(clamped.toFixed(1));
}

export function resolveCameraTopChromeHeight(input: { quickControlsOpen: boolean }): number {
  return CAMERA_TOP_BAR_CONTENT_HEIGHT + (input.quickControlsOpen ? CAMERA_TOP_BAR_ROW2_HEIGHT : 0);
}

export function resolveCameraActive(input: CameraActiveInput): boolean {
  return input.appIsForeground && !input.settingsOpen;
}

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

/**
 * Resolve the bottom safe-area inset the camera capture screen should pad for.
 *
 * iOS home-indicator insets are reliable, so the reported value is used as-is.
 * On Android the value is floored at {@link ANDROID_GESTURE_NAV_MIN_INSET} so a
 * mis-reported `0` (a known Android edge-to-edge quirk) can't let the system
 * navigation bar cover the shutter. A genuine, larger inset (e.g. the
 * three-button nav bar) is always kept.
 */
export function resolveCameraBottomInset(reportedBottomInset: number, platformOS: string): number {
  const safe =
    Number.isFinite(reportedBottomInset) && reportedBottomInset > 0 ? reportedBottomInset : 0;
  if (platformOS === 'android') {
    return Math.max(safe, ANDROID_GESTURE_NAV_MIN_INSET);
  }
  return safe;
}

function firstParam(value: CameraHeaderInput['animeTitle'] | CameraHeaderInput['ep']): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

function formatEpisode(value: string): string {
  if (!value) return '';
  const normalized = value.replace(/^ep(?:isode)?\s*/i, '').trim();
  return normalized ? `EP ${normalized}` : '';
}

// ── Banded chrome layout (Samsung-style; identical stacking in both orientations) ──

/** Zoom band: preset pills + opacity pill. */
export const CAMERA_ZOOM_BAND_HEIGHT = 44;
/** Overlay-mode carousel band (the primary control). */
export const CAMERA_CAROUSEL_BAND_HEIGHT = 48;
/** Bottom row: gallery | shutter | flip. */
export const CAMERA_BOTTOM_ROW_HEIGHT = 88;
/** Vertical breathing room between stacked bands. */
export const CAMERA_BAND_GAP = 8;

export interface CameraBandLayoutInput {
  /** Safe-area bottom already resolved via {@link resolveCameraBottomInset}. */
  bottomInset: number;
  /** Whether the zoom band participates in the stack (driven by the visibility resolver). */
  showZoomBand: boolean;
}

export interface CameraBandLayout {
  shutterRowBottom: number;
  shutterRowHeight: number;
  carouselBottom: number;
  carouselHeight: number;
  zoomBandBottom: number;
  zoomBandHeight: number;
  /** Height of the whole bottom chrome cluster from the inset up; drives the AlignmentHUD reserve. */
  totalBottomChromeHeight: number;
}

/**
 * Resolve the bottom-up stack of fixed bands (shutter row → carousel → zoom band).
 *
 * Deliberately takes NO `isLandscape` input: the bands stack identically in both
 * orientations. Landscape no longer reflows the cluster into a right-edge column —
 * only the glyphs inside each band rotate (Apple/Samsung convention). This replaces
 * the old per-layer `bottom: bottomBarHeight + N` offsets and `landscapeCluster`.
 */
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
  /** Immersive intent (auto-on in landscape; cleared by a tap-to-reveal). */
  immersive: boolean;
  afLocked: boolean;
  /** An overlay mode is selected (`overlayVisible === true`). */
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
 * Immersive-by-subtraction. The chrome is ALWAYS glass (we never change opacity); instead,
 * landscape-immersive hides the secondary controls (zoom band, opacity pill, top contextual
 * icons, capture history), leaving the shutter row, the overlay carousel, and the alignment
 * readout. A tap clears `immersive` to reveal everything again. Supersedes the dock-driven
 * `resolveTransientCameraHudVisibility`.
 */
export function resolveCameraChromeVisibility(
  input: CameraChromeVisibilityInput,
): CameraChromeVisibility {
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

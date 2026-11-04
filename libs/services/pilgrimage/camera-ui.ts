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
/** 紀錄: shoot and log, no questions. 動漫: line up against a scene screenshot. */
export type CameraMode = 'record' | 'anime';
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
  // The compare flow is a root-level stack (`app/compare/*`) so it can be
  // opened from any tab — the spot camera is `/compare/<spotId>`.
  if (parts.length !== 2 || parts[0] !== 'compare') return false;
  return !RESERVED_COMPARE_ROUTES.has(parts[1] ?? '');
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
/** 紀錄｜動漫 switch, directly above the shutter row. */
export const CAMERA_MODE_SWITCH_HEIGHT = 32;

export interface CameraBandLayoutInput {
  /** Safe-area bottom already resolved via {@link resolveCameraBottomInset}. */
  bottomInset: number;
  /** Whether the zoom band participates in the stack (driven by the visibility resolver). */
  showZoomBand: boolean;
  /**
   * Whether the overlay-mode carousel participates. Without a reference there is
   * nothing to overlay, so the band collapses and the zoom band sits right above
   * the shutter row. Defaults to true.
   */
  showCarousel?: boolean;
  /** Whether the 紀錄｜動漫 switch sits between the shutter row and the bands above. */
  showModeSwitch?: boolean;
}

export interface CameraBandLayout {
  shutterRowBottom: number;
  shutterRowHeight: number;
  modeSwitchBottom: number;
  modeSwitchHeight: number;
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
 * only the glyphs inside each band rotate (Apple/Samsung convention). A hidden
 * band takes no space: the bands above it drop down.
 */
export function resolveCameraBandLayout(input: CameraBandLayoutInput): CameraBandLayout {
  const showCarousel = input.showCarousel ?? true;
  const showModeSwitch = input.showModeSwitch ?? false;
  const shutterRowBottom = input.bottomInset;
  const modeSwitchBottom = shutterRowBottom + CAMERA_BOTTOM_ROW_HEIGHT;
  const modeSwitchSpan = showModeSwitch ? CAMERA_MODE_SWITCH_HEIGHT : 0;
  const carouselBottom = modeSwitchBottom + modeSwitchSpan + CAMERA_BAND_GAP;
  const carouselSpan = showCarousel ? CAMERA_CAROUSEL_BAND_HEIGHT + CAMERA_BAND_GAP : 0;
  const zoomBandBottom = carouselBottom + carouselSpan;
  const totalBottomChromeHeight =
    CAMERA_BOTTOM_ROW_HEIGHT +
    modeSwitchSpan +
    (showCarousel ? CAMERA_BAND_GAP + CAMERA_CAROUSEL_BAND_HEIGHT : 0) +
    (input.showZoomBand ? CAMERA_BAND_GAP + CAMERA_ZOOM_BAND_HEIGHT : 0);
  return {
    shutterRowBottom,
    shutterRowHeight: CAMERA_BOTTOM_ROW_HEIGHT,
    modeSwitchBottom,
    modeSwitchHeight: CAMERA_MODE_SWITCH_HEIGHT,
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
  /** A reference image exists. Without one every overlay control is meaningless. */
  hasReference: boolean;
  /** 紀錄 mode: a plain logging camera, so no reference or overlay chrome at all. */
  recordMode?: boolean;
}

export interface CameraChromeVisibility {
  showZoomBand: boolean;
  /** 紀錄｜動漫 labels; landscape-immersive tucks them away with the zoom band. */
  showModeSwitch: boolean;
  /** REF thumbnail + overlay-mode carousel. */
  showReferenceControls: boolean;
  /** The light "import this scene's screenshot" affordance. */
  showImportReference: boolean;
  showOpacityPill: boolean;
  showCaptureHistory: boolean;
  showAutoCaptureBadge: boolean;
  showFocusExposureBar: boolean;
  showOverlayQuickControls: boolean;
}

/**
 * Immersive-by-subtraction. The chrome is ALWAYS glass (we never change opacity); instead,
 * landscape-immersive hides the secondary controls (zoom band, opacity pill, capture history),
 * leaving the shutter row, the overlay carousel, and the alignment readout. A tap clears
 * `immersive` to reveal everything again. Overlay controls exist only once there is a
 * reference: the camera opens as a plain full-screen viewfinder.
 */
export function resolveCameraChromeVisibility(
  input: CameraChromeVisibilityInput
): CameraChromeVisibility {
  const secondaryHidden = input.isLandscape && input.immersive;
  const anime = !input.recordMode;
  const overlay = anime && input.hasReference && input.overlayActive;
  return {
    showZoomBand: !secondaryHidden,
    showModeSwitch: !secondaryHidden,
    showReferenceControls: anime && input.hasReference,
    showImportReference: anime && !input.hasReference,
    showOpacityPill: !secondaryHidden && overlay,
    showCaptureHistory: !secondaryHidden,
    showAutoCaptureBadge: true,
    // Landscape has ~400pt of height: the stacked bands already fill it, so the
    // EV bar and the per-mode overlay tools stay portrait-only (the focus ring
    // and AF lock still work).
    showFocusExposureBar: input.afLocked && !input.isLandscape,
    showOverlayQuickControls: overlay && !input.isLandscape,
  };
}

export interface ViewfinderRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Long side over short side of what the photo keeps; null = fill the screen. */
const VIEWFINDER_RATIO: Record<'4:3' | '16:9' | '1:1' | 'full', number | null> = {
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '1:1': 1,
  full: null,
};

/**
 * Where the live preview sits so it shows exactly what the photo keeps
 * (WYSIWYG). Portrait: full width, starting under the status bar; whatever is
 * left below is the dark band the shutter sits on. Landscape: full height,
 * centred. 'full' fills the screen (the photo then keeps more than is seen).
 */
export function resolveViewfinderRect(input: {
  winW: number;
  winH: number;
  topInset: number;
  aspect: '4:3' | '16:9' | '1:1' | 'full';
}): ViewfinderRect {
  const { winW, winH, topInset } = input;
  const ratio = VIEWFINDER_RATIO[input.aspect];
  if (ratio === null) return { left: 0, top: 0, width: winW, height: winH };
  if (winW > winH) {
    const width = Math.min(winW, winH * ratio);
    return { left: (winW - width) / 2, top: 0, width, height: winH };
  }
  const available = winH - topInset;
  const height = Math.min(available, winW * ratio);
  const width = height === available ? height / ratio : winW;
  return { left: (winW - width) / 2, top: topInset, width, height };
}

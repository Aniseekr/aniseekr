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
export type CameraOrientationLockIntent = 'unlock' | 'landscape';

export interface CameraActiveInput {
  appIsForeground: boolean;
  settingsOpen: boolean;
}

// Geometry for the camera "More" tool menu — a drill-down popover anchored
// above the dock row in both portrait and landscape. Exported (not
// component-local) so the layout invariants stay unit-testable.
export const CAMERA_TOOL_MENU_TRIGGER_HEIGHT = 44;
export const CAMERA_TOOL_MENU_PANEL_GAP = 12;
/** Landscape only: gap from the screen bottom to the dock row. */
export const CAMERA_TOOL_MENU_DOCK_BOTTOM_OFFSET = 14;
export const CAMERA_TOOL_MENU_MIN_PANEL_WIDTH = 280;
export const CAMERA_TOOL_MENU_PANEL_WIDTH = 320;

export interface CameraToolMenuLayoutInput {
  isLandscape: boolean;
  safeAreaBottomPad: number;
  portraitDockBottom: number;
  shutterRailWidth: number;
}

export interface CameraToolMenuLayout {
  bottomOffset: number;
  rightOffset: number;
}

export interface TransientCameraHudVisibilityInput {
  toolMenuOpen: boolean;
  afLocked: boolean;
}

export interface TransientCameraHudVisibility {
  showAutoCaptureBadge: boolean;
  showCaptureHistory: boolean;
  showFocusExposureBar: boolean;
}

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
  return mode === 'landscape' ? 'landscape' : 'unlock';
}

export function roundExposureValue(value: number): number {
  const clamped = Math.max(EV_MIN, Math.min(EV_MAX, value));
  return Number(clamped.toFixed(1));
}

export function resolveCameraToolMenuLayout(
  input: CameraToolMenuLayoutInput
): CameraToolMenuLayout {
  const dockRowBottom = input.isLandscape
    ? input.safeAreaBottomPad + CAMERA_TOOL_MENU_DOCK_BOTTOM_OFFSET
    : input.portraitDockBottom;

  return {
    bottomOffset: dockRowBottom + CAMERA_TOOL_MENU_TRIGGER_HEIGHT + CAMERA_TOOL_MENU_PANEL_GAP,
    rightOffset: input.isLandscape ? input.shutterRailWidth + 16 : 16,
  };
}

export function resolveTransientCameraHudVisibility(
  input: TransientCameraHudVisibilityInput
): TransientCameraHudVisibility {
  const showTransientHud = !input.toolMenuOpen;
  return {
    showAutoCaptureBadge: showTransientHud,
    showCaptureHistory: showTransientHud,
    showFocusExposureBar: input.afLocked && showTransientHud,
  };
}

export function resolveCameraActive(input: CameraActiveInput): boolean {
  return input.appIsForeground && !input.settingsOpen;
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

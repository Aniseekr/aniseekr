// Persisted camera tool prefs (mute shutter, mirror selfie, animation,
// quality, resolution tier, countdown, capture mode).
//
// Lives in its own AsyncStorage key — independent of UserPrefs and the map
// theme pref — so the camera screen can read/write without dragging unrelated
// preference shapes into its render path. Defensive against corrupted JSON:
// any missing or malformed field falls back to its default value.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Logger } from '../../utils/logger';
import { isObject, safeJsonParse } from '../../utils/safe-json';

// v3 adds `skipProcessing` — bumped so legacy payloads fall through to
// DEFAULT_CAMERA_SETTINGS rather than silently coexisting with the new shape.
// (The later `pictureSize` → `resolutionTier` swap needs no bump: a legacy
// payload simply lacks `resolutionTier` and picks up the default.)
export const CAMERA_SETTINGS_STORAGE_KEY = 'aniseekr:camera-settings:v3';

export type CaptureMode = 'single' | 'burst' | 'hdr';
export type CountdownSeconds = 0 | 3 | 5 | 10;
export type PictureQuality = 'standard' | 'high' | 'max';
export type ResolutionTier = '4k' | '2k';

export const CAPTURE_MODES: readonly CaptureMode[] = ['single', 'burst', 'hdr'] as const;
export const COUNTDOWN_SECONDS: readonly CountdownSeconds[] = [0, 3, 5, 10] as const;
export const PICTURE_QUALITIES: readonly PictureQuality[] = [
  'standard',
  'high',
  'max',
] as const;
export const RESOLUTION_TIERS: readonly ResolutionTier[] = ['4k', '2k'] as const;

// A "2K" capture keeps frames in the FHD/QHD range — its long edge must not
// exceed this. Anything larger reads as 4K to the user.
const TWO_K_MAX_LONG_EDGE = 2600;

export interface CameraSettings {
  mute: boolean;
  mirror: boolean;
  animateShutter: boolean;
  quality: PictureQuality;
  /**
   * User-facing capture resolution. The camera screen resolves this to a
   * concrete device picture-size string at runtime via `resolvePictureSize`
   * (Android reports exact `WIDTHxHEIGHT` sizes; some devices report none, in
   * which case expo-camera's own default is used).
   */
  resolutionTier: ResolutionTier;
  countdownSeconds: CountdownSeconds;
  captureMode: CaptureMode;
  /**
   * When true, the camera screen arms an auto-capture watcher that fires the
   * shutter once alignment is sustained above the threshold. Orthogonal to
   * `captureMode` — the active mode (single/burst/hdr) still applies — and
   * stacks with `countdownSeconds`.
   */
  autoCapture: boolean;
  /**
   * When true, expo-camera's `takePictureAsync` is invoked with
   * `skipProcessing: true` — faster capture at the cost of orientation
   * fix-ups (some devices return rotated EXIF/raw bytes). Threaded into all
   * three capture paths (single, burst, HDR).
   */
  skipProcessing: boolean;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  mute: false,
  mirror: false,
  animateShutter: true,
  quality: 'high',
  resolutionTier: '4k',
  countdownSeconds: 0,
  captureMode: 'single',
  autoCapture: false,
  skipProcessing: false,
};

/**
 * Maps the symbolic quality choice to the numeric value expo-camera's
 * `takePictureAsync({ quality })` expects (0..1). 'high' is the default —
 * matches expo-camera's default behaviour but expressed explicitly.
 */
export function qualityToNumber(q: PictureQuality): number {
  switch (q) {
    case 'standard':
      return 0.7;
    case 'high':
      return 0.92;
    case 'max':
      return 1.0;
  }
}

/**
 * Resolves the user-facing 4K/2K tier onto a concrete device picture-size
 * string. `availableSizes` is whatever `getAvailablePictureSizesAsync()`
 * reported — Android returns `"WIDTHxHEIGHT"`, so we parse those and ignore
 * any non-numeric presets.
 *
 * - `4k` → the largest size the device offers.
 * - `2k` → the largest size whose long edge is ≤ 2600px (FHD/QHD range);
 *   if every size is bigger, the smallest available is used.
 *
 * Returns `undefined` when no size string can be parsed, so the camera falls
 * back to expo-camera's own default instead of a guessed value (CLAUDE.md
 * Rule 8 — no fabricated data).
 */
export function resolvePictureSize(
  tier: ResolutionTier,
  availableSizes: readonly string[]
): string | undefined {
  const parsed = availableSizes
    .map((raw) => {
      const match = /(\d+)\s*[x×]\s*(\d+)/i.exec(raw);
      if (!match) return null;
      const w = Number(match[1]);
      const h = Number(match[2]);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
      return { raw, longEdge: Math.max(w, h), area: w * h };
    })
    .filter((v): v is { raw: string; longEdge: number; area: number } => v !== null)
    .sort((a, b) => b.area - a.area);

  if (parsed.length === 0) return undefined;
  if (tier === '4k') return parsed[0].raw;
  const twoK = parsed.find((s) => s.longEdge <= TWO_K_MAX_LONG_EDGE);
  return (twoK ?? parsed[parsed.length - 1]).raw;
}

function isCaptureMode(value: unknown): value is CaptureMode {
  return value === 'single' || value === 'burst' || value === 'hdr';
}

function isCountdownSeconds(value: unknown): value is CountdownSeconds {
  return value === 0 || value === 3 || value === 5 || value === 10;
}

function isPictureQuality(value: unknown): value is PictureQuality {
  return value === 'standard' || value === 'high' || value === 'max';
}

function isResolutionTier(value: unknown): value is ResolutionTier {
  return value === '4k' || value === '2k';
}

function pickValidSettings(value: Record<string, unknown>): Partial<CameraSettings> {
  const out: Partial<CameraSettings> = {};
  if (typeof value.mute === 'boolean') out.mute = value.mute;
  if (typeof value.mirror === 'boolean') out.mirror = value.mirror;
  if (typeof value.animateShutter === 'boolean') out.animateShutter = value.animateShutter;
  if (isPictureQuality(value.quality)) out.quality = value.quality;
  if (isResolutionTier(value.resolutionTier)) out.resolutionTier = value.resolutionTier;
  if (isCountdownSeconds(value.countdownSeconds)) {
    out.countdownSeconds = value.countdownSeconds;
  }
  if (isCaptureMode(value.captureMode)) out.captureMode = value.captureMode;
  if (typeof value.autoCapture === 'boolean') out.autoCapture = value.autoCapture;
  if (typeof value.skipProcessing === 'boolean') out.skipProcessing = value.skipProcessing;
  return out;
}

export async function loadCameraSettings(): Promise<CameraSettings> {
  try {
    const raw = await AsyncStorage.getItem(CAMERA_SETTINGS_STORAGE_KEY);
    const parsed = safeJsonParse(raw, isObject);
    if (!parsed) return { ...DEFAULT_CAMERA_SETTINGS };
    return { ...DEFAULT_CAMERA_SETTINGS, ...pickValidSettings(parsed) };
  } catch (err) {
    Logger.warn('[CameraSettings] load failed, using defaults', err);
    return { ...DEFAULT_CAMERA_SETTINGS };
  }
}

export async function saveCameraSettings(settings: CameraSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(CAMERA_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    Logger.warn('[CameraSettings] save failed', err);
  }
}

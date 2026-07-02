import { useCallback, useState } from 'react';
import {
  loadCameraSettingsSync,
  saveCameraSettings,
  type CameraSettings,
} from '../libs/services/pilgrimage/camera-settings';

// Re-export the types/constants/helpers so callers can do
// `import { useCameraSettings, qualityToNumber } from '@/hooks/useCameraSettings'`
// without reaching into libs/services for every related symbol.
export {
  CAMERA_SETTINGS_STORAGE_KEY,
  CAPTURE_MODES,
  COUNTDOWN_SECONDS,
  DEFAULT_CAMERA_SETTINGS,
  RESOLUTION_TIERS,
  SILENT_SHUTTER_HELP_TEXT,
  qualityToNumber,
  qualityToPrioritization,
} from '../libs/services/pilgrimage/camera-settings';
export type {
  CameraSettings,
  CaptureMode,
  CountdownSeconds,
  PictureQuality,
  ResolutionTier,
} from '../libs/services/pilgrimage/camera-settings';

export type CameraSettingsPatch =
  | Partial<CameraSettings>
  | ((prev: CameraSettings) => Partial<CameraSettings>);

export interface UseCameraSettingsResult {
  settings: CameraSettings;
  setSettings: (patch: CameraSettingsPatch) => void;
  hydrated: boolean;
}

export function mergeCameraSettingsPatch(
  prev: CameraSettings,
  patch: CameraSettingsPatch
): CameraSettings {
  const resolved = typeof patch === 'function' ? patch(prev) : patch;
  return { ...prev, ...resolved };
}

/**
 * Loads persisted camera settings and writes through on each change.
 *
 * Initial state is seeded synchronously from MMKV, so the camera screen opens
 * with the user's real settings on the first frame. Writes are fire-and-forget
 * so the UI never waits on storage. `hydrated` is always true — kept on the
 * return type for back-compat with callers that gate UI on it.
 */
export function useCameraSettings(): UseCameraSettingsResult {
  const [settings, setSettingsState] = useState<CameraSettings>(loadCameraSettingsSync);

  const setSettings = useCallback((patch: CameraSettingsPatch) => {
    setSettingsState((prev) => {
      const next = mergeCameraSettingsPatch(prev, patch);
      void saveCameraSettings(next);
      return next;
    });
  }, []);

  return { settings, setSettings, hydrated: true };
}

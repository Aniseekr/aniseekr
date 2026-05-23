import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadCameraSettings,
  loadCameraSettingsSync,
  saveCameraSettings,
  type CameraSettings,
} from '../libs/services/pilgrimage/camera-settings';
import { isMigrated } from '../libs/services/storage/app-storage';

// Re-export the types/constants/helpers so callers can do
// `import { useCameraSettings, qualityToNumber } from '@/hooks/useCameraSettings'`
// without reaching into libs/services for every related symbol.
export {
  CAMERA_SETTINGS_STORAGE_KEY,
  CAPTURE_MODES,
  COUNTDOWN_SECONDS,
  DEFAULT_CAMERA_SETTINGS,
  PICTURE_QUALITIES,
  RESOLUTION_TIERS,
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

export interface UseCameraSettingsResult {
  settings: CameraSettings;
  setSettings: (patch: Partial<CameraSettings>) => void;
  hydrated: boolean;
}

/**
 * Loads persisted camera settings and writes through on each change.
 *
 * Initial state is seeded synchronously from MMKV, so the camera screen opens
 * with the user's real settings on the first frame. Writes are fire-and-forget
 * so the UI never waits on storage. On the single launch after the
 * AsyncStorage → MMKV migration the seed starts from defaults; the effect then
 * reconciles, and `setSettings` is gated until then so the defaults can't
 * overwrite the value still being migrated.
 */
export function useCameraSettings(): UseCameraSettingsResult {
  const [bootstrap] = useState(() => ({
    settings: loadCameraSettingsSync(),
    migrated: isMigrated(),
  }));
  const [settings, setSettingsState] = useState<CameraSettings>(bootstrap.settings);
  const [hydrated, setHydrated] = useState(bootstrap.migrated);
  const hydratedRef = useRef(bootstrap.migrated);

  useEffect(() => {
    let mounted = true;
    const applySynchronousSeed = () => {
      if (!mounted) return;
      setSettingsState(loadCameraSettingsSync());
      hydratedRef.current = true;
      setHydrated(true);
    };

    // Warm launches are already correct from the synchronous seed. If migration
    // completed between the state initializer and this effect, re-read once so
    // the hook does not stay permanently unhydrated for this session.
    if (isMigrated()) {
      if (!bootstrap.migrated) applySynchronousSeed();
      return () => {
        mounted = false;
      };
    }

    void loadCameraSettings().then((loaded) => {
      if (!mounted) return;
      setSettingsState(loaded);
      hydratedRef.current = true;
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setSettings = useCallback((patch: Partial<CameraSettings>) => {
    setSettingsState((prev) => {
      const next: CameraSettings = { ...prev, ...patch };
      if (hydratedRef.current) {
        void saveCameraSettings(next);
      }
      return next;
    });
  }, []);

  return { settings, setSettings, hydrated };
}

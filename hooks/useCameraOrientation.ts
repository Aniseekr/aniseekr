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

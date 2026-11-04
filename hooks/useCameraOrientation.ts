import { useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
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
 * While the camera is focused, lock the interface per
 * `cameraOrientationLockIntent` — LAND forces landscape, AUTO locks the
 * interface to PORTRAIT_UP so the HUD never rotates (stock-camera feel), while
 * `orientationSource = 'device'` lets the *capture* rotate. On blur or unmount
 * restore PORTRAIT_UP so leaving the camera never strands the app in landscape.
 */
export function useCameraOrientation(
  orientationMode: CameraOrientationMode
): UseCameraOrientationResult {
  const orientationSource = useMemo<OrientationSource>(
    () => cameraOrientationSource(orientationMode),
    [orientationMode]
  );

  // (a) Apply the lock-intent whenever the chip flips.
  // The lock applies only while the camera is the focused screen. Anything
  // pushed on top of it (the preview, a deep link to another tab) gets the
  // app's normal portrait back, and returning re-applies the camera's lock.
  useFocusEffect(
    useCallback(() => {
      const lockIntent = cameraOrientationLockIntent(orientationMode);
      ScreenOrientation.lockAsync(
        lockIntent === 'landscape'
          ? ScreenOrientation.OrientationLock.LANDSCAPE
          : ScreenOrientation.OrientationLock.PORTRAIT_UP
      ).catch(() => undefined);
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
          () => undefined
        );
      };
    }, [orientationMode])
  );

  return { orientationSource };
}

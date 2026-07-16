import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { LookAroundPreviewView } from './LookAroundPreviewView';
import type { LookAroundPreviewViewProps } from './LookAroundPreviewView.types';
import type { LookAroundProvider } from '../../../libs/services/pilgrimage/street-view/street-view-service';

interface NativeLookAroundModule {
  hasScene(latitude: number, longitude: number): Promise<boolean>;
  present(latitude: number, longitude: number): Promise<void>;
}

function getNativeModule(): NativeLookAroundModule | null {
  if (Platform.OS !== 'ios') return null;
  return requireOptionalNativeModule<NativeLookAroundModule>('AniseekrLookAround');
}

export async function hasScene(latitude: number, longitude: number): Promise<boolean> {
  const nativeModule = getNativeModule();
  if (!nativeModule) return false;

  try {
    return await nativeModule.hasScene(latitude, longitude);
  } catch {
    return false;
  }
}

/**
 * Presents Apple's fullscreen Look Around controller on iOS.
 *
 * Non-iOS platforms and old dev clients without the native module resolve as a
 * no-op. The native iOS implementation rejects with
 * `ERR_LOOK_AROUND_SCENE_UNAVAILABLE` when MapKit cannot find a scene for the
 * coordinate, so callers can fall back to Mapillary/Google Maps.
 */
export async function present(latitude: number, longitude: number): Promise<void> {
  const nativeModule = getNativeModule();
  if (!nativeModule) return;

  return nativeModule.present(latitude, longitude);
}

export const lookAroundProvider = {
  hasScene,
} satisfies LookAroundProvider;

export { LookAroundPreviewView };
export type { LookAroundPreviewViewProps };

export default {
  hasScene,
  present,
  LookAroundPreviewView,
  provider: lookAroundProvider,
};

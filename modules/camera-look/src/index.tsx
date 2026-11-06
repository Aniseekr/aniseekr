import type { ComponentType, ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { NitroModules } from 'react-native-nitro-modules';
import type { LookFrameFilter } from './specs/LookFrameFilter.nitro';

export { IosLookPreviewView, useIosLookPreview, type IosLookPreview } from './ios-preview';
export type { LookFrameFilter } from './specs/LookFrameFilter.nitro';

interface NativeCameraLookModule {
  gradeJpeg(uri: string, matrix: number[], quality: number): Promise<number>;
}

interface LookFilterViewProps {
  matrix: readonly number[] | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

const nativeModule: NativeCameraLookModule | null =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeCameraLookModule>('AniseekrCameraLook')
    : null;

// iOS: Core Image filter (Nitro). Null on Android and in builds without it.
const iosFilter: LookFrameFilter | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    return NitroModules.createHybridObject<LookFrameFilter>('LookFrameFilter');
  } catch {
    return null;
  }
})();

/** The iOS frame filter, or null where looks run natively on the preview (Android). */
export function getIosLookFilter(): LookFrameFilter | null {
  return iosFilter;
}

const NativeLookFilterView: ComponentType<LookFilterViewProps> | null = nativeModule
  ? requireNativeViewManager<LookFilterViewProps>('AniseekrCameraLook')
  : null;

/**
 * Whether this build can tint the live preview the same way it grades the
 * photo: Android filters the preview view itself, iOS draws tinted frames over
 * it. Old dev clients without the native side get no looks at all.
 */
export function isCameraLookAvailable(): boolean {
  return nativeModule !== null || iosFilter !== null;
}

/** Draws its children (the camera preview) through the look's colour matrix. */
export function LookFilterView({ matrix, style, children }: LookFilterViewProps) {
  if (!NativeLookFilterView) return <View style={style}>{children}</View>;
  return (
    <NativeLookFilterView matrix={matrix ? [...matrix] : null} style={style}>
      {children}
    </NativeLookFilterView>
  );
}

/** Grade a saved JPEG in place with the same matrix. Resolves with the ms it took. */
export async function gradeJpeg(uri: string, matrix: readonly number[], quality: number): Promise<number> {
  if (nativeModule) return nativeModule.gradeJpeg(uri, [...matrix], Math.round(quality));
  if (iosFilter) return iosFilter.gradeJpeg(uri, [...matrix], Math.round(quality));
  throw new Error('Camera looks are not available in this build');
}

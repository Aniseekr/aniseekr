import type { ComponentType, ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';

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

const NativeLookFilterView: ComponentType<LookFilterViewProps> | null = nativeModule
  ? requireNativeViewManager<LookFilterViewProps>('AniseekrCameraLook')
  : null;

/**
 * Whether this build can tint the live preview. iOS has no public way to
 * filter the camera preview layer, and old dev clients lack the module, so
 * looks are only offered where preview and photo can match.
 */
export function isCameraLookAvailable(): boolean {
  return nativeModule !== null;
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
  if (!nativeModule) throw new Error('Camera looks are not available in this build');
  return nativeModule.gradeJpeg(uri, [...matrix], Math.round(quality));
}

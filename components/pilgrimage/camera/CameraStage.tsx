// Container for the live camera surface. It owns the CameraView plus camera
// gestures and the exposure preview tint. Reference overlays and focus/level
// guides are sibling layers in the screen so their z-order stays explicit.
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  CameraView,
  type CameraRatio,
  type CameraType,
  type FlashMode,
  type FocusMode,
} from 'expo-camera';
import {
  Gesture,
  GestureDetector,
  type PinchGesture,
  type TapGesture,
} from 'react-native-gesture-handler';
import BrightnessPreview from './BrightnessPreview';

interface CameraStageProps {
  cameraRef: RefObject<CameraView | null>;
  facing: CameraType;
  zoom: number;
  autofocus: FocusMode;
  flashMode: FlashMode;
  enableTorch: boolean;
  selectedLens: string | null;
  pictureSize?: string;
  ratio?: CameraRatio;
  responsiveOrientationWhenOrientationLocked?: boolean;
  active?: boolean;

  pinchGesture: PinchGesture;
  tapGesture: TapGesture;

  brightnessOverlayStyle: { backgroundColor: string; opacity: number };

  onCameraReady?: () => void;
  onMountError?: (msg: string) => void;
}

export default function CameraStage({
  cameraRef,
  facing,
  zoom,
  autofocus,
  flashMode,
  enableTorch,
  selectedLens,
  pictureSize,
  ratio,
  responsiveOrientationWhenOrientationLocked,
  active,
  pinchGesture,
  tapGesture,
  brightnessOverlayStyle,
  onCameraReady,
  onMountError,
}: CameraStageProps) {
  return (
    <View style={styles.root}>
      <GestureDetector gesture={Gesture.Simultaneous(pinchGesture, tapGesture)}>
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            zoom={zoom}
            autofocus={autofocus}
            flash={flashMode}
            enableTorch={enableTorch}
            // CameraView's selectedLens prop is `string | undefined` — never pass null.
            selectedLens={selectedLens ?? undefined}
            pictureSize={pictureSize}
            ratio={ratio}
            responsiveOrientationWhenOrientationLocked={responsiveOrientationWhenOrientationLocked}
            active={active}
            onCameraReady={onCameraReady}
            onMountError={(e) => onMountError?.(e.message)}
          />
          <BrightnessPreview overlayStyle={brightnessOverlayStyle} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

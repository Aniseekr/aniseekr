// Pixel-exact sizes for react-native-view-shot.
//
// `captureRef({ width, height })` means pixels on Android but points on iOS:
// the iOS module draws into a renderer at the screen scale, so asking for
// 1080 × 1080 there produced 3240 × 3240 on a 3x iPhone (an upscaled
// screen-size bitmap, not more detail). Convert once here so every export
// size the UI names is the size of the saved file on both platforms.
import { PixelRatio, Platform } from 'react-native';

export function captureSizeForPixels(px: { width: number; height: number }): {
  width: number;
  height: number;
} {
  if (Platform.OS !== 'ios') return px;
  const scale = PixelRatio.get();
  return { width: px.width / scale, height: px.height / scale };
}

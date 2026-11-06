import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame, FrameRenderer } from 'react-native-vision-camera';

/**
 * iOS film-look pipeline. The camera preview layer can't be filtered on iOS,
 * so camera frames are tinted with Core Image and handed to VisionCamera's
 * FrameRenderer; saved photos get the same CIColorMatrix.
 */
export interface LookFrameFilter extends HybridObject<{ ios: 'swift' }> {
  /** 20 numbers (4×5, offsets 0..1), or undefined to pass frames through untinted. */
  setMatrix(matrix: number[] | undefined): void;
  /** Tint one frame and show it on the renderer's layer. Call from the frame worklet. */
  render(frame: Frame, renderer: FrameRenderer): void;
  /** Grade a JPEG in place with the matrix. Resolves with the milliseconds it took. */
  gradeJpeg(path: string, matrix: number[], quality: number): Promise<number>;
}

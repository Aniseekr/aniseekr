// iOS film-look preview. The camera's own preview layer can't be filtered on
// iOS, so while a look is on, a preview-sized frame output streams frames into
// the native filter, which tints them with Core Image and draws them on a
// VisionCamera FrameRenderer view laid over the live preview. Nothing per
// frame touches the JS thread: the worklet only forwards the frame.
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  CommonResolutions,
  NativeFrameRendererView,
  useFrameOutput,
  useFrameRenderer,
  type CameraFrameOutput,
  type FrameRenderer,
} from 'react-native-vision-camera';
import type { LookFrameFilter } from './specs/LookFrameFilter.nitro';

export interface IosLookPreview {
  frameOutput: CameraFrameOutput;
  renderer: FrameRenderer;
}

/**
 * Safe to call everywhere; with no filter (Android, old builds) the output is
 * created but never attached, and its worklet only releases frames.
 */
export function useIosLookPreview(filter: LookFrameFilter | null): IosLookPreview {
  const renderer = useFrameRenderer();
  const frameOutput = useFrameOutput({
    // Preview-sized, upright buffers: what the screen shows, nothing more.
    targetResolution: CommonResolutions.HD_16_9,
    enablePreviewSizedOutputBuffers: true,
    enablePhysicalBufferRotation: true,
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';
      try {
        filter?.render(frame, renderer);
      } catch {
        // A dropped preview frame only skips one tint; the next one tries again.
      } finally {
        frame.dispose();
      }
    },
  });
  return { frameOutput, renderer };
}

/** The tinted frames, drawn over the live preview. */
export function IosLookPreviewView({
  filter,
  preview,
  matrix,
}: {
  filter: LookFrameFilter;
  preview: IosLookPreview;
  matrix: readonly number[];
}) {
  useEffect(() => {
    filter.setMatrix([...matrix]);
  }, [filter, matrix]);
  return (
    <NativeFrameRendererView
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      renderer={preview.renderer}
    />
  );
}

// Scene analyzer hook — drives the auto-mode HDR recommendation.
//
// Samples camera frames at ~5 Hz, builds a coarse luma histogram, and flips a
// React state when the scene clips at both ends of the tonal range (i.e. a
// real high-DR scene that would benefit from a bracket). Hysteresis prevents
// the AUTO chip from flickering when the framing crosses a window or sun.
//
// VisionCamera v5 wires frame processing through `useFrameOutput` (a worklet
// `onFrame` callback exposed as a `CameraFrameOutput` which the caller adds to
// the Camera's `outputs` array). When disabled, we return `frameOutput:
// undefined` so the parent can skip adding it to the outputs list.
//
// Downsampling strategy: we cap the camera-side `targetResolution` at VGA so
// the pipeline never streams 4K Y-planes, and when the GPU resizer is present
// we hand the frame straight to it — the resize → small RGB pixel-buffer path
// is intentionally kept general so a future on-device ML stage (anime-image
// matching, Live2D doll insertion) can reuse the same resized buffer.
//
// Rule 8: every value reported (`hdrRecommended`) is derived from real frame
// pixels. When the scene is disabled or neither the GPU nor the CPU path can
// produce pixels, we return `false` honestly — never a fake recommendation.

import { useCallback, useEffect, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import {
  CommonResolutions,
  useFrameOutput,
  type CameraFrameOutput,
  type Frame,
} from 'react-native-vision-camera';
import {
  isResizerAvailable,
  useResizer,
  type GPUFrame,
} from 'react-native-vision-camera-resizer';
import {
  advanceHysteresis,
  analyzeLumaHistogram,
  createHysteresisState,
} from '../libs/services/pilgrimage/scene-analyzer';

export interface UseSceneAnalyzerOutput {
  /**
   * Pass into `<CameraStage frameOutput={...} />`. Undefined when disabled so
   * the parent can leave it out of the Camera's outputs list entirely (no
   * frame processing thread spun up when the user isn't in auto mode).
   */
  frameOutput: CameraFrameOutput | undefined;
  /** Latest scene-analyzer recommendation. Updated at most ~5 Hz. */
  hdrRecommended: boolean;
}

/** Sample interval in nanoseconds (frame.timestamp is reported in ns on iOS/Android). */
const SAMPLE_INTERVAL_NS = 200_000_000; // 5 Hz
/** Target sample grid for the downsampled luma histogram. */
const SAMPLE_GRID = 64;

export interface UseSceneAnalyzerInput {
  enabled: boolean;
}

export function useSceneAnalyzer({ enabled }: UseSceneAnalyzerInput): UseSceneAnalyzerOutput {
  const [hdrRecommended, setHdrRecommended] = useState(false);

  // SharedValues are how we keep per-frame state on the UI/worklet thread
  // without paying for a SharedValue<→React state round-trip every frame.
  const lastSampleTimestamp = useSharedValue(0);
  const hysteresisShared = useSharedValue(createHysteresisState(false));

  // GPU-accelerated downsampler. Configured to emit the SAMPLE_GRID×SAMPLE_GRID
  // analysis grid directly as 8-bit interleaved RGB so the worklet reads one
  // contiguous (R,G,B) triple per pixel — `cover` keeps the centre framing the
  // user actually sees. `useResizer` is a no-op until the native module links;
  // we still gate the worklet on `isResizerAvailable()` so a Metal/Vulkan-less
  // device falls back cleanly.
  const { resizer } = useResizer({
    width: SAMPLE_GRID,
    height: SAMPLE_GRID,
    channelOrder: 'rgb',
    dataType: 'uint8',
    pixelLayout: 'interleaved',
    scaleMode: 'cover',
  });

  // Re-seed the hysteresis whenever auto mode is toggled — switching away
  // should not leak a stale "agree count" into the next session.
  useEffect(() => {
    hysteresisShared.value = createHysteresisState(false);
    lastSampleTimestamp.value = 0;
    if (!enabled) setHdrRecommended(false);
  }, [enabled, hysteresisShared, lastSampleTimestamp]);

  // Stable JS-side flip callback; runOnJS will marshal the new value back from
  // the worklet runtime. `setHdrRecommended` is a useState dispatcher and
  // therefore reference-stable across renders, so the worklet captures it once
  // — no ref-of-ref pattern (which would trip Reanimated's "modified key
  // `current` of an object passed to a worklet" warning).
  const flipRecommendation = useCallback((next: boolean) => {
    setHdrRecommended(next);
  }, []);

  // The worklet itself. It MUST be re-created when the camera unmounts (handled
  // by `useFrameOutput`'s lifecycle) but we keep the inner closure dependency
  // surface minimal — only the shared values, the resizer, and the stable flip
  // callback.
  //
  // dispose() ordering: the `frame` is released once in the `finally` block;
  // the GPU `resized` frame is also released there, but guarded with `?.`
  // because the 5 Hz timestamp gate early-returns BEFORE the resize runs — on
  // those frames there is no GPU frame to dispose. Disposing twice (or
  // disposing an object that was never created) frees NativeState a second
  // time and surfaces as "Cannot call hybrid function `HybridObject.dispose`".
  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      let resized: GPUFrame | undefined;
      try {
        if (!frame.isValid) return;
        const ts = frame.timestamp;
        if (ts - lastSampleTimestamp.value < SAMPLE_INTERVAL_NS) return;
        lastSampleTimestamp.value = ts;

        if (resizer != null && isResizerAvailable()) {
          // GPU path: resize on the GPU to the analysis grid and read back a
          // small interleaved-RGB buffer. ~64×64×3 bytes instead of a
          // full-resolution Y-plane copy.
          resized = resizer.resize(frame);
          const buffer = resized.getPixelBuffer();
          if (buffer) {
            const rgb = new Uint8Array(buffer);
            const pixelCount = (rgb.length / 3) | 0;
            const luma: number[] = [];
            for (let i = 0; i < pixelCount; i++) {
              const base = i * 3;
              // BT.601 RGB→luma; output stays on the 8-bit 0..255 scale the
              // histogram thresholds in scene-analyzer.ts are tuned for.
              luma.push(
                0.299 * rgb[base] + 0.587 * rgb[base + 1] + 0.114 * rgb[base + 2]
              );
            }
            const { needsHdr } = analyzeLumaHistogram(luma);
            const { flipped, current } = advanceHysteresis(
              hysteresisShared.value,
              needsHdr
            );
            if (flipped) {
              runOnJS(flipRecommendation)(current);
            }
          }
        } else {
          // CPU fallback: stride-sample the YUV Y-plane directly. Used when the
          // GPU resizer is unavailable (no Metal/Vulkan, or native module not
          // linked). If anything here is unavailable (non-planar RGB frame,
          // native-only buffer, dispose race) we bail without crashing — the
          // analyzer just stays at its last recommendation.
          const planes = frame.isPlanar ? frame.getPlanes() : [];
          const yPlane = planes[0];
          if (!yPlane || !yPlane.isValid) return;
          const yWidth = yPlane.width;
          const yHeight = yPlane.height;
          const yStride = yPlane.bytesPerRow;
          if (yWidth <= 0 || yHeight <= 0 || yStride <= 0) return;
          const buffer = yPlane.getPixelBuffer();
          if (!buffer) return;
          const bytes = new Uint8Array(buffer);

          // Stride-sample the Y plane onto a SAMPLE_GRID×SAMPLE_GRID histogram
          // bucket — full-resolution scanning is wasted work for a clip-count
          // signal, and pulling the whole buffer through the JS engine every
          // frame would peg the UI thread.
          const stepX = Math.max(1, Math.floor(yWidth / SAMPLE_GRID));
          const stepY = Math.max(1, Math.floor(yHeight / SAMPLE_GRID));
          const samples: number[] = [];
          for (let y = 0; y < yHeight; y += stepY) {
            const rowOffset = y * yStride;
            for (let x = 0; x < yWidth; x += stepX) {
              samples.push(bytes[rowOffset + x]);
            }
          }

          const { needsHdr } = analyzeLumaHistogram(samples);
          const { flipped, current } = advanceHysteresis(
            hysteresisShared.value,
            needsHdr
          );
          if (flipped) {
            runOnJS(flipRecommendation)(current);
          }
        }
      } catch {
        // The worklet runtime cannot surface errors through the camera
        // pipeline — swallow and let the next frame try. A consistently failing
        // scene analyzer is a no-op (hdrRecommended stays false), which is the
        // honest behaviour: we don't know if the scene needs HDR.
      } finally {
        // Single dispose path: even if an early-return fired or the try threw,
        // the frame is released here exactly once. The GPU `resized` frame is
        // released here too — `resized?.dispose()` is a no-op when the 5 Hz
        // gate returned before the resize, so it is never double-disposed.
        // dispose() on an already-disposed object surfaces as a NativeState
        // crash.
        try {
          resized?.dispose();
        } catch {
          // Defensive: the GPU frame's NativeState may already be gone if the
          // camera tore down between resize and this line.
        }
        try {
          frame.dispose();
        } catch {
          // Defensive against the very last frame after camera tear-down —
          // NativeState may be gone before we reach this line.
        }
      }
    },
    [hysteresisShared, lastSampleTimestamp, flipRecommendation, resizer]
  );

  // useFrameOutput must be called unconditionally (hooks rule). Suppress it by
  // ignoring its return when disabled so the camera doesn't add a frame output
  // to its session. The frame processor itself is cheap when not invoked.
  //
  // targetResolution is capped at VGA (vs. the HD default) so the camera never
  // negotiates a 4K frame-processor stream — the analyzer only needs a coarse
  // clip-count signal. `pixelFormat: 'yuv'` is the cheapest CPU-readable format
  // and is also the input the GPU resizer expects on iOS.
  const frameOutput = useFrameOutput({
    onFrame,
    targetResolution: CommonResolutions.VGA_16_9,
    pixelFormat: 'yuv',
  });

  return {
    frameOutput: enabled ? frameOutput : undefined,
    hdrRecommended: enabled ? hdrRecommended : false,
  };
}

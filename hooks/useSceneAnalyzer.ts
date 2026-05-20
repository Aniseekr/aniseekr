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
// Rule 8: every value reported (`hdrRecommended`) is derived from real frame
// pixels. When the scene is disabled or the worklet runtime is unavailable,
// we return `false` honestly — never a fake recommendation.

import { useCallback, useEffect, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import {
  useFrameOutput,
  type CameraFrameOutput,
  type Frame,
} from 'react-native-vision-camera';
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
  // surface minimal — only the shared values + the stable flip callback.
  //
  // dispose() is called once in the `finally` block; the early-return branches
  // must NOT call it themselves or NativeState is freed twice and the second
  // dispose throws "Cannot call hybrid function `HybridObject.dispose(...)`".
  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        if (!frame.isValid) return;
        const ts = frame.timestamp;
        if (ts - lastSampleTimestamp.value < SAMPLE_INTERVAL_NS) return;
        lastSampleTimestamp.value = ts;

        // Defensive: planar Y-plane reads on the YUV pipeline. If anything is
        // unavailable (non-planar RGB frame, native-only buffer, dispose race),
        // bail out without crashing — we'll just skip this sample.
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
        const { flipped, current } = advanceHysteresis(hysteresisShared.value, needsHdr);
        if (flipped) {
          runOnJS(flipRecommendation)(current);
        }
      } catch {
        // The worklet runtime cannot surface errors through the camera
        // pipeline — swallow and let the next frame try. A consistently failing
        // scene analyzer is a no-op (hdrRecommended stays false), which is the
        // honest behaviour: we don't know if the scene needs HDR.
      } finally {
        // Single dispose path: even if an early-return fired or the try threw,
        // the frame is released here exactly once. dispose() on an
        // already-disposed frame would surface as a NativeState-null crash.
        try {
          frame.dispose();
        } catch {
          // Defensive against the very last frame after camera tear-down —
          // NativeState may be gone before we reach this line.
        }
      }
    },
    [hysteresisShared, lastSampleTimestamp, flipRecommendation]
  );

  // useFrameOutput must be called unconditionally (hooks rule). Suppress it by
  // ignoring its return when disabled so the camera doesn't add a frame output
  // to its session. The frame processor itself is cheap when not invoked.
  const frameOutput = useFrameOutput({ onFrame });

  return {
    frameOutput: enabled ? frameOutput : undefined,
    hdrRecommended: enabled ? hdrRecommended : false,
  };
}

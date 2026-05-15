// Drives the real expo-camera CameraView.zoom (0..1 range) via pinch + focal-stop pills.
// This hook targets the camera *lens* — not the overlay scale. The existing
// `useOverlayTransform` (gesture composition in compare/[spotId].tsx) handles
// overlay zoom; if you want both, compose them with `Gesture.Simultaneous`.
//
// Stop-to-zoom mapping is an APPROXIMATION calibrated for iPhone-class devices.
// Real devices have non-linear zoom curves (especially with multi-camera fusion);
// verify on Android via field test before relying on these numbers for parity.
import { useCallback, useMemo, useState } from 'react';
import { Gesture, type PinchGesture } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { FocalStop, ZoomValue } from '../components/pilgrimage/camera/types';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

// Calibrated for iPhone-class devices. Adjust per device family via field test.
export const STOP_TO_ZOOM: Record<FocalStop, ZoomValue> = {
  0.5: 0, // ultra-wide
  1: 0.25, // 1x (main)
  2: 0.6, // 2x
  3: 1.0, // 3x (telephoto or max)
};

const DEFAULT_STOPS: FocalStop[] = [0.5, 1, 2, 3];
const SNAP_TOLERANCE = 0.05;
// Pinch arc → zoom delta. 0.4 means a 2.5× pinch covers the full 0→1 range.
// Tune after field test on representative devices.
const PINCH_SENSITIVITY = 0.4;
// 120ms cadence: matches the rotation-throttle pattern elsewhere — keeps React
// state updates off the UI thread without lagging stop-snap visuals noticeably.
const THROTTLE_MS = 120;
// Focal-stop transitions ease in once and stop — deliberately NOT a spring.
// A spring overshot the target zoom and bounced back, which read as a cheap
// "toy camera" wobble; a single timed ramp settles clean like a real lens.
const ZOOM_TWEEN = { duration: 200, easing: Easing.out(Easing.cubic) } as const;

export interface UseCameraZoomInput {
  minZoom?: number;
  maxZoom?: number;
  stops?: FocalStop[];
  initial?: FocalStop;
}

export interface UseCameraZoomOutput {
  zoom: number;
  activeStop: FocalStop | null;
  setZoom: (z: number) => void;
  setStop: (s: FocalStop) => void;
  pinchGesture: PinchGesture;
}

function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function nearestStopJS(z: number, stops: FocalStop[]): FocalStop | null {
  let best: FocalStop | null = null;
  let bestDelta = Infinity;
  for (const stop of stops) {
    const delta = Math.abs(z - STOP_TO_ZOOM[stop]);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = stop;
    }
  }
  if (best !== null && bestDelta < SNAP_TOLERANCE) return best;
  return null;
}

export function useCameraZoom(input?: UseCameraZoomInput): UseCameraZoomOutput {
  const minZoom = input?.minZoom ?? 0;
  const maxZoom = input?.maxZoom ?? 1;
  const stops = input?.stops ?? DEFAULT_STOPS;
  const initial = input?.initial ?? 1;

  const zoomShared = useSharedValue<number>(STOP_TO_ZOOM[initial]);
  const savedZoom = useSharedValue<number>(STOP_TO_ZOOM[initial]);
  const lastUpdate = useSharedValue<number>(0);

  const [zoom, setZoomState] = useState<number>(STOP_TO_ZOOM[initial]);

  // Throttled JS-state mirror of the shared value. Same shape as the rotation
  // throttle in useOverlayTransform — keeps React renders bounded while the
  // shared value drives CameraView.zoom directly on the UI thread.
  useDerivedValue(() => {
    const now = Date.now();
    if (now - lastUpdate.value < THROTTLE_MS) return;
    lastUpdate.value = now;
    runOnJS(setZoomState)(zoomShared.value);
  });

  const snapToStop = useCallback((stop: FocalStop) => {
    hapticsBridge.selection();
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          savedZoom.value = zoomShared.value;
        })
        .onUpdate((e) => {
          const next = savedZoom.value + (e.scale - 1) * PINCH_SENSITIVITY;
          zoomShared.value = clamp(next, minZoom, maxZoom);
        })
        .onEnd(() => {
          // Snap to nearest stop only if we're inside hysteresis tolerance.
          // Otherwise leave the user's hand-set zoom in place — don't lie.
          let target: number | null = null;
          let snapped: FocalStop | null = null;
          for (const stop of stops) {
            const delta = Math.abs(zoomShared.value - STOP_TO_ZOOM[stop]);
            if (delta < SNAP_TOLERANCE) {
              target = STOP_TO_ZOOM[stop];
              snapped = stop;
              break;
            }
          }
          if (target !== null) {
            zoomShared.value = withTiming(target, ZOOM_TWEEN);
            if (snapped !== null) runOnJS(snapToStop)(snapped);
          }
        }),
    [zoomShared, savedZoom, minZoom, maxZoom, stops, snapToStop]
  );

  const setZoom = useCallback(
    (z: number) => {
      const clamped = Math.max(minZoom, Math.min(maxZoom, z));
      zoomShared.value = clamped;
      setZoomState(clamped);
    },
    [zoomShared, minZoom, maxZoom]
  );

  const setStop = useCallback(
    (s: FocalStop) => {
      const target = STOP_TO_ZOOM[s];
      zoomShared.value = withTiming(target, ZOOM_TWEEN);
      setZoomState(target);
      hapticsBridge.selection();
    },
    [zoomShared]
  );

  const activeStop = useMemo<FocalStop | null>(
    () => nearestStopJS(zoom, stops),
    [zoom, stops]
  );

  return { zoom, activeStop, setZoom, setStop, pinchGesture };
}

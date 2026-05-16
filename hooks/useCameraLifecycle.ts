// CameraView lifecycle bookkeeping. We track three independent things:
//   1. isReady — flips true on the first `onCameraReady` and STAYS sticky.
//      `onCameraReady` fires exactly once, when the native capture session
//      first starts (CameraSessionManager.startSession). Pausing/resuming via
//      the `active` prop only calls startRunning()/stopRunning() natively — it
//      does NOT re-fire `onCameraReady`. So `isReady` must never be cleared on
//      a resume: doing that strands the "Preparing camera…" warmup veil
//      forever, and with it the shutter (gated on `isReady` in the screen).
//   2. mountError — string from `onMountError`, cleared on the next ready event
//      so a recovered camera no longer shows the error banner.
//   3. active — a controlled boolean so callers can pause/resume the camera
//      session (e.g. while a sheet covers the preview, or on app background)
//      without unmounting CameraView.
//
// `reset()` is the only thing that clears `isReady` — call it solely for a
// genuine remount (e.g. a keyed CameraView), never for an `active` toggle.
//
// Pure React state only — no AsyncStorage, no side effects.

import { useCallback, useState } from 'react';

export interface UseCameraLifecycleOutput {
  isReady: boolean;
  mountError: string | null;
  /** Bind to `CameraView.onCameraReady`. Callers can compose with other listeners. */
  onCameraReady: () => void;
  /** Bind to `CameraView.onMountError` via an adapter that produces `{ nativeEvent }`. */
  onMountError: (e: { nativeEvent: { message: string } }) => void;
  /** Pause/resume the camera session. Does not touch `isReady`. */
  setActive: (active: boolean) => void;
  active: boolean;
  /** Force `isReady` back to false. Use only on intentional remounts. */
  reset: () => void;
}

export function useCameraLifecycle(initialActive: boolean = true): UseCameraLifecycleOutput {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [active, setActive] = useState<boolean>(initialActive);

  const onCameraReady = useCallback(() => {
    setIsReady(true);
    setMountError(null);
  }, []);

  const onMountError = useCallback((e: { nativeEvent: { message: string } }) => {
    const msg = e?.nativeEvent?.message ?? 'Camera failed to mount';
    setMountError(msg);
  }, []);

  const reset = useCallback(() => {
    setIsReady(false);
  }, []);

  return {
    isReady,
    mountError,
    onCameraReady,
    onMountError,
    setActive,
    active,
    reset,
  };
}

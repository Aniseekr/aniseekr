// CameraView lifecycle bookkeeping. We track three independent things plus a
// derived `active`:
//   1. isReady — flips true on the first `onCameraReady` and STAYS sticky.
//      `onCameraReady` fires exactly once, when the native capture session
//      first starts. Pausing/resuming via the `active` prop only calls
//      startRunning()/stopRunning() natively — it does NOT re-fire
//      `onCameraReady`. So `isReady` must never be cleared on a resume: doing
//      that strands the "Preparing camera…" warmup veil forever, and with it
//      the shutter (gated on `isReady` in the screen).
//   2. mountError — string from `onMountError`, cleared on the next ready event
//      so a recovered camera no longer shows the error banner.
//   3. rearming — true for one short tick right after `onMountError`. vision-
//      camera leaves `isActive` true after an `onError`-ended session, but the
//      native session is dead and never restarts unless `isActive` toggles
//      off→on. Setting `rearming` forces `active` low; a timer clears it so the
//      camera comes back. This is the §3.5 recovery for the HIGH-severity
//      "dead session, no recovery" finding. (CameraStage forwards `onError`
//      only — vision-camera's onInterruption* callbacks are not in the
//      CameraStage prop contract, so we recover off the error signal + AppState.)
//   4. active — DERIVED from app foreground state, the settings sheet, and the
//      re-arm tick via `resolveCameraActiveWithInterruption`. Callers no longer
//      set this directly; they pass `settingsOpen` in and the hook owns both the
//      AppState subscription and the derivation.
//
// `reset()` is the only thing that clears `isReady` — call it solely for a
// genuine remount (e.g. a keyed CameraView), never for an `active` toggle.

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { resolveCameraActiveWithInterruption } from '../libs/services/pilgrimage/camera-ui';

// How long to hold `active` low after an onError before re-arming. Long enough
// for VisionCamera to tear the failed session down, short enough to feel like a
// blip, not a freeze.
const REARM_DELAY_MS = 350;

export interface UseCameraLifecycleInput {
  /** Camera should pause while the settings sheet covers the preview. */
  settingsOpen: boolean;
  /** Initial foreground assumption before the first AppState event. */
  initialActive?: boolean;
}

export interface UseCameraLifecycleOutput {
  isReady: boolean;
  mountError: string | null;
  /** Bind to `CameraStage.onCameraReady`. Callers can compose with other listeners. */
  onCameraReady: () => void;
  /** Bind to `CameraStage.onMountError`. Triggers the off→on re-arm cycle. */
  onMountError: (e: { nativeEvent: { message: string } }) => void;
  /** Derived: whether the native camera session should be running right now. */
  active: boolean;
  /** Force `isReady` back to false. Use only on intentional remounts. */
  reset: () => void;
}

export function useCameraLifecycle({
  settingsOpen,
  initialActive = true,
}: UseCameraLifecycleInput): UseCameraLifecycleOutput {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [appIsForeground, setAppIsForeground] = useState<boolean>(() =>
    initialActive ? AppState.currentState === 'active' : false
  );
  const [rearming, setRearming] = useState<boolean>(false);

  // Own the AppState subscription here (moved off the route file). The camera
  // session pauses on background and resumes on the next 'active' event.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppIsForeground(state === 'active');
    });
    return () => sub.remove();
  }, []);

  // After an onError, hold `active` low briefly then re-arm so the dead session
  // restarts (§3.5). Cleared automatically; also cleared early if a genuine
  // ready event lands first (onCameraReady below).
  useEffect(() => {
    if (!rearming) return;
    const timer = setTimeout(() => setRearming(false), REARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [rearming]);

  const onCameraReady = useCallback(() => {
    setIsReady(true);
    setMountError(null);
    // A fresh ready event means the session is genuinely running again — end
    // any in-flight re-arm immediately.
    setRearming(false);
  }, []);

  const onMountError = useCallback((e: { nativeEvent: { message: string } }) => {
    const msg = e?.nativeEvent?.message ?? 'Camera failed to mount';
    setMountError(msg);
    // Force the off→on cycle: `active` drops while `rearming` is true, the timer
    // above clears it, and the derived `active` comes back true (foreground +
    // sheet permitting), restarting the session instead of wedging it dead.
    setRearming(true);
  }, []);

  const reset = useCallback(() => {
    setIsReady(false);
  }, []);

  const active = resolveCameraActiveWithInterruption({
    appIsForeground,
    settingsOpen,
    interrupted: rearming,
  });

  return {
    isReady,
    mountError,
    onCameraReady,
    onMountError,
    active,
    reset,
  };
}

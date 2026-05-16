// React binding for the capture-session store. Wraps the module-level
// singleton in `libs/services/pilgrimage/capture-session.ts` via
// `useSyncExternalStore` so any screen that mounts this hook re-renders when
// the session changes — without prop-drilling the shots through navigation.
//
// The store keeps the snapshot reference stable between mutations, so this is
// loop-safe for `useSyncExternalStore`.

import { useSyncExternalStore } from 'react';
import {
  addShot,
  clearSession,
  getShots,
  removeShot,
  subscribe,
  type CaptureSessionShot,
} from '../libs/services/pilgrimage/capture-session';

export interface UseCaptureSessionOutput {
  /** Captured shots, newest-first. Empty until the first capture. */
  shots: readonly CaptureSessionShot[];
  addShot: (shot: CaptureSessionShot) => void;
  removeShot: (id: string) => void;
  clearSession: () => void;
}

export function useCaptureSession(): UseCaptureSessionOutput {
  const shots = useSyncExternalStore(subscribe, getShots, getShots);
  return { shots, addShot, removeShot, clearSession };
}

export type { CaptureSessionShot };

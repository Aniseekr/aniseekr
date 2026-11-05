// The camera's film-look pick. Lives in a tiny external store instead of the
// camera screen's state: dragging the strength slider re-renders only the
// preview filter and the tray, not the whole screen (CLAUDE.md rule 9). The
// pick is persisted to camera settings when a look is chosen or a drag ends.
import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  lookMatrixAt,
  resolveActiveLook,
  type CameraLook,
  type CameraLookId,
  type ColorMatrix,
} from '../libs/services/pilgrimage/camera-looks';

export interface CameraLookSelection {
  id: CameraLookId;
  intensity: number;
}

export interface CameraLookStore {
  get(): CameraLookSelection;
  set(patch: Partial<CameraLookSelection>): void;
  subscribe(listener: () => void): () => void;
}

function createCameraLookStore(initial: CameraLookSelection): CameraLookStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch };
      if (next.id === state.id && next.intensity === state.intensity) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One store per camera screen, seeded from the persisted settings on mount. */
export function useCameraLookStore(initial: CameraLookSelection): CameraLookStore {
  const [store] = useState(() => createCameraLookStore(initial));
  return store;
}

export function useCameraLookSelection(store: CameraLookStore): CameraLookSelection {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export interface ActiveCameraLook {
  look: CameraLook;
  intensity: number;
  matrix: ColorMatrix | null;
}

/** What the camera shoots with right now (Pro looks fall back without Pro). */
export function activeCameraLook(selection: CameraLookSelection, isPro: boolean): ActiveCameraLook {
  const { look, intensity } = resolveActiveLook(selection.id, selection.intensity, isPro);
  return { look, intensity, matrix: lookMatrixAt(look, intensity) };
}

const noStore = () => () => undefined;

/** Whether any look is on. Re-renders only when that flips, not on every drag tick. */
export function useCameraLookActive(store: CameraLookStore | undefined, isPro: boolean): boolean {
  const read = () => (store ? activeCameraLook(store.get(), isPro).matrix !== null : false);
  return useSyncExternalStore(store ? store.subscribe : noStore, read, read);
}

export function useActiveCameraLook(store: CameraLookStore, isPro: boolean): ActiveCameraLook {
  const selection = useCameraLookSelection(store);
  return useMemo(() => activeCameraLook(selection, isPro), [selection, isPro]);
}

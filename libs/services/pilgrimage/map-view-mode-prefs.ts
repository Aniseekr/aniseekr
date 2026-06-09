import { kvGet, kvSet } from '../storage/app-storage';
import { PILGRIMAGE_MAP_VIEW_MODE_STORAGE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';

export type PilgrimageMapViewMode = 'myLocation' | 'anime';

export const DEFAULT_PILGRIMAGE_MAP_VIEW_MODE: PilgrimageMapViewMode = 'myLocation';

type Subscriber = (next: PilgrimageMapViewMode) => void;

const subscribers = new Set<Subscriber>();

function isPilgrimageMapViewMode(value: unknown): value is PilgrimageMapViewMode {
  return value === 'myLocation' || value === 'anime';
}

export function loadPilgrimageMapViewModeSync(): PilgrimageMapViewMode {
  try {
    const raw = kvGet(PILGRIMAGE_MAP_VIEW_MODE_STORAGE_KEY);
    if (isPilgrimageMapViewMode(raw)) return raw;
  } catch (err) {
    Logger.warn('[PilgrimageMapViewMode] load failed, using default', err);
  }
  return DEFAULT_PILGRIMAGE_MAP_VIEW_MODE;
}

export async function setPilgrimageMapViewMode(next: PilgrimageMapViewMode): Promise<void> {
  if (!isPilgrimageMapViewMode(next)) return;
  try {
    kvSet(PILGRIMAGE_MAP_VIEW_MODE_STORAGE_KEY, next);
  } catch (err) {
    Logger.warn('[PilgrimageMapViewMode] save failed', err);
  }
  subscribers.forEach((fn) => {
    try {
      fn(next);
    } catch (err) {
      Logger.warn('[PilgrimageMapViewMode] subscriber threw', err);
    }
  });
}

export function subscribePilgrimageMapViewMode(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

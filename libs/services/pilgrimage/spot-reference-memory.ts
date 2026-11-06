// The last scene screenshot the user imported for each Atlas spot. Atlas has
// no scene images, so the camera reference is always the user's own import;
// remembering it per spot means coming back to the spot reopens the camera
// with the same reference instead of asking for it again.
import { kvGet, kvSet } from '../storage/app-storage';
import { SPOT_REFERENCES_STORAGE_KEY } from '../storage/keys';
import { isObject, safeJsonParse } from '../../utils/safe-json';

export interface SpotReference {
  uri: string;
  /** Pixel size of the saved copy; null when it was never measured. */
  width: number | null;
  height: number | null;
}

type SpotReferenceMap = Record<string, SpotReference>;

function isSpotReference(value: unknown): value is SpotReference {
  if (!isObject(value)) return false;
  const v = value as Record<string, unknown>;
  const dim = (d: unknown) => d === null || (typeof d === 'number' && d > 0);
  return typeof v.uri === 'string' && v.uri.length > 0 && dim(v.width) && dim(v.height);
}

function isSpotReferenceMap(value: unknown): value is SpotReferenceMap {
  return isObject(value) && Object.values(value as object).every(isSpotReference);
}

function load(): SpotReferenceMap {
  return safeJsonParse(kvGet(SPOT_REFERENCES_STORAGE_KEY), isSpotReferenceMap) ?? {};
}

function save(map: SpotReferenceMap): void {
  kvSet(SPOT_REFERENCES_STORAGE_KEY, JSON.stringify(map));
}

export function getRememberedSpotReference(spotId: string): SpotReference | null {
  return load()[spotId] ?? null;
}

/** Remember `reference` for `spotId`; returns the uri it replaced, if any. */
export function rememberSpotReference(spotId: string, reference: SpotReference): string | null {
  const map = load();
  const previous = map[spotId]?.uri ?? null;
  map[spotId] = reference;
  save(map);
  return previous === reference.uri ? null : previous;
}

export function forgetSpotReference(spotId: string): void {
  const map = load();
  if (!(spotId in map)) return;
  delete map[spotId];
  save(map);
}

export function isRememberedReference(uri: string): boolean {
  return Object.values(load()).some((ref) => ref.uri === uri);
}

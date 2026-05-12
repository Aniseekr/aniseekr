/**
 * Helpers for normalizing Expo Router params.
 *
 * `useLocalSearchParams()` returns `string | string[] | undefined` per key,
 * even when callers type the result as `{ foo: string }`. Reading the raw
 * value as a string crashes (or silently misbehaves) when the router hands
 * back an array (e.g. duplicate query keys) or `undefined` (deep link
 * without the key). Always go through these helpers.
 */

export type RouterParams = Record<string, string | string[] | undefined>;

export function getStringParam(params: RouterParams, key: string): string | null {
  const value = params[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string' && first.length > 0) return first;
  }
  return null;
}

export function getNumberParam(params: RouterParams, key: string): number | null {
  const raw = getStringParam(params, key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getBooleanParam(params: RouterParams, key: string): boolean | null {
  const raw = getStringParam(params, key);
  if (raw === null) return null;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

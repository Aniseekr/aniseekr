/**
 * Safe JSON parsing for storage payloads (AsyncStorage, SecureStore, query params).
 *
 * Raw `JSON.parse(...) as T` is unsafe — corrupt storage, version drift, or a
 * user-edited value can produce any shape. These helpers parse, validate, and
 * return `null` when the value isn't usable, so callers can fall back to a
 * default instead of crashing on the first property access.
 */

export type Guard<T> = (value: unknown) => value is T;

export function safeJsonParse<T>(raw: string | null | undefined, guard: Guard<T>): T | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return guard(parsed) ? parsed : null;
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export function isArrayOf<T>(guard: Guard<T>): Guard<T[]> {
  return (value: unknown): value is T[] => Array.isArray(value) && value.every(guard);
}

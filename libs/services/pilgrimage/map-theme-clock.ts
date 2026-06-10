// Time-of-day resolution for the pilgrimage map tile theme.
//
// Kept RN-free (no MMKV/storage imports) so it's unit-testable in isolation and
// so the screens stay thin. The map's 'auto' pref means "decide for me", so —
// like Google/Apple Maps — it goes dark at night even when the surrounding app
// is light. Explicit 'light'/'dark' picks are always honored as-is.

import type { MapThemePref } from './map-theme-prefs';

/** Local-clock night window: 18:00–05:59 inclusive. */
export function isMapNightHour(hour: number): boolean {
  return hour >= 18 || hour < 6;
}

/**
 * Resolve the binary tile mode from the user pref, the app's resolved theme and
 * the current local hour. Pure: the caller supplies the hour (no `Date` here) so
 * it's deterministic and testable.
 *
 * - 'light' / 'dark' → returned verbatim (explicit user choice wins).
 * - 'auto'           → dark when the app is dark OR it's night, else light.
 */
export function resolveMapModeWithClock(
  pref: MapThemePref,
  effectiveMode: 'light' | 'dark',
  hour: number
): 'light' | 'dark' {
  if (pref === 'auto') {
    return effectiveMode === 'dark' || isMapNightHour(hour) ? 'dark' : 'light';
  }
  return pref;
}

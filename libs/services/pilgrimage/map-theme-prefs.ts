// Per-feature override for the pilgrimage map's tile theme.
//
// Why this is independent of the global theme mode:
//   Most users want a Google-Maps-style light map even when the rest of the app
//   is dark — labels read better, photos pop more, and a black map next to a
//   black UI just feels like a missing tile flash. We default to 'light' here
//   and let users opt into 'dark' or 'auto' (follow app theme) from settings.
//
// The 3 map surfaces (PilgrimageMapView, hub fullscreen map, spot detail map)
// all subscribe to changes here so toggling the pref repaints in place — no
// WebView remount, no lost camera state, no tile-cache miss.
//
// Storage is its own AsyncStorage key (not folded into UserPrefs) so this
// module is self-contained and the maps don't need to depend on broader prefs.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Logger } from '../../utils/logger';

export const MAP_THEME_STORAGE_KEY = 'aniseekr.pilgrimage.mapTheme.v1';

/**
 * User-facing pilgrimage map theme override.
 * - 'light': force CARTO Voyager (warm Google-Maps-Light look)
 * - 'dark': force CARTO Dark Matter (lifted toward Google-Maps-Dark slate)
 * - 'auto': follow the global app theme via effectiveMode
 */
export type MapThemePref = 'light' | 'dark' | 'auto';

export const MAP_THEME_PREFS: readonly MapThemePref[] = ['light', 'dark', 'auto'] as const;

/** Default map is white — see file header for rationale. */
export const DEFAULT_MAP_THEME: MapThemePref = 'light';

/**
 * Collapse the user pref + the app's resolved theme into the binary mode the
 * tile picker / theme-vars builder expects. Pure function, trivially testable.
 */
export function resolveMapMode(
  pref: MapThemePref,
  effectiveMode: 'light' | 'dark',
): 'light' | 'dark' {
  if (pref === 'auto') return effectiveMode;
  return pref;
}

type Subscriber = (next: MapThemePref) => void;
const subscribers = new Set<Subscriber>();
let cachedPref: MapThemePref | null = null;

function isMapThemePref(value: unknown): value is MapThemePref {
  return value === 'light' || value === 'dark' || value === 'auto';
}

export async function loadMapThemePref(): Promise<MapThemePref> {
  if (cachedPref) return cachedPref;
  try {
    const raw = await AsyncStorage.getItem(MAP_THEME_STORAGE_KEY);
    if (raw && isMapThemePref(raw)) {
      cachedPref = raw;
      return raw;
    }
  } catch (err) {
    Logger.warn('[MapThemePref] load failed, using default', err);
  }
  cachedPref = DEFAULT_MAP_THEME;
  return DEFAULT_MAP_THEME;
}

export async function setMapThemePref(next: MapThemePref): Promise<void> {
  if (!isMapThemePref(next)) return;
  cachedPref = next;
  try {
    await AsyncStorage.setItem(MAP_THEME_STORAGE_KEY, next);
  } catch (err) {
    Logger.warn('[MapThemePref] save failed', err);
  }
  subscribers.forEach((fn) => {
    try {
      fn(next);
    } catch (err) {
      Logger.warn('[MapThemePref] subscriber threw', err);
    }
  });
}

export function subscribeMapThemePref(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Test-only — clear the in-memory cache so tests start clean. */
export function __resetMapThemePrefCacheForTests(): void {
  cachedPref = null;
}

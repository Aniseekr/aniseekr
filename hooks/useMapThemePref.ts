import { useEffect, useState } from 'react';
import {
  DEFAULT_MAP_THEME,
  loadMapThemePref,
  setMapThemePref,
  subscribeMapThemePref,
  type MapThemePref,
} from '../libs/services/pilgrimage/map-theme-prefs';

/**
 * React hook for the pilgrimage map theme override.
 *
 * Loads the persisted pref on mount and re-renders when any other surface
 * (the appearance settings screen, another mounted map) changes it via
 * `setMapThemePref`. Returning the setter directly from the hook keeps the
 * call site terse: `const [mapTheme, setMapTheme] = useMapThemePref();`.
 *
 * `hydrated` flips true on first load — map screens use it to skip pushing
 * a stale default into the WebView while the real value is still loading.
 */
export function useMapThemePref(): {
  pref: MapThemePref;
  hydrated: boolean;
  setPref: (next: MapThemePref) => Promise<void>;
} {
  const [pref, setPref] = useState<MapThemePref>(DEFAULT_MAP_THEME);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadMapThemePref().then((p) => {
      if (!mounted) return;
      setPref(p);
      setHydrated(true);
    });
    const unsub = subscribeMapThemePref((next) => {
      if (!mounted) return;
      setPref(next);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return { pref, hydrated, setPref: setMapThemePref };
}

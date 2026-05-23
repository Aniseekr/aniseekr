import { useEffect, useState } from 'react';
import { isMigrated } from '../libs/services/storage/app-storage';
import {
  loadMapThemePref,
  loadMapThemePrefSync,
  setMapThemePref,
  subscribeMapThemePref,
  type MapThemePref,
} from '../libs/services/pilgrimage/map-theme-prefs';

/**
 * React hook for the pilgrimage map theme override.
 *
 * The persisted pref is read synchronously from MMKV to seed initial state, so
 * a map screen can push the correct tile theme into its WebView on the first
 * frame. It re-renders when any other surface (the appearance settings screen,
 * another mounted map) changes it via `setMapThemePref`.
 *
 * `hydrated` is true immediately on a warm launch (the seed is authoritative);
 * it only starts false on the single launch after the AsyncStorage → MMKV
 * migration, flipping true once the migrated value has been applied.
 */
export function useMapThemePref(): {
  pref: MapThemePref;
  hydrated: boolean;
  setPref: (next: MapThemePref) => Promise<void>;
} {
  const [bootstrap] = useState(() => ({
    pref: loadMapThemePrefSync(),
    migrated: isMigrated(),
  }));
  const [pref, setPref] = useState<MapThemePref>(bootstrap.pref);
  const [hydrated, setHydrated] = useState(bootstrap.migrated);

  useEffect(() => {
    let mounted = true;
    // Warm launches are already correct from the synchronous seed; only the
    // post-migration launch needs the async reconcile. If migration finished
    // between the initializer and this effect, re-read once and mark hydrated.
    if (isMigrated()) {
      if (!bootstrap.migrated) {
        setPref(loadMapThemePrefSync());
        setHydrated(true);
      }
    } else {
      void loadMapThemePref().then((p) => {
        if (!mounted) return;
        setPref(p);
        setHydrated(true);
      });
    }
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

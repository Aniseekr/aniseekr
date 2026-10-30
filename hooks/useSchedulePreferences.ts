import { useCallback, useEffect, useState } from 'react';
import type { BangumiPreferences } from '../components/bangumi/BangumiSettingsSheet';
import {
  loadBangumiPrefs,
  loadBangumiPrefsSync,
  saveBangumiPrefs,
} from '../libs/services/bangumi-prefs';
import { loadUserPrefsSync, patchUserPrefs, subscribeUserPrefs } from '../libs/services/user-prefs';
import { trackingService } from '../libs/services/tracking/tracking-service';

export function useSchedulePreferences() {
  const [prefs, setPrefsState] = useState(loadBangumiPrefsSync);
  const [adult, setAdult] = useState(() => loadUserPrefsSync().allowAdultContent);
  const [tracking, setTracking] = useState(() => ({
    ids: trackingService.getTrackedIdSetSync(),
    error: false,
  }));
  const retryTracking = useCallback(() => {
    void trackingService.getTrackedIdSet().then(
      (ids) => setTracking({ ids, error: false }),
      (error) => {
        console.warn('[schedule] tracking load failed', error);
        setTracking((previous) => ({ ...previous, error: true }));
      }
    );
  }, []);
  useEffect(() => {
    let active = true;
    const unsubscribe = trackingService.onTrackedIdsChange((ids) => {
      if (active) setTracking({ ids, error: false });
    });
    const unsubscribePrefs = subscribeUserPrefs((next) => {
      if (active) setAdult(next.allowAdultContent);
    });
    retryTracking();
    // Keep the legacy adult preference promotion without delaying first paint.
    void loadBangumiPrefs().then(() => {
      if (active) setAdult(loadUserPrefsSync().allowAdultContent);
    });
    return () => {
      active = false;
      unsubscribe();
      unsubscribePrefs();
    };
  }, [retryTracking]);
  return {
    prefs,
    adult,
    trackedIds: tracking.ids ?? new Set<string>(),
    trackingReady: tracking.ids !== null,
    trackingError: tracking.error,
    retryTracking,
    setPrefs: (next: BangumiPreferences) => {
      setPrefsState(next);
      void saveBangumiPrefs(next);
    },
    setAdult: (next: boolean) => {
      void patchUserPrefs({ allowAdultContent: next }).catch((error) =>
        console.warn('[schedule] adult preference failed', error)
      );
    },
  };
}

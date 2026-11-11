import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { loadUserPrefsSync, subscribeUserPrefs } from '../libs/services/user-prefs';
import {
  ensureBangumiData,
  getBangumiDataVersion,
  subscribeBangumiData,
} from '../libs/services/streaming/bangumi-data';

/**
 * Re-render when the bangumi-data index (official watch pages + platform
 * release slots) loads or refreshes. Returns a version number for memo deps.
 */
export function useBangumiDataVersion(): number {
  useEffect(() => {
    void ensureBangumiData();
  }, []);
  return useSyncExternalStore(subscribeBangumiData, getBangumiDataVersion, getBangumiDataVersion);
}

/**
 * The user's watch platforms in priority order (primary first, then the rest
 * of their enabled list). Empty when they haven't picked any.
 */
export function useWatchPlatformOrder(): readonly string[] {
  const [prefs, setPrefs] = useState(() => loadUserPrefsSync().streamingPlatforms);
  useEffect(() => subscribeUserPrefs((p) => setPrefs(p.streamingPlatforms)), []);
  return useMemo(() => {
    const order = prefs.primary ? [prefs.primary] : [];
    for (const id of prefs.enabled) if (id !== prefs.primary) order.push(id);
    return order;
  }, [prefs]);
}

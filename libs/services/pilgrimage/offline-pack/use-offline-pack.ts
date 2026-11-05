// React bindings for offline trip packs: per-work status for the work page
// and the cache screen, and the style the map should load right now.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { atlasClient } from '../atlas/atlas-client';
import { DEFAULT_MAP_STYLE_URLS } from '../map-source-prefs';
import { packStatus, type PackStatus } from './pack-manifest';
import { offlinePackStore } from './offline-pack-store';
import { useConnectivity } from './connectivity';

export function useOfflinePackSnapshot() {
  return useSyncExternalStore(
    offlinePackStore.subscribe,
    offlinePackStore.getSnapshot,
    offlinePackStore.getSnapshot
  );
}

/**
 * Latest Atlas dataVersion, or null while unknown (offline / not loaded).
 * `meta()` answers from cache and revalidates in the background.
 */
export function useLatestAtlasVersion(enabled: boolean): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    atlasClient
      .meta()
      .then((meta) => {
        if (!cancelled) setVersion(meta.dataVersion);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return version;
}

export function useOfflinePackStatus(workKey: string | null): PackStatus {
  const snapshot = useOfflinePackSnapshot();
  const manifest = workKey ? (snapshot.manifests[workKey] ?? null) : null;
  const runtime = workKey ? (snapshot.runtime[workKey] ?? null) : null;
  const latest = useLatestAtlasVersion(manifest !== null);
  return packStatus(manifest, latest, runtime);
}

/**
 * The map loads the stored offline style when a pack exists and either the
 * user forced cached tiles (`offlineOnly`) or the probe says we are offline.
 * Otherwise it keeps the live style (MapLibre's ambient cache still applies).
 */
export function useOfflineAwareStyleUrl(styleUrl: string, offlineOnly: boolean): string {
  const snapshot = useOfflinePackSnapshot();
  const hasPack = Object.keys(snapshot.manifests).length > 0;
  const connectivity = useConnectivity(hasPack);
  if (!hasPack || (!offlineOnly && connectivity !== 'offline')) return styleUrl;
  const mode = styleUrl === DEFAULT_MAP_STYLE_URLS.dark ? 'dark' : 'light';
  return offlinePackStore.offlineStyleUri(mode) ?? styleUrl;
}

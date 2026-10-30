// usePilgrimageHubScreenData — data cluster for the pilgrimage hub list screen
// (app/(tabs)/pilgrimage/index.tsx). Mirrors usePilgrimageHubData (the map's
// sibling): owns the snapshot/offline-index seed, the collection + featured
// /lite backfill, MMKV-seeded visits, the location fix, and the
// nearest-spot lookup that follows it, so the route file stays a view
// orchestrator (CLAUDE.md Rule 9).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../libs/services/pilgrimage/collection-pilgrimage-service';
import { locationService, type LatLng } from '../libs/services/pilgrimage/location-service';
import { loadVisitedSpotsSync, type VisitedMap } from '../libs/services/pilgrimage/visited-prefs';
import {
  getPilgrimageHubSnapshot,
  updatePilgrimageHubSnapshot,
  PERSIST_TTL_MS as HUB_SNAPSHOT_PERSIST_TTL_MS,
  type PilgrimageHubSnapshot,
} from '../libs/services/pilgrimage/pilgrimage-hub-cache';
import { buildSeededPilgrimageAnimes } from '../libs/services/pilgrimage/pilgrimage-screen-state';
import { buildPilgrimageCollectionState } from '../libs/services/pilgrimage/pilgrimage-hub-collection-state';
import { getSpotIndexCount, getSpotsNear } from '../libs/services/pilgrimage/spot-index-service';
import type { NearbySpotHit } from '../libs/services/pilgrimage/spot-index';
import { resolveHomeNearbySpots } from '../libs/services/pilgrimage/home-nearby-spots';
import type { AnitabiBangumi } from '../libs/services/pilgrimage/types';
import { useT } from '../libs/i18n';
import { getUnique88AnimeByPopularity } from '../libs/services/pilgrimage/anime88-repository';

export interface UsePilgrimageHubScreenData {
  collectionAnimes: AnitabiBangumi[];
  featuredAnimes: AnitabiBangumi[];
  error: string | null;
  visited: VisitedMap; // MMKV-seeded, read-only this screen
  userLocation: LatLng | null;
  // Nearest single point-level spot for the hero card, resolved off
  // userLocation once a fix lands. Not in the original brief's interface —
  // added after P2-T8 introduced the effect in index.tsx; it's a direct
  // extension of the location-fix data flow this hook already owns, so it
  // moves in with the rest of the data cluster rather than staying screen-side.
  nearestSpot: NearbySpotHit | null;
  nearbyCount: number;
  nearbyPending: boolean;
  nearbyError: boolean;
  nearbyCoverage: 'known' | 'unknown';
  locationStatus: 'pending' | 'granted' | 'denied' | 'unavailable';
  locationCanAskAgain: boolean;
  requestLocation: () => Promise<void>;
  collectionWithSpots: AnitabiBangumi[];
  popularList: AnitabiBangumi[];
  tourism88Entries: ReturnType<typeof getUnique88AnimeByPopularity>;
}

function hasSnapshotSlice<K extends keyof PilgrimageHubSnapshot>(
  snapshot: PilgrimageHubSnapshot | null,
  key: K
): boolean {
  return !!snapshot && Object.prototype.hasOwnProperty.call(snapshot, key);
}

function buildSeededFeatured(): AnitabiBangumi[] {
  return buildSeededPilgrimageAnimes(FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId));
}

export function usePilgrimageHubScreenData(): UsePilgrimageHubScreenData {
  const t = useT();
  // Stale-while-revalidate: accept a persisted snapshot up to the 24h budget
  // it's written with, not the tighter 5-min default — a cold start after an
  // overnight-closed app should still paint collection/featured cards from
  // disk instead of dropping back to the bundled offline seed.
  const [initialSnapshot] = useState(() => getPilgrimageHubSnapshot(HUB_SNAPSHOT_PERSIST_TTL_MS));
  const hasInitialCollection = hasSnapshotSlice(initialSnapshot, 'collectionAnimes');
  const hasInitialFeatured = hasSnapshotSlice(initialSnapshot, 'featuredAnimes');
  const [collectionResolved, setCollectionResolved] = useState(hasInitialCollection);
  const [featuredResolved, setFeaturedResolved] = useState(hasInitialFeatured);

  const [collectionAnimes, setCollectionAnimes] = useState<AnitabiBangumi[]>(
    () => initialSnapshot?.collectionAnimes ?? []
  );
  // Seed featured from the bundled offline index so the rail renders on frame
  // 1 even on a fresh install (no SQLite cache yet). The HTTP fill-in below
  // upgrades each entry with `litePoints` as responses stream in. This is
  // what kills the 30s+ skeleton — first paint now happens in <100ms.
  const [featuredAnimes, setFeaturedAnimes] = useState<AnitabiBangumi[]>(() => {
    const cached = initialSnapshot?.featuredAnimes;
    if (cached && cached.length > 0) return cached;
    return buildSeededFeatured();
  });
  // Visits are seeded synchronously from live MMKV — never
  // from the snapshot slice, which can be up to 24h stale (persist TTL) and
  // would freeze the hub's progress behind a check-in the
  // user made on another screen after the snapshot was last written. Per-spot
  // toggles flow through their own atomic writers; this hook only re-reads
  // on focus below (mirrors plan.tsx's skip-first-focus re-seed).
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [userLocation, setUserLocation] = useState<LatLng | null>(
    () => initialSnapshot?.userLocation ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    'pending' | 'granted' | 'denied' | 'unavailable'
  >(() => (initialSnapshot?.userLocation ? 'granted' : 'pending'));
  const [locationCanAskAgain, setLocationCanAskAgain] = useState(true);

  const refreshCollectionAnimes = useCallback(
    async ({
      isActive = () => true,
      clearOnError = false,
    }: {
      isActive?: () => boolean;
      clearOnError?: boolean;
    } = {}): Promise<number | null> => {
      try {
        const entries = await collectionPilgrimageService.getEntries();
        if (!isActive()) return null;
        const { collectionAnimes: animes } = buildPilgrimageCollectionState(entries);
        setCollectionAnimes(animes);
        updatePilgrimageHubSnapshot({ collectionAnimes: animes });
        return animes.length;
      } catch (err: unknown) {
        if (!isActive()) return null;
        // Collection failures shouldn't block the hub — featured backfill is
        // enough to render something useful.
        console.warn('[PilgrimageHub] collection load failed:', err);
        if (clearOnError) setCollectionAnimes([]);
        return null;
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() =>
        refreshCollectionAnimes({
          isActive: () => !cancelled,
          clearOnError: !hasInitialCollection,
        })
      )
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCollectionResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hasInitialCollection, refreshCollectionAnimes]);

  const focusRefreshSeenRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusRefreshSeenRef.current) {
        focusRefreshSeenRef.current = true;
        return;
      }
      // Screens pushed on top can change visits in MMKV while the hub stays
      // mounted underneath — re-seed on every focus after the first so
      // returning here shows current state instead of the value frozen at
      // mount (mirrors plan.tsx).
      setVisited(loadVisitedSpotsSync());
      let active = true;
      refreshCollectionAnimes({
        isActive: () => active,
      }).catch(() => undefined);
      return () => {
        active = false;
      };
    }, [refreshCollectionAnimes])
  );

  useEffect(() => {
    let cancelled = false;

    // Stream the per-anime `/lite` responses in instead of waiting for all
    // ~30 to settle. The seeded list is rendered first; each successful HTTP
    // response merges its richer payload (mainly `litePoints`) into state.
    // setState calls are coalesced via a 200ms batch window so we don't
    // re-run `allSpots` 30 times in a row on a cold install.
    const ids = FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId);
    const pending: AnitabiBangumi[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const commit = () => {
      flushTimer = null;
      if (cancelled || pending.length === 0) return;
      const batch = pending.splice(0);
      setFeaturedAnimes((current) => {
        const byId = new Map(current.map((a) => [a.id, a] as const));
        for (const fresh of batch) byId.set(fresh.id, fresh);
        const merged = Array.from(byId.values()).sort(
          (a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0)
        );
        updatePilgrimageHubSnapshot({ featuredAnimes: merged });
        return merged;
      });
    };

    const scheduleCommit = () => {
      if (flushTimer != null) return;
      flushTimer = setTimeout(commit, 200);
    };

    let remaining = ids.length;
    let anySuccess = false;
    for (const id of ids) {
      pilgrimageRepository
        .getSpotsByBangumiId(id)
        .then((anime) => {
          if (cancelled) return;
          if (anime) {
            anySuccess = true;
            pending.push(anime);
            scheduleCommit();
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // Per-anime failures are common (404, transient network) — don't
          // surface them, just leave the seeded card alone.
          console.warn('[PilgrimageHub] featured fetch failed:', id, err);
        })
        .finally(() => {
          if (cancelled) return;
          remaining -= 1;
          if (remaining === 0) {
            if (flushTimer != null) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            commit();
            // Only show the network error when we had no seeded fallback AND
            // every request failed; otherwise the user already sees cards.
            if (!anySuccess && !hasInitialFeatured && featuredAnimes.length === 0) {
              setError(t('tabs.pilgrimageScreen.errorLoadFailed'));
            } else {
              setError(null);
            }
            setFeaturedResolved(true);
          }
        });
    }

    return () => {
      cancelled = true;
      if (flushTimer != null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };
    // featuredAnimes intentionally excluded — only read at error time and the
    // value at effect-mount is what we want there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInitialFeatured]);

  // Visits are seeded synchronously above from MMKV; no
  // async reconcile needed. The snapshot is also primed from those seeds.
  useEffect(() => {
    updatePilgrimageHubSnapshot({ visited });
    // Only fires once on first mount — `visited` is the seed value and
    // doesn't change here. Per-spot toggles flow through their own writers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshLocation = useCallback(async () => {
    const permission = await locationService.getPermission();
    setLocationCanAskAgain(permission.canAskAgain);
    if (permission.status !== 'granted') {
      setLocationStatus(permission.status);
      setUserLocation(null);
      return;
    }
    setLocationStatus(initialSnapshot?.userLocation ? 'granted' : 'pending');
    const loc = await locationService.getCurrentLocation();
    if (!loc) {
      setLocationStatus('unavailable');
      setUserLocation(null);
      return;
    }
    setUserLocation(loc);
    setLocationStatus('granted');
    updatePilgrimageHubSnapshot({ userLocation: loc });
  }, [initialSnapshot]);

  useEffect(() => {
    refreshLocation().catch(() => setLocationStatus('unavailable'));
  }, [refreshLocation]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshLocation().catch(() => setLocationStatus('unavailable'));
      }
    });
    return () => subscription.remove();
  }, [refreshLocation]);

  const requestLocation = useCallback(async () => {
    if (await locationService.requestPermission()) await refreshLocation();
    else {
      const permission = await locationService.getPermission();
      setLocationCanAskAgain(permission.canAskAgain);
      setLocationStatus(permission.status);
    }
  }, [refreshLocation]);

  // SQLite's spot index starts empty on a fresh install. The visible nearest
  // spot also considers real litePoints from collection/featured data; an
  // unpopulated index cannot support a "nothing within 50 km" claim.
  const locationKey = userLocation ? `${userLocation.latitude},${userLocation.longitude}` : null;
  const [indexedNearby, setIndexedNearby] = useState<{
    key: string;
    count: number | null;
    nearest: NearbySpotHit | null;
    within3Km: NearbySpotHit[];
    error: boolean;
  } | null>(null);
  const currentIndex = indexedNearby?.key === locationKey ? indexedNearby : null;
  const nearbyPending = Boolean(userLocation && !currentIndex);
  const nearbyError = currentIndex?.error ?? false;
  const nearby = useMemo(
    () =>
      userLocation
        ? resolveHomeNearbySpots({
            userLocation,
            animes: [...collectionAnimes, ...featuredAnimes],
            indexNearest: currentIndex?.nearest ?? null,
            indexWithin3Km: currentIndex?.within3Km ?? [],
            indexCount: currentIndex?.count ?? null,
          })
        : { nearestSpot: null, nearbyCount: 0, coverage: 'unknown' as const },
    [userLocation, collectionAnimes, featuredAnimes, currentIndex]
  );
  useEffect(() => {
    if (!userLocation || !locationKey) return;
    let active = true;
    getSpotIndexCount()
      .then(async (count) => {
        if (count === 0) return { count, nearest: null, within3Km: [] };
        const [hits, within3Km] = await Promise.all([
          getSpotsNear(userLocation, 50, 1),
          getSpotsNear(userLocation, 3, 0),
        ]);
        return { count, nearest: hits[0] ?? null, within3Km };
      })
      .then((result) => {
        if (active) setIndexedNearby({ key: locationKey, ...result, error: false });
      })
      .catch(() => {
        if (active)
          setIndexedNearby({
            key: locationKey,
            count: null,
            nearest: null,
            within3Km: [],
            error: true,
          });
      });
    return () => {
      active = false;
    };
  }, [userLocation, locationKey]);

  const collectionWithSpots = useMemo(
    () => collectionAnimes.filter((anime) => anime.pointsLength > 0),
    [collectionAnimes]
  );
  const popularList = useMemo(() => {
    const collectionIds = new Set(collectionAnimes.map((anime) => anime.id));
    return featuredAnimes.filter((anime) => anime.pointsLength > 0 && !collectionIds.has(anime.id));
  }, [collectionAnimes, featuredAnimes]);
  const tourism88Entries = useMemo(() => getUnique88AnimeByPopularity(), []);

  return {
    collectionAnimes,
    featuredAnimes,
    error,
    visited,
    userLocation,
    nearestSpot: nearby.nearestSpot,
    nearbyCount: nearby.nearbyCount,
    nearbyPending,
    nearbyError,
    nearbyCoverage: collectionResolved && featuredResolved ? nearby.coverage : 'unknown',
    locationStatus,
    locationCanAskAgain,
    requestLocation,
    collectionWithSpots,
    popularList,
    tourism88Entries,
  };
}

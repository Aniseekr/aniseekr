import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import worksSnapshot from '../libs/services/pilgrimage/atlas/works.snapshot.json';
import type { AtlasWork, AtlasWorkIndex } from '../libs/services/pilgrimage/atlas/types';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../libs/services/pilgrimage/featured-anime';
import { LocalDB } from '../libs/db';
import { dataSourceConfig } from '../libs/services/data-source-config';
import { locationService, type LatLng } from '../libs/services/pilgrimage/location-service';
import { loadVisitedSpotsSync, type VisitedMap } from '../libs/services/pilgrimage/visited-prefs';
import { getSpotIndexCount, getSpotsNear } from '../libs/services/pilgrimage/spot-index-service';
import type { NearbySpotHit } from '../libs/services/pilgrimage/spot-index';
import { resolveHomeNearbySpots } from '../libs/services/pilgrimage/home-nearby-spots';
import type { PilgrimageWork } from '../libs/services/pilgrimage/types';
import { useT } from '../libs/i18n';
import { getUnique88AnimeByPopularity } from '../libs/services/pilgrimage/anime88-repository';

const atlasIndex = worksSnapshot as AtlasWorkIndex;
const featuredIds = FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId);

export interface UsePilgrimageHubScreenData {
  collectionAnimes: PilgrimageWork[];
  featuredAnimes: PilgrimageWork[];
  error: string | null;
  visited: VisitedMap;
  userLocation: LatLng | null;
  nearestSpot: NearbySpotHit | null;
  nearbySpots: NearbySpotHit[];
  nearbyCount: number;
  nearbyPending: boolean;
  nearbyError: boolean;
  nearbyCoverage: 'known' | 'unknown';
  locationStatus: 'pending' | 'granted' | 'denied' | 'unavailable';
  locationCanAskAgain: boolean;
  requestLocation: () => Promise<void>;
  collectionWithSpots: PilgrimageWork[];
  popularList: PilgrimageWork[];
  allWorks: PilgrimageWork[];
  tourism88Entries: ReturnType<typeof getUnique88AnimeByPopularity>;
}

export function usePilgrimageHubScreenData(): UsePilgrimageHubScreenData {
  const t = useT();
  const [collectionAnimes, setCollectionAnimes] = useState<PilgrimageWork[]>([]);
  const [featuredAnimes, setFeaturedAnimes] = useState<PilgrimageWork[]>(() =>
    seedWorks(featuredIds)
  );
  const [allWorks, setAllWorks] = useState<PilgrimageWork[]>(() => seedWorks(atlasIndex.works));
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [locationStatus, setLocationStatus] =
    useState<UsePilgrimageHubScreenData['locationStatus']>('pending');
  const [locationCanAskAgain, setLocationCanAskAgain] = useState(true);
  const [indexCount, setIndexCount] = useState<number | null>(null);
  const [nearby, setNearby] = useState<{
    key: string;
    nearest: NearbySpotHit | null;
    within: NearbySpotHit[];
    error: boolean;
  } | null>(null);

  const refreshCollection = useCallback(async () => {
    const db = await LocalDB.getDatabase();
    const entries = await db.getAllAsync<{ anime_id: string }>(
      `SELECT anime_id FROM user_anime
       UNION
       SELECT id AS anime_id FROM favorites`
    );
    const ids = [...new Set(entries.map((entry) => entry.anime_id))];
    const works = await Promise.all(
      ids.map((id) =>
        pilgrimageRepository
          .getSpotsForAnime({
            sourcePlatform: dataSourceConfig.browseSource,
            id,
          })
          .catch(() => null)
      )
    );
    const resolved = works.filter((work): work is PilgrimageWork => work !== null);
    setCollectionAnimes(resolved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void pilgrimageRepository
      .getWorksIndex()
      .then((works) => {
        if (!cancelled) setAllWorks(works.map((row) => seedWork(row, atlasIndex.dataVersion)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshCollection().catch(() => {
      if (!cancelled) setError(t('tabs.pilgrimageScreen.errorLoadFailed'));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshCollection, t]);

  useEffect(() => {
    let cancelled = false;
    for (const id of featuredIds) {
      pilgrimageRepository
        .getSpotsByBangumiId(id)
        .then((work) => {
          if (!cancelled && work) {
            setFeaturedAnimes((current) => mergeWorks(current, [work]));
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshLocation = useCallback(async () => {
    const permission = await locationService.getPermission();
    setLocationCanAskAgain(permission.canAskAgain);
    if (permission.status !== 'granted') {
      setLocationStatus(permission.status);
      setUserLocation(null);
      return;
    }
    const location = await locationService.getCurrentLocation();
    if (!location) {
      setLocationStatus('unavailable');
      setUserLocation(null);
      return;
    }
    setUserLocation(location);
    setLocationStatus('granted');
  }, []);

  useEffect(() => {
    void refreshLocation().catch(() => setLocationStatus('unavailable'));
  }, [refreshLocation]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshLocation().catch(() => setLocationStatus('unavailable'));
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

  const locationKey = userLocation ? `${userLocation.latitude},${userLocation.longitude}` : null;
  useEffect(() => {
    let active = true;
    void getSpotIndexCount()
      .then(async (count) => {
        if (active) setIndexCount(count);
        if (!userLocation || !locationKey) return { nearest: null, within: [] as NearbySpotHit[] };
        const [nearest, within] = await Promise.all([
          getSpotsNear(userLocation, 50, 1),
          getSpotsNear(userLocation, 3, 0),
        ]);
        return { nearest: nearest[0] ?? null, within };
      })
      .then((result) => {
        if (active && locationKey) setNearby({ key: locationKey, ...result, error: false });
      })
      .catch(() => {
        if (active && locationKey)
          setNearby({ key: locationKey, nearest: null, within: [], error: true });
      });
    return () => {
      active = false;
    };
  }, [userLocation, locationKey]);

  useFocusEffect(
    useCallback(() => {
      setVisited(loadVisitedSpotsSync());
      void refreshCollection().catch(() => undefined);
    }, [refreshCollection])
  );

  const currentNearby = locationKey && nearby?.key === locationKey ? nearby : null;
  const resolvedNearby = useMemo(
    () =>
      userLocation
        ? resolveHomeNearbySpots({
            userLocation,
            animes: [...collectionAnimes, ...featuredAnimes],
            indexNearest: currentNearby?.nearest ?? null,
            indexWithin3Km: currentNearby?.within ?? [],
            indexCount,
          })
        : { nearestSpot: null, nearbySpots: [], nearbyCount: 0, coverage: 'unknown' as const },
    [userLocation, collectionAnimes, featuredAnimes, currentNearby, indexCount]
  );

  return {
    collectionAnimes,
    featuredAnimes,
    error,
    visited,
    userLocation,
    nearestSpot: resolvedNearby.nearestSpot,
    nearbySpots: resolvedNearby.nearbySpots,
    nearbyCount: resolvedNearby.nearbyCount,
    nearbyPending: Boolean(userLocation && !currentNearby),
    nearbyError: currentNearby?.error ?? false,
    nearbyCoverage: resolvedNearby.coverage,
    locationStatus,
    locationCanAskAgain,
    requestLocation,
    collectionWithSpots: collectionAnimes.filter((work) => work.n > 0),
    popularList: allWorks.filter((work) => work.n > 0).sort((a, b) => b.n - a.n),
    allWorks,
    tourism88Entries: getUnique88AnimeByPopularity(),
  };
}

function mergeWorks(
  current: readonly PilgrimageWork[],
  incoming: readonly PilgrimageWork[]
): PilgrimageWork[] {
  const byKey = new Map(current.map((work) => [work.key, work] as const));
  for (const work of incoming) byKey.set(work.key, work);
  return [...byKey.values()].sort((a, b) => b.n - a.n);
}

function seedWorks(rowsOrBgmIds: readonly AtlasWork[] | readonly number[]): PilgrimageWork[] {
  const rows =
    typeof rowsOrBgmIds[0] === 'number'
      ? atlasIndex.works.filter((row) =>
          (row.bgm ?? []).some((id) => (rowsOrBgmIds as readonly number[]).includes(id))
        )
      : (rowsOrBgmIds as readonly AtlasWork[]);
  return rows.map((row) => seedWork(row, atlasIndex.dataVersion));
}

function seedWork(row: AtlasWork, dataVersion?: string): PilgrimageWork {
  return {
    ...row,
    dataVersion: dataVersion ?? '20261104-6584d5e',
    titleJa: row.ja,
    titleEn: row.en ?? '',
    titleZh: row.zh ?? undefined,
    spots: [],
  };
}

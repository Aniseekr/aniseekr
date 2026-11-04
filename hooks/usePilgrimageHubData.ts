import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import worksSnapshot from '../libs/services/pilgrimage/atlas/works.snapshot.json';
import { atlasClient } from '../libs/services/pilgrimage/atlas/atlas-client';
import type { AtlasWorkIndex } from '../libs/services/pilgrimage/atlas/types';
import type { BBox } from '../libs/services/pilgrimage/map-engine/types';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../libs/services/pilgrimage/featured-anime';
import { LocalDB } from '../libs/db';
import { dataSourceConfig } from '../libs/services/data-source-config';
import type { LatLng } from '../libs/services/pilgrimage/location-service';
import { loadVisitedSpotsSync, type VisitedMap } from '../libs/services/pilgrimage/visited-prefs';
import { loadCapturesSync } from '../libs/services/pilgrimage/captures';
import type { PilgrimageWork } from '../libs/services/pilgrimage/types';

const index = worksSnapshot as AtlasWorkIndex;
const featuredIds = FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId);

export interface UsePilgrimageHubDataParams {
  focusBangumiId: number | null;
  userLocation: LatLng | null;
}

export interface UsePilgrimageHubData {
  animes: PilgrimageWork[];
  knownAnimes: PilgrimageWork[];
  collectionIds: Set<number>;
  extraIndexed: Map<string, PilgrimageWork>;
  loading: boolean;
  visited: VisitedMap;
  captureCount: number;
  handleBoundsChange: (bounds: BBox) => void;
}

export function usePilgrimageHubData({ focusBangumiId, userLocation }: UsePilgrimageHubDataParams): UsePilgrimageHubData {
  const initial = useMemo(
    () => seedWorks(focusBangumiId === null ? featuredIds : [focusBangumiId, ...featuredIds]),
    [focusBangumiId]
  );
  const [animes, setAnimes] = useState<PilgrimageWork[]>(initial);
  const [extraIndexed, setExtraIndexed] = useState<Map<string, PilgrimageWork>>(() => new Map());
  const extraRef = useRef(extraIndexed);
  const loadedKeys = useRef(new Set<string>());
  const [collectionIds, setCollectionIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(initial.length === 0);
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [captureCount] = useState(() => Object.keys(loadCapturesSync()).length);
  extraRef.current = extraIndexed;

  const refreshCollection = useCallback(async () => {
    const db = await LocalDB.getDatabase();
    const entries = await db.getAllAsync<{ anime_id: string }>(
      `SELECT anime_id FROM user_anime
       UNION
       SELECT id AS anime_id FROM favorites`
    );
    const ids = [...new Set(entries.map((entry) => entry.anime_id))];
    const resolved = (await Promise.all(ids.map((id) => pilgrimageRepository.getSpotsForAnime({
      sourcePlatform: dataSourceConfig.browseSource,
      id,
    }).catch(() => null))))
      .filter((work): work is PilgrimageWork => work !== null);
    setCollectionIds(new Set(resolved.flatMap((work) => work.bgm ?? [])));
    setAnimes((current) => mergeWorks(current, resolved));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshCollection().catch((error: unknown) => console.warn('[PilgrimageMap] collection load failed:', error))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshCollection]);

  useEffect(() => {
    let cancelled = false;
    const requestedIds = focusBangumiId === null ? featuredIds : [focusBangumiId, ...featuredIds];
    for (const id of requestedIds) {
      void pilgrimageRepository.getSpotsByBangumiId(id).then((work) => {
        if (!cancelled && work) setAnimes((current) => mergeWorks(current, [work]));
      }).catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [focusBangumiId]);

  useFocusEffect(useCallback(() => {
    setVisited(loadVisitedSpotsSync());
    void refreshCollection().catch(() => undefined);
  }, [refreshCollection]));

  const handleBoundsChange = useCallback((bounds: BBox) => {
    void atlasClient.spotsLite().then(async ({ rows }) => {
      const visibleKeys = new Set(rows
        .filter((row) => row[3] >= bounds.south && row[3] <= bounds.north && row[4] >= bounds.west && row[4] <= bounds.east)
        .map((row) => row[1]));
      const rowsByKey = new Map(index.works.map((row) => [row.key, row] as const));
      const newKeys = [...visibleKeys].filter((key) => !loadedKeys.current.has(key));
      newKeys.forEach((key) => loadedKeys.current.add(key));
      const works = await Promise.all(newKeys.map(async (key) => {
        const row = rowsByKey.get(key);
        const bgmId = row?.bgm?.[0];
        return bgmId ? pilgrimageRepository.getSpotsByBangumiId(bgmId).catch(() => null) : null;
      }));
      const resolved = works.filter((work): work is PilgrimageWork => work !== null);
      if (!resolved.length) return;
      const next = new Map(extraRef.current);
      for (const work of resolved) next.set(work.key, work);
      extraRef.current = next;
      setExtraIndexed(next);
    }).catch((error: unknown) => console.warn('[PilgrimageMap] Atlas bounds load failed:', error));
  }, []);

  const knownAnimes = useMemo(() => mergeWorks(animes, [...extraIndexed.values()]), [animes, extraIndexed]);
  return { animes, knownAnimes, collectionIds, extraIndexed, loading, visited, captureCount, handleBoundsChange };
}

function seedWorks(bgmIds: readonly number[]): PilgrimageWork[] {
  return index.works.filter((row) => (row.bgm ?? []).some((id) => bgmIds.includes(id))).map((row) => ({
    ...row,
    dataVersion: index.dataVersion ?? '20261104-6584d5e',
    titleJa: row.ja,
    titleEn: row.en ?? '',
    titleZh: row.zh ?? undefined,
    spots: [],
  }));
}

function mergeWorks(current: readonly PilgrimageWork[], incoming: readonly PilgrimageWork[]): PilgrimageWork[] {
  const byKey = new Map(current.map((work) => [work.key, work] as const));
  for (const work of incoming) byKey.set(work.key, work);
  return [...byKey.values()].sort((a, b) => b.n - a.n);
}

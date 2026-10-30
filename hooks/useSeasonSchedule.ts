import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Anime } from '../components/rate/types';
import { AnimeRepository, unifiedToLegacyAnime } from '../libs/repositories/anime-repository';
import { dataSourceConfig } from '../libs/services/data-source-config';
import { dedupeById } from '../libs/services/bangumi/schedule';
import type { Season } from '../libs/utils/season-utils';

type Snapshot = { rawAnime: Anime[]; sourcePlatform: string };
type State = Snapshot & {
  key: string;
  status: 'loading' | 'ready' | 'error';
  refreshing: boolean;
};
const seasonSnapshots = new Map<string, Snapshot>();
const snapshotKey = (season: Season, year: number, source: string, adult: boolean) =>
  `${season}_${year}_${source}_${adult}`;
function seed(key: string): State {
  const snapshot = seasonSnapshots.get(key);
  return {
    key,
    rawAnime: snapshot?.rawAnime ?? [],
    sourcePlatform: snapshot?.sourcePlatform ?? dataSourceConfig.browseSource,
    status: snapshot ? 'ready' : 'loading',
    refreshing: false,
  };
}
function reducer(state: State, action: Partial<State> & { key: string }): State {
  return { ...(state.key === action.key ? state : seed(action.key)), ...action };
}

export function useSeasonSchedule(season: Season, year: number, adult: boolean) {
  const key = snapshotKey(season, year, dataSourceConfig.browseSource, adult);
  const [state, dispatch] = useReducer(reducer, key, seed);
  // Switching seasons paints that season's snapshot in the same render.
  const visible = state.key === key ? state : seed(key);
  const fetchVersionRef = useRef(0);
  const lastLoadedKey = useRef<string | null>(null);
  const fetchSeason = useCallback(
    async (forceRefresh: boolean) => {
      const source = dataSourceConfig.browseSource;
      const requestKey = snapshotKey(season, year, source, adult);
      const version = ++fetchVersionRef.current;
      lastLoadedKey.current = requestKey;
      const snapshot = seasonSnapshots.get(requestKey);
      if (forceRefresh) dispatch({ key: requestKey, refreshing: true });
      else dispatch(seed(requestKey));
      let acc: Anime[] = [];
      try {
        const fetched = await AnimeRepository.defaultInstance().fetchSeasonalAnimeBatched(
          season,
          year,
          {
            perPage: 50,
            maxItems: 200,
            forceRefresh,
            onPageReceived:
              !forceRefresh && !snapshot
                ? (items) => {
                    if (version !== fetchVersionRef.current) return;
                    acc = dedupeById([...acc, ...items.map(unifiedToLegacyAnime)]);
                    dispatch({ key: requestKey, rawAnime: acc, status: 'loading' });
                  }
                : undefined,
          }
        );
        if (version !== fetchVersionRef.current) return;
        const fresh = {
          rawAnime: dedupeById(fetched.map(unifiedToLegacyAnime)),
          sourcePlatform: source,
        };
        seasonSnapshots.set(requestKey, fresh);
        dispatch({ key: requestKey, ...fresh, status: 'ready', refreshing: false });
      } catch (error) {
        if (version !== fetchVersionRef.current) return;
        console.warn('[schedule] season fetch failed', error);
        dispatch({ key: requestKey, status: 'error', refreshing: false });
      }
    },
    [season, year, adult]
  );
  useEffect(() => {
    void fetchSeason(false);
    const versionRef = fetchVersionRef;
    return () => {
      versionRef.current++;
    };
  }, [fetchSeason]);
  useFocusEffect(
    useCallback(() => {
      const currentKey = snapshotKey(season, year, dataSourceConfig.browseSource, adult);
      if (lastLoadedKey.current !== currentKey) void fetchSeason(false);
    }, [season, year, adult, fetchSeason])
  );
  return { ...visible, refresh: () => fetchSeason(true) };
}

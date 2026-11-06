import { useCallback, useEffect, useRef, useState } from 'react';
import { PersonalizedPickState } from './types';
import { AnimeRepository } from '../../libs/repositories/anime-repository';
import { pickPersonalized } from '../../libs/services/recommendation/personalized-pick';

export type Resource<T> = { data: T[]; status: 'loading' | 'ready' | 'error' };

function useResource<T>(readSync: () => T[] | null, fetchData: (force: boolean) => Promise<T[]>) {
  const [resource, setResource] = useState<Resource<T>>(() => {
    const cached = readSync();
    return { data: cached ?? [], status: cached === null ? 'loading' : 'ready' };
  });
  const request = useRef(0);
  const load = useCallback(
    async (force = false) => {
      const id = ++request.current;
      setResource((prev) =>
        prev.status === 'ready' || prev.data.length > 0
          ? { ...prev, status: 'ready' }
          : { ...prev, status: 'loading' }
      );
      try {
        const data = await fetchData(force);
        if (id === request.current) setResource({ data, status: 'ready' });
      } catch {
        if (id === request.current)
          setResource((prev) => ({
            ...prev,
            status: prev.status === 'ready' || prev.data.length > 0 ? 'ready' : 'error',
          }));
      }
    },
    [fetchData]
  );
  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load]);
  return { ...resource, load };
}

const readGenres = () => AnimeRepository.getGenresSync();
const readSeasonal = () => AnimeRepository.getSeasonalAnimeSync();
const readWeekly = () => AnimeRepository.getTrendingAnimeSync();
const fetchGenres = (force: boolean) => AnimeRepository.getGenres(force);
const fetchSeasonal = (force: boolean) =>
  AnimeRepository.getSeasonalAnime(undefined, undefined, 1, { forceRefresh: force });
const fetchWeekly = (force: boolean) => AnimeRepository.getTrendingAnime(1, 20, force);

export function useRateData() {
  const genres = useResource(readGenres, fetchGenres);
  const seasonal = useResource(readSeasonal, fetchSeasonal);
  const weeklyTrend = useResource(readWeekly, fetchWeekly);
  const [personalizedPick, setPersonalizedPick] = useState<PersonalizedPickState>({
    status: 'idle',
    anime: null,
    reason: null,
    sourceTitles: [],
    matchedTags: [],
  });

  const loadPersonalizedPick = useCallback(async () => {
    setPersonalizedPick((prev) => ({ ...prev, status: 'loading' }));
    try {
      const outcome = await pickPersonalized();
      if (outcome.kind === 'cold-start') {
        setPersonalizedPick({
          status: 'cold-start',
          anime: null,
          reason: null,
          sourceTitles: [],
          matchedTags: [],
        });
        return;
      }
      if (outcome.kind === 'no-match') {
        setPersonalizedPick({
          status: 'no-match',
          anime: null,
          reason: null,
          sourceTitles: [],
          matchedTags: [],
        });
        return;
      }
      setPersonalizedPick({
        status: 'ready',
        anime: outcome.payload.anime,
        reason: outcome.payload.reason,
        sourceTitles: outcome.payload.sourceTitles,
        matchedTags: outcome.payload.matchedTags,
      });
    } catch (error) {
      console.error('Failed to load personalized pick:', error);
      setPersonalizedPick({
        status: 'error',
        anime: null,
        reason: null,
        sourceTitles: [],
        matchedTags: [],
      });
    }
  }, []);

  return {
    state: { genres, seasonal, weeklyTrend, personalizedPick },
    actions: {
      loadGenres: genres.load,
      loadSeasonal: seasonal.load,
      loadWeeklyTrend: weeklyTrend.load,
      loadPersonalizedPick,
    },
  };
}

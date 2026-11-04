// usePilgrimageDetailData — fetches the series + per-subject detailed points
// for the pilgrimage detail screen and owns the data-source `browseSource`
// toggle. Used to live as a `useReducer` + two `useEffect` inside the route
// file; moving it here turns the route into a thin orchestrator.

import { useCallback, useEffect, useReducer, useState } from 'react';
import { dataSourceConfig } from '../libs/services/data-source-config';
import type { PlatformType } from '../libs/services/auth/types';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import type { AnimeAtlasContext } from '../libs/services/pilgrimage/atlas/atlas-resolver';
import { getPilgrimageAnimeTitles } from '../libs/services/pilgrimage/pilgrimage-localization';
import {
  resolvePilgrimageSeries,
  type PilgrimageSeriesEntry,
  type PilgrimageSeriesPoint,
} from '../libs/services/pilgrimage/pilgrimage-series';

export interface DetailLoadState {
  seriesEntries: readonly PilgrimageSeriesEntry[];
  loading: boolean;
  error: string | null;
  /** True when the Bangumi relations couldn't be fetched, so the series list
   *  may be incomplete. Drives an honest in-header warning (vs. silently
   *  showing one season as the whole work). */
  seriesDegraded: boolean;
}

export type DetailLoadAction =
  | { type: 'loading' }
  | { type: 'invalid_id' }
  | { type: 'empty' }
  | { type: 'series_loaded'; entries: readonly PilgrimageSeriesEntry[]; degraded: boolean }
  | {
      type: 'detailed_points_loaded';
      subjectId: number;
      points: readonly PilgrimageSeriesPoint[];
    }
  | {
      type: 'series_full_loaded';
      entries: readonly PilgrimageSeriesEntry[];
      degraded: boolean;
    }
  | { type: 'error'; message: string };

export const INITIAL_DETAIL_LOAD_STATE: DetailLoadState = {
  seriesEntries: [],
  loading: true,
  error: null,
  seriesDegraded: false,
};

export function detailLoadReducer(
  state: DetailLoadState,
  action: DetailLoadAction
): DetailLoadState {
  switch (action.type) {
    case 'loading':
      return state.loading && state.error === null && !state.seriesDegraded
        ? state
        : { ...state, loading: true, error: null, seriesDegraded: false };
    case 'invalid_id':
      return state.error === 'Invalid anime id' && !state.loading
        ? state
        : { ...state, loading: false, error: 'Invalid anime id', seriesDegraded: false };
    case 'empty':
      return state.seriesEntries.length === 0 &&
        !state.loading &&
        state.error === null &&
        !state.seriesDegraded
        ? state
        : { seriesEntries: [], loading: false, error: null, seriesDegraded: false };
    case 'series_loaded':
      return {
        seriesEntries: action.entries,
        loading: false,
        error: null,
        seriesDegraded: action.degraded,
      };
    case 'detailed_points_loaded':
      return {
        ...state,
        seriesEntries: state.seriesEntries.map((entry) =>
          entry.subject.id === action.subjectId ? { ...entry, points: action.points } : entry
        ),
      };
    case 'series_full_loaded':
      // Phase 4: collapse a fan-out of detailed_points_loaded into one
      // dispatch so we render the merged tree once instead of N times.
      return {
        seriesEntries: action.entries,
        loading: false,
        error: null,
        seriesDegraded: action.degraded,
      };
    case 'error':
      return state.error === action.message && !state.loading
        ? state
        : { ...state, loading: false, error: action.message };
    default:
      return state;
  }
}

export interface UsePilgrimageDetailDataResult {
  seriesEntries: readonly PilgrimageSeriesEntry[];
  loading: boolean;
  error: string | null;
  /** Bangumi relations couldn't be fetched — the series list may be missing
   *  seasons. Surface a warning + retry rather than failing silently. */
  seriesDegraded: boolean;
  browseSource: PlatformType;
  /** Re-run the series fetch (e.g. from the degradation warning's retry). */
  reload: () => void;
}

/**
 * Loads the pilgrimage series + per-subject detailed points and exposes the
 * data-source's `browseSource` preference. `onSeriesLoaded` fires after the
 * initial lite fetch so the caller can reset its view state (e.g. series
 * selection back to 'all').
 */
export function usePilgrimageDetailData(
  bangumiId: number | null,
  onSeriesLoaded?: () => void,
  atlasContext?: AnimeAtlasContext,
  workKey?: string | null
): UsePilgrimageDetailDataResult {
  const [state, dispatch] = useReducer(detailLoadReducer, INITIAL_DETAIL_LOAD_STATE);
  const [browseSource, setBrowseSource] = useState<PlatformType>(dataSourceConfig.browseSource);
  // Bumped by `reload()` to re-trigger the fetch effect (manual retry from the
  // degradation warning, which the bangumiId-keyed effect wouldn't otherwise pick up).
  const [reloadNonce, setReloadNonce] = useState(0);
  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if ((bangumiId === null || bangumiId <= 0) && !atlasContext && !workKey) {
      dispatch({ type: 'invalid_id' });
      return;
    }
    onSeriesLoaded?.();
    dispatch({ type: 'loading' });

    const load = async () => {
      if (workKey) {
        const work = await pilgrimageRepository.getSpotsByKey(workKey);
        if (work) {
          const titles = getPilgrimageAnimeTitles(work);
          dispatch({
            type: 'series_full_loaded',
            degraded: false,
            entries: [{
              subject: {
                id: bangumiId ?? 0,
                title: titles.primary,
                titleCn: titles.chinese ?? titles.original ?? titles.english ?? '',
                relation: '作品',
                date: null,
                platform: null,
                label: titles.primary,
              },
              anime: work,
              points: work.spots,
            }],
          });
          return;
        }
      }

      if (atlasContext) {
        const resolvedWork = await pilgrimageRepository.getSpotsForAnime(atlasContext);
        if (resolvedWork) {
          const titles = getPilgrimageAnimeTitles(resolvedWork);
          dispatch({
            type: 'series_full_loaded',
            degraded: false,
            entries: [{
              subject: {
                id: bangumiId ?? 0,
                title: titles.primary,
                titleCn: titles.chinese ?? titles.original ?? titles.english ?? '',
                relation: '作品',
                date: null,
                platform: null,
                label: titles.primary,
              },
              anime: resolvedWork,
              points: resolvedWork.spots,
            }],
          });
          return;
        }
      }

      if (bangumiId === null || bangumiId <= 0) {
        dispatch({ type: 'empty' });
        return;
      }

      return resolvePilgrimageSeries(bangumiId)
      .then(async (series) => {
        if (cancelled) return;
        if (series.availableEntries.length === 0) {
          dispatch({ type: 'series_loaded', entries: series.entries, degraded: series.degraded });
          if (series.entries.length > 0) return;
          dispatch({ type: 'empty' });
          return;
        }
        dispatch({ type: 'series_full_loaded', entries: series.entries, degraded: series.degraded });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load pilgrimage';
        dispatch({ type: 'error', message });
      });
    };

    void load().catch((err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : 'Failed to load pilgrimage';
      dispatch({ type: 'error', message });
    });

    return () => {
      cancelled = true;
    };
  }, [atlasContext, bangumiId, onSeriesLoaded, reloadNonce, workKey]);

  useEffect(() => {
    let cancelled = false;
    if (!dataSourceConfig.isInitialized) {
      dataSourceConfig
        .init()
        .then(() => {
          if (!cancelled) setBrowseSource(dataSourceConfig.browseSource);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    seriesEntries: state.seriesEntries,
    loading: state.loading,
    error: state.error,
    seriesDegraded: state.seriesDegraded,
    browseSource,
    reload,
  };
}

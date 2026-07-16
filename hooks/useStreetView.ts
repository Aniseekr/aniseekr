import { useEffect, useMemo, useReducer } from 'react';
import { Platform } from 'react-native';

import type { AnitabiPoint } from '../libs/services/pilgrimage/types';
import {
  resolveStreetView,
  type LookAroundProvider,
  type StreetViewMapillaryClient,
  type StreetViewResolveOptions,
  type StreetViewResult,
} from '../libs/services/pilgrimage/street-view/street-view-service';

export type StreetViewStatus = 'idle' | 'resolving' | 'ready';

export interface StreetViewState {
  status: StreetViewStatus;
  result: StreetViewResult | null;
  targetKey: string | null;
}

export type StreetViewAction =
  | { type: 'spotChanged'; targetKey: string | null }
  | { type: 'resolveStarted'; targetKey: string }
  | { type: 'resolveFinished'; targetKey: string; result: StreetViewResult | null };

export interface StreetViewTarget {
  key: string;
  latitude: number;
  longitude: number;
}

export interface UseStreetViewOptions extends Omit<
  StreetViewResolveOptions,
  'platform' | 'lookAroundProvider' | 'mapillaryClient'
> {
  enabled: boolean;
  platform?: string;
  lookAroundProvider?: LookAroundProvider | null;
  mapillaryClient?: StreetViewMapillaryClient;
  resolver?: (
    latitude: number,
    longitude: number,
    opts?: StreetViewResolveOptions
  ) => Promise<StreetViewResult | null>;
}

export const initialStreetViewState: StreetViewState = {
  status: 'idle',
  result: null,
  targetKey: null,
};

export function reduceStreetViewState(
  state: StreetViewState,
  action: StreetViewAction
): StreetViewState {
  if (action.type === 'spotChanged') {
    if (state.targetKey === action.targetKey) return state;
    return { status: 'idle', result: null, targetKey: action.targetKey };
  }

  if (action.type === 'resolveStarted') {
    if (state.targetKey !== action.targetKey) return state;
    return { status: 'resolving', result: null, targetKey: action.targetKey };
  }

  if (state.targetKey !== action.targetKey) return state;
  return { status: 'ready', result: action.result, targetKey: action.targetKey };
}

export function shouldStartStreetViewResolve(
  enabled: boolean,
  targetKey: string | null,
  state: StreetViewState
): boolean {
  return enabled && targetKey !== null && state.targetKey === targetKey && state.status === 'idle';
}

export function streetViewTargetFromSpot(spot: AnitabiPoint | null): StreetViewTarget | null {
  if (!spot || !Array.isArray(spot.geo) || spot.geo.length < 2) return null;

  const latitude = Number(spot.geo[0]);
  const longitude = Number(spot.geo[1]);
  if (!isFiniteCoordinate(latitude, longitude)) return null;

  return {
    key: `${spot.id}:${formatCoordinate(latitude)}:${formatCoordinate(longitude)}`,
    latitude,
    longitude,
  };
}

export function useStreetView(
  spot: AnitabiPoint | null,
  {
    enabled,
    platform = Platform.OS,
    lookAroundProvider,
    mapillaryClient,
    resolver = resolveStreetView,
    cache,
  }: UseStreetViewOptions
): Pick<StreetViewState, 'status' | 'result'> {
  const target = useMemo(() => streetViewTargetFromSpot(spot), [spot]);
  const [state, dispatch] = useReducer(reduceStreetViewState, initialStreetViewState);
  const targetKey = target?.key ?? null;

  useEffect(() => {
    dispatch({ type: 'spotChanged', targetKey });
  }, [targetKey]);

  useEffect(() => {
    if (!target || !shouldStartStreetViewResolve(enabled, target.key, state)) return;

    let cancelled = false;
    dispatch({ type: 'resolveStarted', targetKey: target.key });

    getDefaultLookAroundProvider(platform, lookAroundProvider)
      .then((provider) =>
        resolver(target.latitude, target.longitude, {
          platform,
          lookAroundProvider: provider,
          mapillaryClient,
          cache,
        })
      )
      .then((result) => {
        if (!cancelled) {
          dispatch({ type: 'resolveFinished', targetKey: target.key, result });
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'resolveFinished', targetKey: target.key, result: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cache, enabled, lookAroundProvider, mapillaryClient, platform, resolver, state, target]);

  if (state.targetKey !== targetKey) return { status: 'idle', result: null };
  return { status: state.status, result: state.result };
}

function isFiniteCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    (latitude !== 0 || longitude !== 0)
  );
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

async function getDefaultLookAroundProvider(
  platform: string,
  providerOverride: LookAroundProvider | null | undefined
): Promise<LookAroundProvider | null> {
  if (providerOverride !== undefined) return providerOverride;
  if (platform !== 'ios') return null;

  try {
    const module = await import('../modules/lookaround/src');
    return module.lookAroundProvider;
  } catch {
    return null;
  }
}

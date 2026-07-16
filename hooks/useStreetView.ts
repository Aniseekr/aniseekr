import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { Platform } from 'react-native';

import type { AnitabiPoint } from '../libs/services/pilgrimage/types';
import { isFiniteCoordinate } from '../libs/services/pilgrimage/street-view/coords';
import {
  markLookAroundUnavailable,
  peekStreetView,
  resolveStreetView,
  type LookAroundProvider,
  type StreetViewMapillaryClient,
  type StreetViewPeekOptions,
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
  | {
      type: 'spotChanged';
      targetKey: string | null;
      /** Warm-cache verdict: defined skips the resolve, `undefined` = unknown. */
      seeded?: StreetViewResult | null;
    }
  | { type: 'resolveStarted'; targetKey: string }
  | { type: 'resolveFinished'; targetKey: string; result: StreetViewResult | null }
  | { type: 'lookAroundUnavailable'; targetKey: string };

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
  peek?: (
    latitude: number,
    longitude: number,
    opts?: StreetViewPeekOptions
  ) => StreetViewResult | null | undefined;
  markUnavailable?: (latitude: number, longitude: number) => Promise<void>;
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
    if (action.targetKey !== null && action.seeded !== undefined) {
      return { status: 'ready', result: action.seeded, targetKey: action.targetKey };
    }
    return { status: 'idle', result: null, targetKey: action.targetKey };
  }

  if (action.type === 'resolveStarted') {
    if (state.targetKey !== action.targetKey) return state;
    return { status: 'resolving', result: null, targetKey: action.targetKey };
  }

  if (action.type === 'lookAroundUnavailable') {
    // A stale positive verdict just failed in the native preview: drop back to
    // idle so the resolve effect refires against the now-corrected cache.
    if (state.targetKey !== action.targetKey) return state;
    if (state.result?.kind !== 'lookaround') return state;
    return { status: 'idle', result: null, targetKey: action.targetKey };
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
  if (!isUsableSpotCoordinate(latitude, longitude)) return null;

  return {
    key: `${spot.id}:${targetKeyCoordinate(latitude)}:${targetKeyCoordinate(longitude)}`,
    latitude,
    longitude,
  };
}

export interface UseStreetViewResult extends Pick<StreetViewState, 'status' | 'result'> {
  /**
   * Called by the Look Around preview when its scene fails to load despite a
   * cached positive verdict: corrects the cache and re-resolves (→ Mapillary).
   */
  reportLookAroundUnavailable: () => void;
}

export function useStreetView(
  spot: AnitabiPoint | null,
  {
    enabled,
    platform = Platform.OS,
    lookAroundProvider,
    mapillaryClient,
    resolver = resolveStreetView,
    peek = peekStreetView,
    markUnavailable = markLookAroundUnavailable,
    cache,
  }: UseStreetViewOptions
): UseStreetViewResult {
  const target = useMemo(() => streetViewTargetFromSpot(spot), [spot]);
  const [state, dispatch] = useReducer(reduceStreetViewState, initialStreetViewState);
  const targetKey = target?.key ?? null;

  useEffect(() => {
    // Seed from the sync cache mirror so warm opens paint the card (or omit
    // the section) on the first frame instead of flashing the skeleton.
    const seeded = target ? peek(target.latitude, target.longitude, { platform }) : undefined;
    dispatch({ type: 'spotChanged', targetKey, seeded });
  }, [peek, platform, target, targetKey]);

  const reportLookAroundUnavailable = useCallback(() => {
    if (!target) return;
    const key = target.key;
    markUnavailable(target.latitude, target.longitude)
      .catch(() => undefined)
      .then(() => {
        // Reset only after the corrected verdict is written, so the refired
        // resolve can't read the stale `true` back.
        dispatch({ type: 'lookAroundUnavailable', targetKey: key });
      });
  }, [markUnavailable, target]);

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

  if (state.targetKey !== targetKey) {
    return { status: 'idle', result: null, reportLookAroundUnavailable };
  }
  return { status: state.status, result: state.result, reportLookAroundUnavailable };
}

// Spot geo uses [0, 0] as "missing", on top of the shared range guard.
function isUsableSpotCoordinate(latitude: number, longitude: number): boolean {
  return isFiniteCoordinate(latitude, longitude) && (latitude !== 0 || longitude !== 0);
}

// Zero-padded so target keys are stable regardless of trailing-zero trimming.
function targetKeyCoordinate(value: number): string {
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

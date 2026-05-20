import type { AnitabiPoint } from './types';

export interface SceneSwitcherSpotsState {
  /** `null` until the first fetch resolves; `[]` once a fetch returned nothing. */
  spots: readonly AnitabiPoint[] | null;
  loading: boolean;
}

export type SceneSwitcherSpotsAction =
  | { type: 'reset' }
  | { type: 'closed' }
  | { type: 'invalid' }
  | { type: 'loading' }
  | { type: 'loaded'; spots: readonly AnitabiPoint[] }
  | { type: 'failed' };

export const INITIAL_SCENE_SWITCHER_SPOTS: SceneSwitcherSpotsState = {
  spots: null,
  loading: false,
};

export function sceneSwitcherSpotsReducer(
  state: SceneSwitcherSpotsState,
  action: SceneSwitcherSpotsAction
): SceneSwitcherSpotsState {
  switch (action.type) {
    case 'reset':
      return state.spots === null && !state.loading ? state : { spots: null, loading: false };
    case 'closed':
      return state.loading ? { ...state, loading: false } : state;
    case 'invalid':
    case 'failed':
      return { spots: [], loading: false };
    case 'loading':
      return state.loading ? state : { ...state, loading: true };
    case 'loaded':
      return { spots: action.spots, loading: false };
  }
}

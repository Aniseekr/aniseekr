import { describe, expect, it } from 'bun:test';
import {
  INITIAL_SCENE_SWITCHER_SPOTS,
  sceneSwitcherSpotsReducer,
} from '../../../hooks/useSceneSwitcherSpots';

describe('sceneSwitcherSpotsReducer', () => {
  it('clears an in-flight loading state when the switcher closes', () => {
    const loading = sceneSwitcherSpotsReducer(INITIAL_SCENE_SWITCHER_SPOTS, {
      type: 'loading',
    });

    const closed = sceneSwitcherSpotsReducer(loading, { type: 'closed' });

    expect(closed.spots).toBeNull();
    expect(closed.loading).toBe(false);
  });

  it('clears an in-flight loading state when the anime id is invalid', () => {
    const loading = sceneSwitcherSpotsReducer(INITIAL_SCENE_SWITCHER_SPOTS, {
      type: 'loading',
    });

    const invalid = sceneSwitcherSpotsReducer(loading, { type: 'invalid' });

    expect(invalid.spots).toEqual([]);
    expect(invalid.loading).toBe(false);
  });
});

import { describe, expect, it } from 'bun:test';

import type { StreetViewResult } from '../../../libs/services/pilgrimage/street-view/street-view-service';
import {
  initialStreetViewState,
  reduceStreetViewState,
  shouldStartStreetViewResolve,
} from '../../../hooks/useStreetView';

const LOOK_AROUND_RESULT: StreetViewResult = {
  kind: 'lookaround',
  latitude: 35.658,
  longitude: 139.701,
};

describe('useStreetView state machine', () => {
  it('stays idle until the sheet animation gate opens', () => {
    const targetKey = 'spot-a:35.658000:139.701000';
    const state = reduceStreetViewState(initialStreetViewState, {
      type: 'spotChanged',
      targetKey,
    });

    expect(state).toEqual({ status: 'idle', result: null, targetKey });
    expect(shouldStartStreetViewResolve(false, targetKey, state)).toBe(false);
    expect(shouldStartStreetViewResolve(true, targetKey, state)).toBe(true);

    const resolving = reduceStreetViewState(state, { type: 'resolveStarted', targetKey });

    expect(resolving).toEqual({ status: 'resolving', result: null, targetKey });
    expect(shouldStartStreetViewResolve(true, targetKey, resolving)).toBe(false);
  });

  it('resets on spot changes and ignores stale resolver completions', () => {
    const spotA = 'spot-a:35.658000:139.701000';
    const spotB = 'spot-b:35.659000:139.702000';

    let state = reduceStreetViewState(initialStreetViewState, {
      type: 'spotChanged',
      targetKey: spotA,
    });
    state = reduceStreetViewState(state, { type: 'resolveStarted', targetKey: spotA });
    state = reduceStreetViewState(state, { type: 'spotChanged', targetKey: spotB });
    state = reduceStreetViewState(state, {
      type: 'resolveFinished',
      targetKey: spotA,
      result: LOOK_AROUND_RESULT,
    });

    expect(state).toEqual({ status: 'idle', result: null, targetKey: spotB });

    state = reduceStreetViewState(state, { type: 'resolveStarted', targetKey: spotB });
    state = reduceStreetViewState(state, {
      type: 'resolveFinished',
      targetKey: spotB,
      result: null,
    });

    expect(state).toEqual({ status: 'ready', result: null, targetKey: spotB });
    expect(shouldStartStreetViewResolve(true, spotB, state)).toBe(false);
  });
});

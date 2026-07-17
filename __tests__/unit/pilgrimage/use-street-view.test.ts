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

  it('PILG-026 seeds ready state from a warm peek without a resolving phase', () => {
    const targetKey = 'spot-a:35.658000:139.701000';

    const seededHit = reduceStreetViewState(initialStreetViewState, {
      type: 'spotChanged',
      targetKey,
      seeded: LOOK_AROUND_RESULT,
    });
    expect(seededHit).toEqual({ status: 'ready', result: LOOK_AROUND_RESULT, targetKey });
    expect(shouldStartStreetViewResolve(true, targetKey, seededHit)).toBe(false);

    const seededMiss = reduceStreetViewState(initialStreetViewState, {
      type: 'spotChanged',
      targetKey,
      seeded: null,
    });
    expect(seededMiss).toEqual({ status: 'ready', result: null, targetKey });
    expect(shouldStartStreetViewResolve(true, targetKey, seededMiss)).toBe(false);

    const unknown = reduceStreetViewState(initialStreetViewState, {
      type: 'spotChanged',
      targetKey,
      seeded: undefined,
    });
    expect(unknown).toEqual({ status: 'idle', result: null, targetKey });
    expect(shouldStartStreetViewResolve(true, targetKey, unknown)).toBe(true);
  });

  it('PILG-028 scene unavailable resets a lookaround result so the resolve refires', () => {
    const targetKey = 'spot-a:35.658000:139.701000';
    const ready = reduceStreetViewState(initialStreetViewState, {
      type: 'spotChanged',
      targetKey,
      seeded: LOOK_AROUND_RESULT,
    });

    const reset = reduceStreetViewState(ready, { type: 'lookAroundUnavailable', targetKey });
    expect(reset).toEqual({ status: 'idle', result: null, targetKey });
    expect(shouldStartStreetViewResolve(true, targetKey, reset)).toBe(true);

    // Stale key or non-lookaround results are ignored.
    expect(
      reduceStreetViewState(ready, { type: 'lookAroundUnavailable', targetKey: 'other' })
    ).toBe(ready);
    const mapillaryReady = reduceStreetViewState(initialStreetViewState, {
      type: 'spotChanged',
      targetKey,
      seeded: null,
    });
    expect(
      reduceStreetViewState(mapillaryReady, { type: 'lookAroundUnavailable', targetKey })
    ).toBe(mapillaryReady);
  });
});

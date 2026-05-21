import { describe, expect, it } from 'bun:test';
import {
  initialFsmState,
  fsmReducer,
  DWELL_MS,
  type FsmState,
} from '../../../libs/services/pilgrimage/switch-fsm';

const STABLE_WIDE: FsmState = { phase: 'STABLE', activeLens: 'wide' };

describe('switch-fsm reducer', () => {
  it('initial state is STABLE on the supplied lens', () => {
    expect(initialFsmState('wide')).toEqual(STABLE_WIDE);
  });

  it('STABLE + DIAL_CROSS_INTO_ISLAND_REGION → HOVER_BOUNDARY with dwell timer effect', () => {
    const { state, effects } = fsmReducer(STABLE_WIDE, {
      type: 'DIAL_CROSS_INTO_ISLAND_REGION',
      target: 'ultra-wide',
    });
    expect(state.phase).toBe('HOVER_BOUNDARY');
    if (state.phase === 'HOVER_BOUNDARY') {
      expect(state.activeLens).toBe('wide');
      expect(state.targetLens).toBe('ultra-wide');
    }
    expect(effects).toEqual([{ type: 'START_DWELL_TIMER', ms: DWELL_MS }]);
  });

  it('HOVER_BOUNDARY + DWELL_TIMEOUT → SWITCHING with OPEN_LENS_SESSION effect', () => {
    const hover: FsmState = {
      phase: 'HOVER_BOUNDARY',
      activeLens: 'wide',
      targetLens: 'ultra-wide',
    };
    const { state, effects } = fsmReducer(hover, { type: 'DWELL_TIMEOUT' });
    expect(state.phase).toBe('SWITCHING');
    if (state.phase === 'SWITCHING') {
      expect(state.previousLens).toBe('wide');
      expect(state.targetLens).toBe('ultra-wide');
    }
    expect(effects).toEqual([{ type: 'OPEN_LENS_SESSION', target: 'ultra-wide' }]);
  });

  it('HOVER_BOUNDARY + DIAL_RECROSS_BACK → STABLE with CANCEL_DWELL_TIMER effect', () => {
    // User pulled back to the continuous strip — they didn't mean to swap.
    // The dwell timer the caller armed must be cancelled so it doesn't fire
    // moments later in a different gesture context.
    const hover: FsmState = {
      phase: 'HOVER_BOUNDARY',
      activeLens: 'wide',
      targetLens: 'ultra-wide',
    };
    const { state, effects } = fsmReducer(hover, { type: 'DIAL_RECROSS_BACK' });
    expect(state).toEqual({ phase: 'STABLE', activeLens: 'wide' });
    expect(effects).toEqual([{ type: 'CANCEL_DWELL_TIMER' }]);
  });

  it('HOVER_BOUNDARY + TAP_ISLAND → SWITCHING (bypass dwell) with CANCEL_DWELL + OPEN_LENS', () => {
    // Tap is the explicit affordance — bypass the dwell. We still cancel
    // the already-armed timer to prevent a redundant DWELL_TIMEOUT event
    // arriving milliseconds later and getting silently dropped.
    const hover: FsmState = {
      phase: 'HOVER_BOUNDARY',
      activeLens: 'wide',
      targetLens: 'ultra-wide',
    };
    const { state, effects } = fsmReducer(hover, {
      type: 'TAP_ISLAND',
      target: 'ultra-wide',
    });
    expect(state.phase).toBe('SWITCHING');
    expect(effects).toEqual([
      { type: 'CANCEL_DWELL_TIMER' },
      { type: 'OPEN_LENS_SESSION', target: 'ultra-wide' },
    ]);
  });

  it('SWITCHING + CAMERA_STARTED → STABLE on the target lens', () => {
    const switching: FsmState = {
      phase: 'SWITCHING',
      previousLens: 'wide',
      targetLens: 'ultra-wide',
    };
    const { state, effects } = fsmReducer(switching, { type: 'CAMERA_STARTED' });
    expect(state).toEqual({ phase: 'STABLE', activeLens: 'ultra-wide' });
    expect(effects).toEqual([]);
  });

  it('SWITCHING + CAMERA_ERROR → ERROR carrying the previous lens (fallback)', () => {
    // Hardware error mid-swap (camera busy, app backgrounded). We don't
    // wedge into SWITCHING forever — fall back to ERROR so the UI can
    // surface the failure and the user can retry.
    const switching: FsmState = {
      phase: 'SWITCHING',
      previousLens: 'wide',
      targetLens: 'ultra-wide',
    };
    const { state, effects } = fsmReducer(switching, {
      type: 'CAMERA_ERROR',
      error: 'CAMERA_BUSY',
    });
    expect(state).toEqual({
      phase: 'ERROR',
      activeLens: 'wide',
      error: 'CAMERA_BUSY',
    });
    expect(effects).toEqual([]);
  });

  it('STABLE on ultra-wide + TAP_ISLAND target=wide → SWITCHING back to wide', () => {
    // After tapping 0.5 once we end up on ultra-wide. The island then
    // labels 1.0 with target=wide so the user can tap their way back.
    const stableUw: FsmState = { phase: 'STABLE', activeLens: 'ultra-wide' };
    const { state, effects } = fsmReducer(stableUw, {
      type: 'TAP_ISLAND',
      target: 'wide',
    });
    expect(state.phase).toBe('SWITCHING');
    if (state.phase === 'SWITCHING') {
      expect(state.previousLens).toBe('ultra-wide');
      expect(state.targetLens).toBe('wide');
    }
    expect(effects).toEqual([{ type: 'OPEN_LENS_SESSION', target: 'wide' }]);
  });

  it('thrash test: 5x cross/recross leaves no residual state and emits only paired effects', () => {
    // The reducer is referentially transparent and emits CANCEL effects
    // on every recross. No timers live inside the reducer, so the
    // classic "leaked timer" failure mode is impossible by construction —
    // but we still pin the behaviour: after the dust settles we're back
    // in STABLE with no extra effects in flight.
    let state: FsmState = STABLE_WIDE;
    const allEffects: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const cross = fsmReducer(state, {
        type: 'DIAL_CROSS_INTO_ISLAND_REGION',
        target: 'ultra-wide',
      });
      state = cross.state;
      allEffects.push(...cross.effects.map((e) => e.type));
      const recross = fsmReducer(state, { type: 'DIAL_RECROSS_BACK' });
      state = recross.state;
      allEffects.push(...recross.effects.map((e) => e.type));
    }
    expect(state).toEqual(STABLE_WIDE);
    // Five START followed-by-CANCEL pairs, in order.
    expect(allEffects).toEqual([
      'START_DWELL_TIMER',
      'CANCEL_DWELL_TIMER',
      'START_DWELL_TIMER',
      'CANCEL_DWELL_TIMER',
      'START_DWELL_TIMER',
      'CANCEL_DWELL_TIMER',
      'START_DWELL_TIMER',
      'CANCEL_DWELL_TIMER',
      'START_DWELL_TIMER',
      'CANCEL_DWELL_TIMER',
    ]);
  });

  it('ERROR + TAP_ISLAND → SWITCHING (allow recovery via explicit retry)', () => {
    // Once the camera errors out, the UI should still be able to retry by
    // tapping the island. We don't strand the user in ERROR.
    const error: FsmState = {
      phase: 'ERROR',
      activeLens: 'wide',
      error: 'CAMERA_BUSY',
    };
    const { state, effects } = fsmReducer(error, {
      type: 'TAP_ISLAND',
      target: 'ultra-wide',
    });
    expect(state.phase).toBe('SWITCHING');
    expect(effects).toEqual([{ type: 'OPEN_LENS_SESSION', target: 'ultra-wide' }]);
  });

  it('unrecognised event in any phase is a no-op (defensive)', () => {
    const before: FsmState = { phase: 'SWITCHING', previousLens: 'wide', targetLens: 'ultra-wide' };
    const { state, effects } = fsmReducer(before, {
      type: 'DIAL_CROSS_INTO_ISLAND_REGION',
      target: 'ultra-wide',
    });
    expect(state).toBe(before);
    expect(effects).toEqual([]);
  });
});

// Lens-switch state machine. Pure reducer that turns dial events into the
// next state plus a list of effects the caller should enact (start/cancel
// timer, open new camera session). Side effects live outside this module
// so the reducer is trivially unit-testable: no React, no timers, no async.
//
// Why dwell-then-switch:
// A drag that flicks past the continuous strip's lower wall could be
// intentional (user wants to swap to ultra-wide) or accidental (overshoot
// while reaching for 1.0). Switching the camera session takes 200–400ms
// on Android (CameraX teardown + rebuild), so a hair-trigger swap on every
// boundary cross would feel like the camera was constantly flashing.
// We wait DWELL_MS while the gesture sits past the wall before committing.
// Tap-island is the explicit affordance and bypasses dwell entirely.
//
// States:
//   * STABLE          — a session is up; no switch in flight.
//   * HOVER_BOUNDARY  — drag sits past the wall; dwell timer armed.
//   * SWITCHING       — `OPEN_LENS_SESSION` issued; awaiting CAMERA_STARTED.
//   * ERROR           — last switch attempt failed; UI shows fallback state.
//
// The reducer is REFERENTIALLY TRANSPARENT — repeated calls with the same
// (state, event) always return the same (state, effects). This is why the
// "thrash test" (5× cross-recross) cannot leak: there is nothing to leak,
// timers live in the caller.

import type { ActiveLens } from './dial-spaces';

export { type ActiveLens } from './dial-spaces';

/** Milliseconds the drag must sit past the escapement wall before a
 *  session swap fires. Below 150ms feels like a hair-trigger; above 300ms
 *  feels sluggish. 220ms hits the sweet spot in informal testing. */
export const DWELL_MS = 220;

export type FsmState =
  | { phase: 'STABLE'; activeLens: ActiveLens }
  | { phase: 'HOVER_BOUNDARY'; activeLens: ActiveLens; targetLens: ActiveLens }
  | { phase: 'SWITCHING'; previousLens: ActiveLens; targetLens: ActiveLens }
  | { phase: 'ERROR'; activeLens: ActiveLens; error: string };

export type FsmEvent =
  /** Drag entered the off-strip region targeting `target`. */
  | { type: 'DIAL_CROSS_INTO_ISLAND_REGION'; target: ActiveLens }
  /** Drag returned to the continuous strip, cancelling any pending switch. */
  | { type: 'DIAL_RECROSS_BACK' }
  /** Caller-issued: the dwell timer that was started in HOVER_BOUNDARY fired. */
  | { type: 'DWELL_TIMEOUT' }
  /** Explicit tap on the island chip — skip dwell, switch immediately. */
  | { type: 'TAP_ISLAND'; target: ActiveLens }
  /** Camera session for the target lens is up and previewing. */
  | { type: 'CAMERA_STARTED' }
  /** Session open failed (camera busy, hardware error). Fall back. */
  | { type: 'CAMERA_ERROR'; error: string };

export type FsmEffect =
  | { type: 'START_DWELL_TIMER'; ms: number }
  | { type: 'CANCEL_DWELL_TIMER' }
  | { type: 'OPEN_LENS_SESSION'; target: ActiveLens };

export interface FsmResult {
  readonly state: FsmState;
  readonly effects: readonly FsmEffect[];
}

export function initialFsmState(activeLens: ActiveLens): FsmState {
  return { phase: 'STABLE', activeLens };
}

const NO_EFFECTS: readonly FsmEffect[] = [];

export function fsmReducer(state: FsmState, event: FsmEvent): FsmResult {
  switch (state.phase) {
    case 'STABLE':
      switch (event.type) {
        case 'DIAL_CROSS_INTO_ISLAND_REGION':
          return {
            state: {
              phase: 'HOVER_BOUNDARY',
              activeLens: state.activeLens,
              targetLens: event.target,
            },
            effects: [{ type: 'START_DWELL_TIMER', ms: DWELL_MS }],
          };
        case 'TAP_ISLAND':
          return {
            state: {
              phase: 'SWITCHING',
              previousLens: state.activeLens,
              targetLens: event.target,
            },
            effects: [{ type: 'OPEN_LENS_SESSION', target: event.target }],
          };
        default:
          return { state, effects: NO_EFFECTS };
      }

    case 'HOVER_BOUNDARY':
      switch (event.type) {
        case 'DWELL_TIMEOUT':
          return {
            state: {
              phase: 'SWITCHING',
              previousLens: state.activeLens,
              targetLens: state.targetLens,
            },
            effects: [{ type: 'OPEN_LENS_SESSION', target: state.targetLens }],
          };
        case 'DIAL_RECROSS_BACK':
          return {
            state: { phase: 'STABLE', activeLens: state.activeLens },
            effects: [{ type: 'CANCEL_DWELL_TIMER' }],
          };
        case 'TAP_ISLAND':
          return {
            state: {
              phase: 'SWITCHING',
              previousLens: state.activeLens,
              targetLens: event.target,
            },
            effects: [
              { type: 'CANCEL_DWELL_TIMER' },
              { type: 'OPEN_LENS_SESSION', target: event.target },
            ],
          };
        default:
          return { state, effects: NO_EFFECTS };
      }

    case 'SWITCHING':
      switch (event.type) {
        case 'CAMERA_STARTED':
          return {
            state: { phase: 'STABLE', activeLens: state.targetLens },
            effects: NO_EFFECTS,
          };
        case 'CAMERA_ERROR':
          return {
            state: {
              phase: 'ERROR',
              activeLens: state.previousLens,
              error: event.error,
            },
            effects: NO_EFFECTS,
          };
        default:
          return { state, effects: NO_EFFECTS };
      }

    case 'ERROR':
      switch (event.type) {
        case 'TAP_ISLAND':
          return {
            state: {
              phase: 'SWITCHING',
              previousLens: state.activeLens,
              targetLens: event.target,
            },
            effects: [{ type: 'OPEN_LENS_SESSION', target: event.target }],
          };
        case 'DIAL_CROSS_INTO_ISLAND_REGION':
          return {
            state: {
              phase: 'HOVER_BOUNDARY',
              activeLens: state.activeLens,
              targetLens: event.target,
            },
            effects: [{ type: 'START_DWELL_TIMER', ms: DWELL_MS }],
          };
        default:
          return { state, effects: NO_EFFECTS };
      }
  }
}

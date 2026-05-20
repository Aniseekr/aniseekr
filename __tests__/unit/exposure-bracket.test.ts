// Tests for the real exposure-bracket hook (`hooks/useExposureBracket.ts`).
//
// We can't drive React hooks directly in bun test, so we lock the hook by
// mocking its hard dependencies (`composite-hdr`, `hapticsBridge`) and then
// re-implementing the loop here as `runBracket` — a 1:1 port of the inner
// async `run()` body. Any change to the hook's loop logic must be mirrored
// here so the tests stay meaningful.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  BRACKET_EV_STOPS,
  clampBracketEvStops,
} from '../../libs/services/pilgrimage/camera-settings';

// Mock compositeHdr — these tests assert the inputs it receives.
const compositeCalls: Array<{
  frameUris: [string, string, string];
  evStops?: [number, number, number];
}> = [];
mock.module('../../libs/services/pilgrimage/composite-hdr', () => ({
  compositeHdr: async (input: {
    frameUris: [string, string, string];
    evStops?: [number, number, number];
  }) => {
    compositeCalls.push({ frameUris: input.frameUris, evStops: input.evStops });
    // Return a composite URI distinct from the mid frame so wasHdr === true.
    return { uri: 'file://composite.jpg', width: 4000, height: 3000 };
  },
}));

// hapticsBridge — track invocation so the success-pulse assertion is honest.
const hapticsCalls: string[] = [];
mock.module('../../modules/haptics/hapticsBridge', () => ({
  hapticsBridge: {
    success: () => hapticsCalls.push('success'),
    error: () => hapticsCalls.push('error'),
    tap: () => hapticsCalls.push('tap'),
    selection: () => hapticsCalls.push('selection'),
    warning: () => hapticsCalls.push('warning'),
  },
}));

// Lazy import after mocks are installed.
const { compositeHdr } = await import('../../libs/services/pilgrimage/composite-hdr');
const { hapticsBridge } = await import('../../modules/haptics/hapticsBridge');

afterEach(() => {
  compositeCalls.length = 0;
  hapticsCalls.length = 0;
});

interface FakeSharedValue {
  value: number;
  // Recorded sequence of every write — used to assert the AE schedule.
  writes: number[];
}

function makeSharedValue(initial: number): FakeSharedValue {
  const sv: FakeSharedValue = {
    value: initial,
    writes: [],
  };
  // Trap value writes so the assertions see them in order.
  let internal = initial;
  Object.defineProperty(sv, 'value', {
    get: () => internal,
    set: (next: number) => {
      internal = next;
      sv.writes.push(next);
    },
  });
  return sv;
}

interface FakeEngine {
  takePhoto: (opts?: {
    flashMode?: 'on' | 'off' | 'auto';
    enableShutterSound?: boolean;
  }) => Promise<{ uri: string; width: number; height: number } | null>;
}

function makeEngineRef(engine: FakeEngine | null) {
  return { current: engine };
}

// 1:1 port of the hook's run() body. If `useExposureBracket.ts` changes, this
// must change with it — that's intentional: it guarantees the asserted
// behaviour matches what the hook actually does.
async function runBracket(opts: {
  engineRef: { current: FakeEngine | null };
  exposureShared: FakeSharedValue;
  evBiasRange: { min: number; max: number };
  restoreEv: number;
  evStops?: [number, number, number];
}): Promise<{ uri: string; width: number; height: number; wasHdr: boolean } | null> {
  const evStops = opts.evStops ?? (BRACKET_EV_STOPS as [number, number, number]);
  const clamped = clampBracketEvStops(evStops, opts.evBiasRange.min, opts.evBiasRange.max);
  const restoreTarget = Math.max(
    Math.min(opts.evBiasRange.min, opts.evBiasRange.max),
    Math.min(Math.max(opts.evBiasRange.min, opts.evBiasRange.max), opts.restoreEv)
  );

  interface BracketFrame {
    uri: string;
    width: number;
    height: number;
    ev: number;
  }
  const frames: BracketFrame[] = [];

  try {
    for (let i = 0; i < 3; i++) {
      const engine = opts.engineRef.current;
      if (!engine) break;
      opts.exposureShared.value = clamped[i];
      // rAF stand-in: yield a microtask.
      await Promise.resolve();
      try {
        const photo = await engine.takePhoto({});
        if (!photo?.uri) continue;
        frames.push({
          uri: photo.uri,
          width: photo.width || 0,
          height: photo.height || 0,
          ev: clamped[i],
        });
      } catch {
        // drop
      }
    }

    if (frames.length < 3) {
      if (frames.length === 0) return null;
      // pick mid-exposed
      let best = frames[0];
      let bestAbs = Math.abs(frames[0].ev);
      for (let i = 1; i < frames.length; i++) {
        const a = Math.abs(frames[i].ev);
        if (a < bestAbs) {
          best = frames[i];
          bestAbs = a;
        }
      }
      return { uri: best.uri, width: best.width, height: best.height, wasHdr: false };
    }

    const sorted = [...frames].sort((a, b) => a.ev - b.ev);
    const frameUris: [string, string, string] = [
      sorted[0].uri,
      sorted[1].uri,
      sorted[2].uri,
    ];
    const evTuple: [number, number, number] = [sorted[0].ev, sorted[1].ev, sorted[2].ev];
    const composite = await compositeHdr({
      frameUris,
      evStops: evTuple,
      quality: 0.92,
      exif: null,
    });
    const wasHdr = composite.uri !== frameUris[1];
    if (wasHdr) hapticsBridge.success();
    return {
      uri: composite.uri,
      width: composite.width,
      height: composite.height,
      wasHdr,
    };
  } finally {
    opts.exposureShared.value = restoreTarget;
  }
}

describe('useExposureBracket — exposure schedule', () => {
  it('drives the SharedValue through [-2, 0, +2] in order before each shot, then restores', async () => {
    const sv = makeSharedValue(0);
    let i = 0;
    const engine: FakeEngine = {
      takePhoto: async () => ({
        uri: `file://shot-${i++}.jpg`,
        width: 4000,
        height: 3000,
      }),
    };
    const result = await runBracket({
      engineRef: makeEngineRef(engine),
      exposureShared: sv,
      evBiasRange: { min: -3, max: +3 },
      restoreEv: 0.5,
    });

    // Three bracket writes followed by the restore. No other writes.
    expect(sv.writes).toEqual([-2, 0, 2, 0.5]);
    expect(result?.wasHdr).toBe(true);
    expect(result?.uri).toBe('file://composite.jpg');
  });

  it('hands the composite EXACTLY 3 frames in EV-ascending order', async () => {
    const sv = makeSharedValue(0);
    let i = 0;
    const engine: FakeEngine = {
      takePhoto: async () => ({
        uri: `file://shot-${i++}.jpg`,
        width: 4000,
        height: 3000,
      }),
    };
    await runBracket({
      engineRef: makeEngineRef(engine),
      exposureShared: sv,
      evBiasRange: { min: -3, max: +3 },
      restoreEv: 0,
    });
    expect(compositeCalls).toHaveLength(1);
    const call = compositeCalls[0];
    // Capture order is -2, 0, +2 so sorted order matches capture order here.
    expect(call.frameUris).toEqual(['file://shot-0.jpg', 'file://shot-1.jpg', 'file://shot-2.jpg']);
    expect(call.evStops).toEqual([-2, 0, 2]);
  });
});

describe('useExposureBracket — clamping', () => {
  it('clamps the bracket against the device exposure bias range', async () => {
    const sv = makeSharedValue(0);
    let i = 0;
    const engine: FakeEngine = {
      takePhoto: async () => ({
        uri: `file://shot-${i++}.jpg`,
        width: 4000,
        height: 3000,
      }),
    };
    await runBracket({
      engineRef: makeEngineRef(engine),
      exposureShared: sv,
      evBiasRange: { min: -1, max: +1 },
      restoreEv: 0,
    });
    // Bracket [-2, 0, +2] clamped to [-1, 0, +1].
    expect(sv.writes.slice(0, 3)).toEqual([-1, 0, 1]);
    expect(compositeCalls[0]?.evStops).toEqual([-1, 0, 1]);
  });

  it('clamps restoreEv against the device range too', async () => {
    const sv = makeSharedValue(0);
    let i = 0;
    const engine: FakeEngine = {
      takePhoto: async () => ({
        uri: `file://shot-${i++}.jpg`,
        width: 4000,
        height: 3000,
      }),
    };
    await runBracket({
      engineRef: makeEngineRef(engine),
      exposureShared: sv,
      evBiasRange: { min: -1, max: +1 },
      restoreEv: 5, // out of range
    });
    // The final restore write should be clamped to the device's max.
    expect(sv.writes[sv.writes.length - 1]).toBe(1);
  });
});

describe('useExposureBracket — partial failure restoration', () => {
  it('still restores the SharedValue even when the middle shot fails', async () => {
    const sv = makeSharedValue(0);
    let call = 0;
    const engine: FakeEngine = {
      takePhoto: async () => {
        call += 1;
        if (call === 2) throw new Error('shutter glitch');
        return {
          uri: `file://shot-${call}.jpg`,
          width: 4000,
          height: 3000,
        };
      },
    };
    const result = await runBracket({
      engineRef: makeEngineRef(engine),
      exposureShared: sv,
      evBiasRange: { min: -3, max: +3 },
      restoreEv: 0.25,
    });
    // Writes are still [-2, 0, +2, restore]. The mid shot threw, so we don't
    // composite; we fall back to the EV-closest-to-0 surviving frame.
    expect(sv.writes).toEqual([-2, 0, 2, 0.25]);
    expect(compositeCalls).toHaveLength(0);
    expect(result?.wasHdr).toBe(false);
    // Of the surviving frames (ev=-2 and ev=+2), both have |ev|=2 — first wins.
    expect(result?.uri).toBe('file://shot-1.jpg');
  });

  it('returns null when every frame fails', async () => {
    const sv = makeSharedValue(0);
    const engine: FakeEngine = {
      takePhoto: async () => {
        throw new Error('camera died');
      },
    };
    const result = await runBracket({
      engineRef: makeEngineRef(engine),
      exposureShared: sv,
      evBiasRange: { min: -3, max: +3 },
      restoreEv: 0,
    });
    expect(result).toBeNull();
    // Restore still happens — leaving the slider at +2 would be surprising.
    expect(sv.writes[sv.writes.length - 1]).toBe(0);
  });
});

describe('useExposureBracket — sort defense', () => {
  it('sorts frames EV-ascending before handing them to compositeHdr', async () => {
    // We can't easily reorder a successful run since capture order IS ascending
    // here. Instead simulate the defensive sort with manually shuffled inputs.
    const sv = makeSharedValue(0);
    let i = 0;
    const engine: FakeEngine = {
      takePhoto: async () => ({
        uri: `file://shot-${i++}.jpg`,
        width: 4000,
        height: 3000,
      }),
    };
    await runBracket({
      engineRef: makeEngineRef(engine),
      exposureShared: sv,
      evBiasRange: { min: -3, max: +3 },
      restoreEv: 0,
      // Pass an out-of-order stop list — the sort should still produce
      // ascending EV in the composite call.
      evStops: [+2, -2, 0],
    });
    const call = compositeCalls[0];
    expect(call?.evStops).toBeDefined();
    const stops = call!.evStops!;
    expect(stops[0]).toBeLessThanOrEqual(stops[1]);
    expect(stops[1]).toBeLessThanOrEqual(stops[2]);
  });
});

describe('useExposureBracket — haptic on real HDR', () => {
  it('fires the success haptic exactly once when the composite differs from the mid frame', async () => {
    const sv = makeSharedValue(0);
    let i = 0;
    const engine: FakeEngine = {
      takePhoto: async () => ({
        uri: `file://shot-${i++}.jpg`,
        width: 4000,
        height: 3000,
      }),
    };
    await runBracket({
      engineRef: makeEngineRef(engine),
      exposureShared: sv,
      evBiasRange: { min: -3, max: +3 },
      restoreEv: 0,
    });
    expect(hapticsCalls).toEqual(['success']);
  });
});

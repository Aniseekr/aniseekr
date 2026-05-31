// Behavioural pin for the MapSurface delegating handle.
// MapSurface must forward the parent's imperative ref to whichever engine is
// LIVE. Before this, the leaflet branch dropped the ref entirely, so the locate
// FAB / compass (recenter/setHeading) would silently no-op while the rollout
// flag was still on 'leaflet' — a regression. The handle delegates lazily so it
// always hits the currently-active engine, and never throws when none is set.

import { describe, expect, it } from 'bun:test';
import { createDelegatingHandle } from '../../../libs/services/pilgrimage/map-engine/delegating-handle';
import type { MapSurfaceHandle } from '../../../libs/services/pilgrimage/map-engine/types';

describe('createDelegatingHandle', () => {
  it('forwards recenter / setHeading / focus to the current target', () => {
    const calls: unknown[][] = [];
    const target: MapSurfaceHandle = {
      recenter: (...a) => calls.push(['recenter', ...a]),
      setHeading: (d) => calls.push(['setHeading', d]),
      focus: (t) => calls.push(['focus', t]),
    };
    const handle = createDelegatingHandle(() => target);
    handle.recenter(35, 135, 14, { animate: false });
    handle.setHeading(90);
    handle.focus?.({ lat: 1, lng: 2 });
    expect(calls).toEqual([
      ['recenter', 35, 135, 14, { animate: false }],
      ['setHeading', 90],
      ['focus', { lat: 1, lng: 2 }],
    ]);
  });

  it('re-reads the target each call, so it tracks the engine that is live now', () => {
    let active: MapSurfaceHandle | null = null;
    const handle = createDelegatingHandle(() => active);
    handle.recenter(1, 1); // no active engine yet -> no-op, no throw
    const seen: number[] = [];
    active = { recenter: (lat) => seen.push(lat), setHeading: () => {} };
    handle.recenter(42, 0);
    expect(seen).toEqual([42]);
  });

  it('never throws when the target is null or lacks the method', () => {
    const handle = createDelegatingHandle(() => null);
    expect(() => handle.recenter(1, 2)).not.toThrow();
    expect(() => handle.setHeading(0)).not.toThrow();
    const partial = createDelegatingHandle(() => ({ recenter: () => {}, setHeading: () => {} }));
    expect(() => partial.fitBounds?.({ north: 1, south: 0, east: 1, west: 0 })).not.toThrow();
  });
});

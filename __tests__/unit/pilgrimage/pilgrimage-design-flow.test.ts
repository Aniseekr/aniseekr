import { describe, expect, it } from 'bun:test';

import {
  resolvePilgrimageMapInitialMode,
  shouldLoadPilgrimageMapBounds,
} from '../../../libs/services/pilgrimage/pilgrimage-design-flow';

describe('pilgrimage design flow helpers', () => {
  it('opens the see-all pilgrimage screen map-first unless list is explicitly requested', () => {
    expect(resolvePilgrimageMapInitialMode(undefined)).toBe('map');
    expect(resolvePilgrimageMapInitialMode('map')).toBe('map');
    expect(resolvePilgrimageMapInitialMode('list')).toBe('list');
    expect(resolvePilgrimageMapInitialMode(['list', 'map'])).toBe('list');
    expect(resolvePilgrimageMapInitialMode('unknown')).toBe('map');
  });

  it('loads map bounds for any valid box (queries are local now, no API to protect)', () => {
    // Whole-Japan view — previously rejected by the 4° gate, now allowed.
    expect(
      shouldLoadPilgrimageMapBounds({ south: 24, west: 122.9, north: 45.6, east: 146 })
    ).toBe(true);
    // A local view stays allowed.
    expect(
      shouldLoadPilgrimageMapBounds({ south: 35.5, west: 139.3, north: 35.9, east: 140 })
    ).toBe(true);
    // Invalid boxes are still rejected.
    expect(
      shouldLoadPilgrimageMapBounds({ south: 45, west: 139, north: 35, east: 140 })
    ).toBe(false);
    expect(
      shouldLoadPilgrimageMapBounds({ south: NaN, west: 139, north: 35, east: 140 })
    ).toBe(false);
  });
});

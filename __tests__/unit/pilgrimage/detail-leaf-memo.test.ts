// Memo-equality + bridge-helper tests for the pilgrimage detail refactor.
//
// We import the pure equality / signature helpers from `_equality.ts` so the
// test runner doesn't have to load react-native, expo-image, or reanimated.
// That keeps the test file lightweight and decouples the perf invariant
// from rendering — if you add a new prop to a leaf component and forget to
// include it in the equality fn, the test below catches the drift the
// moment that prop actually changes.

import { describe, expect, it } from 'bun:test';
import {
  capturedCountForPoints,
  computeMarkerStructuralSignature,
  computeVisitedIdsKey,
  filterPillPropsEqual,
  flattenScenesFromGroups,
  hasIntentForSpot,
  seriesSwitchChipPropsEqual,
  spotChipPropsEqual,
  statCellPropsEqual,
  visitedCountForPoints,
  type FilterPillEqualityProps,
  type MapMarkerStructural,
  type SeriesSwitchChipEqualityProps,
  type SpotChipEqualityProps,
  type StatCellEqualityProps,
} from '../../../components/pilgrimage/detail/_equality';
import type { PilgrimageSpot } from '../../../libs/services/pilgrimage/types';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { SpotIntentMap } from '../../../libs/services/pilgrimage/spot-intents';
import type { PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';

const sampleSpot: PilgrimageSpot = {
  id: 'p1',
  name: 'Sample',
  workKey: 'sample',
  address: '',
  note: '',
  lat: 35.6,
  lon: 139.7,
  confidence: 'confirmed',
  scenes: [{ episode: '第1話' }],
  sources: [],
};

const theme = { __sentinel: 'theme' } as unknown as ThemePalette;

// Shared at module scope so equality compares stable references — handlers
// passed from the parent via useCallback are similarly stable in real usage.
const noop = () => undefined;

function spotChipProps(overrides: Partial<SpotChipEqualityProps> = {}): SpotChipEqualityProps {
  return {
    spot: sampleSpot,
    active: false,
    themeColor: '#FF9F0A',
    themeColorFg: '#000',
    distanceKm: null,
    visited: false,
    saved: false,
    planned: false,
    hasCapture: false,
    theme,
    onPress: noop,
    ...overrides,
  };
}

function filterPillProps(
  overrides: Partial<FilterPillEqualityProps> = {}
): FilterPillEqualityProps {
  return {
    label: 'All',
    active: false,
    badge: 3,
    themeColor: '#FF9F0A',
    themeColorFg: '#000',
    theme,
    onPress: noop,
    ...overrides,
  };
}

function seriesSwitchChipProps(
  overrides: Partial<SeriesSwitchChipEqualityProps> = {}
): SeriesSwitchChipEqualityProps {
  return {
    label: 'S1',
    sublabel: 'Season 1',
    active: false,
    disabled: false,
    themeColor: '#FF9F0A',
    themeColorFg: '#000',
    theme,
    onPress: noop,
    ...overrides,
  };
}

function statCellProps(overrides: Partial<StatCellEqualityProps> = {}): StatCellEqualityProps {
  return {
    icon: 'place',
    value: '12',
    label: 'scenes',
    color: '#FF9F0A',
    theme,
    ...overrides,
  };
}

describe('spotChipPropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(spotChipPropsEqual(spotChipProps(), spotChipProps())).toBe(true);
  });

  it('returns false when active flips', () => {
    expect(spotChipPropsEqual(spotChipProps(), spotChipProps({ active: true }))).toBe(false);
  });

  it('returns false when spot scenes change', () => {
    const nextSpot = { ...sampleSpot, scenes: [{ episode: '第5話' }] };
    expect(spotChipPropsEqual(spotChipProps(), spotChipProps({ spot: nextSpot }))).toBe(false);
  });
});

describe('filterPillPropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(filterPillPropsEqual(filterPillProps(), filterPillProps())).toBe(true);
  });

  it.each([
    ['active', { active: true }],
    ['badge', { badge: 0 }],
    ['themeColor', { themeColor: '#000' }],
    ['label', { label: 'Visited' }],
    ['icon', { icon: 'flag' as const }],
  ] as const)('returns false when %s changes', (_label, patch) => {
    expect(filterPillPropsEqual(filterPillProps(), filterPillProps(patch))).toBe(false);
  });
});

describe('seriesSwitchChipPropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(seriesSwitchChipPropsEqual(seriesSwitchChipProps(), seriesSwitchChipProps())).toBe(true);
  });

  it('returns false when active flips', () => {
    expect(
      seriesSwitchChipPropsEqual(
        seriesSwitchChipProps({ active: false }),
        seriesSwitchChipProps({ active: true })
      )
    ).toBe(false);
  });

  it('returns false when disabled flips', () => {
    expect(
      seriesSwitchChipPropsEqual(
        seriesSwitchChipProps({ disabled: false }),
        seriesSwitchChipProps({ disabled: true })
      )
    ).toBe(false);
  });
});

describe('statCellPropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(statCellPropsEqual(statCellProps(), statCellProps())).toBe(true);
  });

  it('returns false when value changes', () => {
    expect(statCellPropsEqual(statCellProps({ value: '0' }), statCellProps({ value: '5' }))).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------
// SpotMapView bridge helpers (Phase 4).
// ---------------------------------------------------------------------

describe('SpotMapView marker bridge helpers', () => {
  const baseMarkers: MapMarkerStructural[] = [
    { id: 'a', ep: 1, image: 'i1', markerMode: 'photo', ringColor: '#ff0', visited: false },
    { id: 'b', ep: 2, image: 'i2', markerMode: 'photo', ringColor: '#ff0', visited: true },
  ];

  it('computeMarkerStructuralSignature ignores visited flag', () => {
    const a = computeMarkerStructuralSignature(baseMarkers);
    const flipped: MapMarkerStructural[] = baseMarkers.map((m) => ({ ...m, visited: !m.visited }));
    const b = computeMarkerStructuralSignature(flipped);
    expect(a).toBe(b);
  });

  it('computeMarkerStructuralSignature changes when ep or image changes', () => {
    const a = computeMarkerStructuralSignature(baseMarkers);
    const next: MapMarkerStructural[] = baseMarkers.map((m, i) =>
      i === 0 ? { ...m, image: 'iX' } : m
    );
    expect(a).not.toBe(computeMarkerStructuralSignature(next));
  });

  it('computeVisitedIdsKey returns sorted comma-joined visited ids', () => {
    const out = computeVisitedIdsKey([
      { id: 'z', ep: 1, image: '', markerMode: 'photo', ringColor: '', visited: true },
      { id: 'a', ep: 1, image: '', markerMode: 'photo', ringColor: '', visited: true },
      { id: 'm', ep: 1, image: '', markerMode: 'photo', ringColor: '', visited: false },
    ]);
    expect(out).toBe('a,z');
  });

  it('computeVisitedIdsKey returns empty string when no markers are visited', () => {
    expect(computeVisitedIdsKey([])).toBe('');
    expect(
      computeVisitedIdsKey([
        { id: 'a', ep: 1, image: '', markerMode: 'photo', ringColor: '', visited: false },
      ])
    ).toBe('');
  });
});

// ---------------------------------------------------------------------
// usePilgrimageInteractions: intent lookup helper.
// ---------------------------------------------------------------------

describe('hasIntentForSpot', () => {
  const spot: PilgrimageSpot = sampleSpot;
  const group: PilgrimageSpot = {
    id: 'g1',
    name: 'Group',
    workKey: spot.workKey,
    address: '',
    note: '',
    lat: spot.lat,
    lon: spot.lon,
    confidence: 'confirmed',
    scenes: spot.scenes,
    sources: [],
  };
  const spotIntents: SpotIntentMap = {
    g1: { saved: true },
  };

  it('returns true when any scene in the group has the intent', () => {
    expect(hasIntentForSpot({ spot, intent: 'saved', group, spotIntents })).toBe(true);
  });

  it('returns false when no scene in the group has the intent', () => {
    expect(hasIntentForSpot({ spot, intent: 'planned', group, spotIntents })).toBe(false);
  });

  it('falls back to spot id when group is undefined', () => {
    expect(
      hasIntentForSpot({
        spot,
        intent: 'saved',
        group: undefined,
        spotIntents: { p1: { saved: true } },
      })
    ).toBe(true);
    expect(
      hasIntentForSpot({
        spot,
        intent: 'planned',
        group: undefined,
        spotIntents: { p1: { saved: true } },
      })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Derived-spot pure helpers (Phase 4).
// ---------------------------------------------------------------------

describe('flattenScenesFromGroups', () => {
  const groupA: PilgrimageSpot = {
    id: 'g1',
    name: 'A',
    workKey: 'sample', address: '', note: '', lat: 0, lon: 0,
    confidence: 'confirmed', scenes: [{ episode: '第1話' }, { episode: '第2話' }], sources: [],
  };
  const groupB: PilgrimageSpot = {
    id: 'g2',
    name: 'B',
    workKey: 'sample', address: '', note: '', lat: 0, lon: 0,
    confidence: 'single', scenes: [{ episode: '第1話' }], sources: [],
  };

  it('flattens grouped scenes preserving order', () => {
    const out = flattenScenesFromGroups([groupA, groupB]);
    expect(out.map((s) => s.id)).toEqual(['g1', 'g2']);
  });

  it('handles empty input', () => {
    expect(flattenScenesFromGroups([])).toEqual([]);
  });
});

describe('visitedCountForPoints / capturedCountForPoints', () => {
  const points: PilgrimageSpot[] = [
    { ...sampleSpot, id: 'p1' },
    { ...sampleSpot, id: 'p2' },
    { ...sampleSpot, id: 'p3' },
  ];

  it('counts only ids present in the visited map', () => {
    const visited: Record<string, true> = { p1: true, p3: true };
    expect(visitedCountForPoints(points, visited)).toBe(2);
  });

  it('returns 0 for empty visited / no overlap', () => {
    expect(visitedCountForPoints(points, {})).toBe(0);
    expect(visitedCountForPoints([], { p1: true })).toBe(0);
  });

  it('counts only ids present in the captures map', () => {
    const captures: Record<string, PilgrimageCapture> = {
      p2: {
        spotId: 'p2',
        uri: 'file://x.jpg',
        capturedAt: 0,
      },
    };
    expect(capturedCountForPoints(points, captures)).toBe(1);
  });
});

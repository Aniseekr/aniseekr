import { describe, expect, it } from 'bun:test';

import {
  countPilgrimageSpotFilters,
  filterPilgrimagePoints,
  filterPilgrimageSpots,
  sortPilgrimageSpotsByIntent,
} from '../../../libs/services/pilgrimage/pilgrimage-detail-filter';
import type { SpotIntentMap } from '../../../libs/services/pilgrimage/spot-intents';
import type { AnitabiPoint, AnitabiSpot } from '../../../libs/services/pilgrimage/types';

function point(
  id: string,
  name: string,
  ep: number,
  overrides: Partial<AnitabiPoint> = {}
): AnitabiPoint {
  return {
    id,
    name,
    image: `https://img/${id}.jpg`,
    ep,
    s: 0,
    geo: [35.66, 138.56],
    ...overrides,
  };
}

function spot(id: string, scenes: AnitabiPoint[]): AnitabiSpot {
  const head = scenes[0];
  return {
    id,
    name: head.name,
    cn: head.cn,
    geo: head.geo,
    image: head.image,
    scenes,
  };
}

const station = spot('station', [
  point('station-1', '甲府駅 ホーム', 1, { cn: '甲府站 月台' }),
  point('station-11', '甲府駅 改札', 11, { cn: '甲府站 剪票口' }),
]);
const bridge = spot('bridge', [point('bridge-1', '舞鶴城公園', 1, { cn: '舞鹤城公园' })]);
const cafe = spot('cafe', [point('cafe-12', '喫茶店', 12, { cn: '咖啡厅' })]);

describe('pilgrimage detail filtering', () => {
  it('filters grouped spots by Japanese or Chinese location names', () => {
    const spots = [station, bridge, cafe];

    expect(filterPilgrimageSpots(spots, { query: '甲府駅' }).map((s) => s.id)).toEqual(['station']);
    expect(filterPilgrimageSpots(spots, { query: '咖啡' }).map((s) => s.id)).toEqual(['cafe']);
  });

  it('treats numeric and EP queries as exact episode matches', () => {
    const spots = [station, bridge, cafe];

    expect(filterPilgrimageSpots(spots, { query: 'EP 1' }).map((s) => s.id)).toEqual([
      'station',
      'bridge',
    ]);
    expect(filterPilgrimageSpots(spots, { query: '11' }).map((s) => s.id)).toEqual(['station']);
    expect(filterPilgrimagePoints(station.scenes, { query: 'ep11' }).map((p) => p.id)).toEqual([
      'station-11',
    ]);
  });

  it('applies status filters after search and counts visible searched locations', () => {
    const spots = [station, bridge, cafe];
    const visible = filterPilgrimageSpots(spots, { query: '1' });
    const visited = { 'station-1': true };
    const captures = { 'bridge-1': { uri: 'file://bridge.jpg' } };

    expect(visible.map((s) => s.id)).toEqual(['station', 'bridge']);
    expect(
      filterPilgrimageSpots(visible, { filter: 'visited', visited, captures }).map((s) => s.id)
    ).toEqual(['station']);
    expect(countPilgrimageSpotFilters(visible, visited, captures)).toEqual({
      all: 2,
      visited: 1,
      unvisited: 1,
      photos: 1,
      saved: 0,
      planned: 0,
    });
  });

  it('filters and counts saved and planned spots', () => {
    const spots = [station, bridge, cafe];
    const intents: SpotIntentMap = {
      'bridge-1': { saved: true },
      'cafe-12': { planned: true },
    };

    expect(filterPilgrimageSpots(spots, { filter: 'saved', intents }).map((s) => s.id)).toEqual([
      'bridge',
    ]);
    expect(filterPilgrimageSpots(spots, { filter: 'planned', intents }).map((s) => s.id)).toEqual([
      'cafe',
    ]);
    expect(countPilgrimageSpotFilters(spots, {}, {}, intents)).toMatchObject({
      saved: 1,
      planned: 1,
    });
  });

  it('sorts planned and saved spots before ordinary spots without losing stable order', () => {
    const spots = [station, bridge, cafe];
    const intents: SpotIntentMap = {
      'bridge-1': { saved: true },
      'cafe-12': { planned: true },
    };

    expect(sortPilgrimageSpotsByIntent(spots, intents).map((s) => s.id)).toEqual([
      'cafe',
      'bridge',
      'station',
    ]);
  });
});

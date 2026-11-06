import { describe, expect, it } from 'bun:test';

import {
  buildNearbySpots,
  buildNearbySpotsFromIndex,
} from '../../../libs/services/pilgrimage/nearby-spots';
import type { PilgrimageSpot, PilgrimageWork } from '../../../libs/services/pilgrimage/types';
import type { NearbySpot } from '../../../libs/services/pilgrimage/nearby-spots';

function spot(id: string, lat: number | null, lon: number | null, name = id): PilgrimageSpot {
  return {
    id,
    workKey: 'work',
    name,
    address: '',
    note: '',
    lat,
    lon,
    confidence: 'confirmed',
    scenes: [{ episode: '第1話' }],
    sources: [],
  };
}

function work(key: string, spots: PilgrimageSpot[]): PilgrimageWork {
  return {
    key,
    ja: key,
    en: key,
    zh: { hans: '', hant: '' },
    mal: [],
    bgm: [],
    n: spots.length,
    conf: { c: spots.length, s: 0, u: 0 },
    cities: [],
    dataVersion: 'test',
    titleJa: key,
    titleEn: key,
    titleZh: { hans: '', hant: '' },
    spots,
  };
}

// Central Tokyo — distances grow as points move east/north.
const USER = { latitude: 35.68, longitude: 139.76 };

describe('buildNearbySpots', () => {
  it('sorts spots nearest-first and tags them with the user distance', () => {
    const near = work('near-work', [spot('a', 35.69, 139.77, 'Near shrine')]);
    const far = work('far-work', [spot('b', 35.9, 140.1, 'Far station')]);

    const spots = buildNearbySpots([far, near], USER);

    expect(spots.map((s) => s.id)).toEqual(['a', 'b']);
    expect(spots[0].distanceKm).toBeLessThan(spots[1].distanceKm);
    expect(spots[0].distanceKm).toBeGreaterThan(0);
  });

  it('builds map-unique marker ids and carries work context', () => {
    const spots = buildNearbySpots(
      [work('hyouka', [spot('p1', 35.681, 139.761, 'Café')])],
      USER
    );

    expect(spots[0].markerId).toBe('hyouka:p1');
    expect(spots[0].workKey).toBe('hyouka');
    expect(spots[0].episodes).toEqual(['第1話']);
  });

  it('skips null payloads and spots with unconfirmed locations', () => {
    const workWithUnknownLocation = work('sample', [
      spot('known', 35.682, 139.762),
      spot('unknown', null, null),
    ]);

    const spots = buildNearbySpots([null, undefined, workWithUnknownLocation], USER);

    expect(spots.map((s) => s.id)).toEqual(['known']);
  });

  it('caps the result at maxSpots', () => {
    const many = work(
      'many',
      Array.from({ length: 12 }, (_, i) => spot(`s${i}`, 35.68 + i * 0.01, 139.76))
    );

    expect(buildNearbySpots([many], USER, 5)).toHaveLength(5);
  });
});

describe('buildNearbySpotsFromIndex', () => {
  const hits: NearbySpot[] = [
    {
      id: 'p1', markerId: 'one:p1', workKey: 'one', lat: 35, lon: 139,
      name: '駅前', address: '', confidence: 'confirmed', episodes: ['第1話'], distanceKm: 5,
    },
    {
      id: 'p2', markerId: 'two:p2', workKey: 'two', lat: 35, lon: 139,
      name: 'Shrine', address: '', confidence: 'single', episodes: ['第2話'], distanceKm: 1,
    },
  ];

  it('sorts collection works first, then by distance', () => {
    const out = buildNearbySpotsFromIndex(hits, new Set(['one']));
    expect(out.map((s) => s.id)).toEqual(['p1', 'p2']);
  });

  it('without collection, sorts purely by distance', () => {
    const out = buildNearbySpotsFromIndex(hits);
    expect(out.map((s) => s.id)).toEqual(['p2', 'p1']);
  });
});

import { describe, expect, it } from 'bun:test';

import { buildNearbySpots, buildNearbySpotsFromIndex } from '../../../libs/services/pilgrimage/nearby-spots';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import type { NearbySpotHit } from '../../../libs/services/pilgrimage/spot-index';

function point(
  id: string,
  name: string,
  geo: [number, number],
  ep = 1
): AnitabiPoint {
  return { id, name, image: `https://img/${id}.jpg`, ep, s: 0, geo };
}

function bangumi(id: number, litePoints: AnitabiPoint[], over: Partial<AnitabiBangumi> = {}): AnitabiBangumi {
  return {
    id,
    cn: `动画${id}`,
    title: `Anime ${id}`,
    city: '',
    cover: '',
    color: '#abcdef',
    geo: [35, 139],
    zoom: 12,
    modified: 0,
    litePoints,
    pointsLength: litePoints.length,
    imagesLength: litePoints.length,
    ...over,
  };
}

// Central Tokyo — distances grow as points move east/north.
const USER = { latitude: 35.68, longitude: 139.76 };

describe('buildNearbySpots', () => {
  it('sorts spots nearest-first and tags them with the user distance', () => {
    const near = bangumi(1, [point('a', 'Near shrine', [35.69, 139.77])]);
    const far = bangumi(2, [point('b', 'Far station', [35.9, 140.1])]);

    const spots = buildNearbySpots([far, near], USER);

    expect(spots.map((s) => s.id)).toEqual(['a', 'b']);
    expect(spots[0].distanceKm).toBeLessThan(spots[1].distanceKm);
    expect(spots[0].distanceKm).toBeGreaterThan(0);
  });

  it('builds map-unique marker ids and carries anime context', () => {
    const spots = buildNearbySpots(
      [bangumi(42, [point('p1', 'Café', [35.681, 139.761])])],
      USER
    );

    expect(spots[0].markerId).toBe('42:p1');
    expect(spots[0].animeId).toBe(42);
    expect(spots[0].animeTitle).toBe('动画42');
    expect(spots[0].ringColor).toBe('#abcdef');
  });

  it('collapses scene-cuts of one location into a single spot with a scene count', () => {
    // Three cuts of the same shrine (same name, within 60 m) → one spot.
    const cuts = [
      point('c1', '伏見稲荷', [35.6829, 139.7601]),
      point('c2', '伏見稲荷', [35.68291, 139.76011]),
      point('c3', '伏見稲荷', [35.68292, 139.76012]),
    ];
    const spots = buildNearbySpots([bangumi(7, cuts)], USER);

    expect(spots).toHaveLength(1);
    expect(spots[0].sceneCount).toBe(3);
  });

  it('skips null payloads and points with no real geo', () => {
    const withBadGeo = bangumi(3, [
      point('ok', 'Real place', [35.682, 139.762]),
      point('bad', 'Missing geo', [0, 0]),
    ]);

    const spots = buildNearbySpots([null, undefined, withBadGeo], USER);

    expect(spots.map((s) => s.id)).toEqual(['ok']);
  });

  it('caps the result at maxSpots', () => {
    const many = bangumi(
      9,
      Array.from({ length: 12 }, (_, i) =>
        point(`s${i}`, `Spot ${i}`, [35.68 + i * 0.01, 139.76])
      )
    );

    expect(buildNearbySpots([many], USER, 5)).toHaveLength(5);
  });
});

describe('buildNearbySpotsFromIndex', () => {
  const hits: NearbySpotHit[] = [
    { pointId: 'p1', bangumiId: 1, lat: 35, lng: 139, name: '駅前', cn: '车站前', image: '/images/points/1/p1.jpg', distanceKm: 5 },
    { pointId: 'p2', bangumiId: 2, lat: 35, lng: 139, name: 'Shrine', cn: '', image: '/images/points/2/p2.jpg', distanceKm: 1 },
  ];
  const lookup = (id: number) =>
    id === 1
      ? { title: 'Anime One', cn: '动画一', color: '#111111' }
      : id === 2
        ? { title: 'Anime Two', cn: '', color: '' }
        : null;

  it('normalizes image to an absolute CDN url and prefers cn name', () => {
    const out = buildNearbySpotsFromIndex(hits, lookup, new Set());
    const p1 = out.find((s) => s.id === 'p1')!;
    expect(p1.image).toBe('https://image.anitabi.cn/points/1/p1.jpg?plan=h160');
    expect(p1.name).toBe('车站前');
    expect(p1.animeTitle).toBe('动画一');
    expect(p1.markerId).toBe('1:p1');
  });

  it('sorts collection anime first, then by distance', () => {
    const out = buildNearbySpotsFromIndex(hits, lookup, new Set([1]));
    // bangumi 1 is in the collection so it leads despite being farther (5km > 1km).
    expect(out.map((s) => s.id)).toEqual(['p1', 'p2']);
  });

  it('without collection, sorts purely by distance', () => {
    const out = buildNearbySpotsFromIndex(hits, lookup, new Set());
    expect(out.map((s) => s.id)).toEqual(['p2', 'p1']);
  });
});

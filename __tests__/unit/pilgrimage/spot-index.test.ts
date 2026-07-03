import { describe, expect, test } from 'bun:test';
import {
  boundsForRadius,
  haversineKm,
  rankSpotsByDistance,
  type SpotIndexRow,
} from '../../../libs/services/pilgrimage/spot-index';

function row(pointId: string, lat: number, lng: number, bangumiId = 1): SpotIndexRow {
  return { pointId, bangumiId, lat, lng, name: pointId, cn: '', image: `/i/${pointId}.jpg` };
}

describe('boundsForRadius', () => {
  test('a 111km radius is ~1° of latitude', () => {
    const box = boundsForRadius(35, 139, 111);
    expect(box.maxLat - 35).toBeCloseTo(1, 1);
    expect(35 - box.minLat).toBeCloseTo(1, 1);
  });
  test('longitude degrees widen with latitude (÷cos lat)', () => {
    const box = boundsForRadius(60, 0, 111);
    // cos(60°)=0.5 ⇒ ~2° of longitude per 111km.
    expect(box.maxLng - 0).toBeCloseTo(2, 0);
  });
});

describe('haversineKm', () => {
  test('one degree of latitude is ~111km', () => {
    expect(haversineKm(35, 139, 36, 139)).toBeCloseTo(111, 0);
  });
});

describe('rankSpotsByDistance', () => {
  test('filters beyond the radius, sorts nearest-first, caps at limit', () => {
    const candidates = [
      row('far', 36, 139), // ~111km away
      row('near', 35.01, 139), // ~1.1km
      row('mid', 35.1, 139), // ~11km
    ];
    const out = rankSpotsByDistance(candidates, 35, 139, 30, 10);
    expect(out.map((s) => s.pointId)).toEqual(['near', 'mid']); // 'far' dropped
    expect(out[0].distanceKm).toBeLessThan(out[1].distanceKm);
    expect(out[0]).toHaveProperty('distanceKm');
  });
  test('respects the limit', () => {
    const candidates = [row('a', 35.001, 139), row('b', 35.002, 139), row('c', 35.003, 139)];
    expect(rankSpotsByDistance(candidates, 35, 139, 30, 2)).toHaveLength(2);
  });
});

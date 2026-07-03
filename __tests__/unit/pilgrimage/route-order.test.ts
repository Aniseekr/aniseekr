import { describe, expect, test } from 'bun:test';
import {
  haversineKm,
  orderSpotsByNearestNeighbor,
  type OrderableSpot,
} from '../../../libs/services/pilgrimage/route-order';

// A tiny east-west chain of stops (roughly Kyoto latitude, ~1km apart in lng).
const A: OrderableSpot = { id: 'A', geo: [35.0, 135.0] };
const B: OrderableSpot = { id: 'B', geo: [35.0, 135.02] };
const C: OrderableSpot = { id: 'C', geo: [35.0, 135.04] };
const D: OrderableSpot = { id: 'D', geo: [35.0, 135.06] };

describe('haversineKm', () => {
  test('same point is 0', () => {
    expect(haversineKm([35, 135], [35, 135])).toBe(0);
  });
  test('~2km between A and C is monotonic vs A-B', () => {
    expect(haversineKm(A.geo, C.geo)).toBeGreaterThan(haversineKm(A.geo, B.geo));
  });
});

describe('orderSpotsByNearestNeighbor', () => {
  test('null start preserves original order (fresh copy)', () => {
    const input = [C, A, D, B];
    const out = orderSpotsByNearestNeighbor(input, null);
    expect(out.map((s) => s.id)).toEqual(['C', 'A', 'D', 'B']);
    expect(out).not.toBe(input);
  });
  test('chains nearest-neighbor from a start just west of A', () => {
    const out = orderSpotsByNearestNeighbor([D, B, A, C], { latitude: 35.0, longitude: 134.99 });
    expect(out.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D']);
  });
  test('empty input returns empty', () => {
    expect(orderSpotsByNearestNeighbor([], { latitude: 0, longitude: 0 })).toEqual([]);
  });
});

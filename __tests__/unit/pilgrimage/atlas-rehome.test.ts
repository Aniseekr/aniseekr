import { describe, expect, it } from 'bun:test';
import { rehomeNearestSpot } from '../../../libs/services/pilgrimage/atlas/rehome';

const origin: [number, number] = [35, 139];
const metersEast = (meters: number): [number, number] => [
  35,
  139 + meters / (111_195 * Math.cos((35 * Math.PI) / 180)),
];

describe('Atlas legacy spot rehoming', () => {
  it('PILG-085 matches the nearest located spot at 49.9 m and rejects 50.1 m', () => {
    const spots = [
      { id: 'inside', location: { lat: metersEast(49.9)[0], lon: metersEast(49.9)[1] } },
      { id: 'outside', location: { lat: metersEast(50.1)[0], lon: metersEast(50.1)[1] } },
    ];
    expect(rehomeNearestSpot(origin, spots)?.id).toBe('inside');
    expect(rehomeNearestSpot(origin, [spots[1]])).toBeNull();
  });

  it('PILG-085 includes a spot exactly 50 m away and skips spots without location', () => {
    const edge = metersEast(50);
    expect(
      rehomeNearestSpot(origin, [{ id: 'edge', location: { lat: edge[0], lon: edge[1] } }])?.id
    ).toBe('edge');
    expect(rehomeNearestSpot(origin, [{ id: 'unknown', location: null }])).toBeNull();
    expect(
      rehomeNearestSpot(undefined, [{ id: 'edge', location: { lat: 35, lon: 139 } }])
    ).toBeNull();
  });
});

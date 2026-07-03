import { describe, expect, test } from 'bun:test';
import { routeLineFeature } from '../../../libs/services/pilgrimage/map-engine/route-shape';
import type { MapRoute } from '../../../libs/services/pilgrimage/map-engine/types';

describe('routeLineFeature', () => {
  test('builds a LineString with lng-first coordinates', () => {
    const route: MapRoute = {
      id: 'trip-1',
      kind: 'tour',
      color: '#4a90d9',
      coords: [
        { lat: 35, lng: 135 },
        { lat: 36, lng: 136 },
      ],
    };
    expect(routeLineFeature(route)).toEqual({
      type: 'Feature',
      properties: { id: 'trip-1' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [135, 35],
          [136, 36],
        ],
      },
    });
  });
});

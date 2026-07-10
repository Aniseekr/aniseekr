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

  test('returns null for empty coords (invalid LineString per RFC 7946 §3.1.4)', () => {
    const route: MapRoute = { id: 'trip-empty', kind: 'tour', coords: [] };
    expect(routeLineFeature(route)).toBeNull();
  });

  test('returns null for a single coord (needs ≥2 positions)', () => {
    const route: MapRoute = {
      id: 'trip-single',
      kind: 'tour',
      coords: [{ lat: 35, lng: 135 }],
    };
    expect(routeLineFeature(route)).toBeNull();
  });

  test('builds a valid feature for exactly 2 coords', () => {
    const route: MapRoute = {
      id: 'trip-2',
      kind: 'gpx',
      coords: [
        { lat: 35, lng: 135 },
        { lat: 35.1, lng: 135.1 },
      ],
    };
    expect(routeLineFeature(route)).toEqual({
      type: 'Feature',
      properties: { id: 'trip-2' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [135, 35],
          [135.1, 35.1],
        ],
      },
    });
  });
});

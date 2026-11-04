import { describe, expect, it } from 'bun:test';

import {
  getNearestSceneForSpot,
  getSpotDistanceKm,
  sortSpotsByDistance,
} from '../../../libs/services/pilgrimage/spot-distance-sort';
import type { LatLng } from '../../../libs/services/pilgrimage/location-service';
import type { PilgrimageSpot } from '../../../libs/services/pilgrimage/types';

const USER: LatLng = { latitude: 35.68, longitude: 139.76 };

function spot(id: string, lat: number | null, lon: number | null): PilgrimageSpot {
  return {
    id,
    workKey: 'hyouka',
    name: id,
    address: '',
    note: '',
    lat,
    lon,
    confidence: 'confirmed',
    scenes: [{ episode: '第1話' }],
    sources: [],
  };
}

describe('spot distance sorting', () => {
  it('sorts spots nearest-first and puts missing locations at the end', () => {
    const far = spot('far', 35.9, 140.1);
    const missing = spot('missing', null, null);
    const near = spot('near', 35.681, 139.761);

    const sorted = sortSpotsByDistance([far, missing, near], USER);

    expect(sorted.map((s) => s.id)).toEqual(['near', 'far', 'missing']);
  });

  it('returns the work scene for a located spot', () => {
    const located = spot('located', 35.681, 139.761);
    const unlocated = spot('unlocated', null, null);

    expect(getSpotDistanceKm(located, USER)).not.toBeNull();
    expect(getSpotDistanceKm(unlocated, USER)).toBeNull();
    expect(getNearestSceneForSpot(located, USER)).toEqual({ episode: '第1話' });
  });

  it('preserves source order when user location is unavailable', () => {
    const input = [spot('first', 35.9, 140.1), spot('second', 35.681, 139.761)];
    const sorted = sortSpotsByDistance(input, null);

    expect(sorted.map((s) => s.id)).toEqual(['first', 'second']);
    expect(sorted).not.toBe(input);
  });

  it('keeps stable order when distances tie', () => {
    const input = [spot('first', 35.681, 139.761), spot('second', 35.681, 139.761)];

    expect(sortSpotsByDistance(input, USER).map((s) => s.id)).toEqual(['first', 'second']);
  });
});

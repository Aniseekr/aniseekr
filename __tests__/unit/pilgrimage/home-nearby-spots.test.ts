import { describe, expect, it } from 'bun:test';
import { resolveHomeNearbySpots } from '../../../libs/services/pilgrimage/home-nearby-spots';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import type { NearbySpotHit } from '../../../libs/services/pilgrimage/spot-index';

const userLocation = { latitude: 35.6613, longitude: 139.668 };
const anime: AnitabiBangumi = {
  id: 1,
  title: '下北沢の作品',
  cn: '',
  city: '東京都',
  cover: '',
  color: '',
  geo: [35.662, 139.668],
  zoom: 13,
  modified: 0,
  pointsLength: 1,
  imagesLength: 1,
  litePoints: [
    { id: 'near', name: '下北沢', cn: '', image: '/near.jpg', geo: [35.662, 139.668], ep: 1, s: 0 },
  ],
};
const indexed: NearbySpotHit = {
  pointId: 'farther',
  bangumiId: 2,
  name: '遠い場景',
  cn: '',
  image: '/far.jpg',
  lat: 35.69,
  lng: 139.7,
  distanceKm: 4,
};

describe('PILG-077 home nearby fallback', () => {
  it('uses real litePoints while the SQLite spot index is empty', () => {
    const result = resolveHomeNearbySpots({
      userLocation,
      animes: [anime],
      indexNearest: null,
      indexWithin3Km: [],
      indexCount: 0,
    });
    expect(result.nearestSpot?.pointId).toBe('near');
    expect(result.nearbyCount).toBe(1);
    expect(result.coverage).toBe('unknown');
  });

  it('chooses the closer of index and litePoint hits', () => {
    const result = resolveHomeNearbySpots({
      userLocation,
      animes: [anime],
      indexNearest: indexed,
      indexWithin3Km: [],
      indexCount: 100,
    });
    expect(result.nearestSpot?.pointId).toBe('near');
    expect(result.nearbyCount).toBe(1);
    expect(result.coverage).toBe('known');
  });

  it('does not claim a 50 km empty result before index coverage exists', () => {
    expect(
      resolveHomeNearbySpots({
        userLocation,
        animes: [],
        indexNearest: null,
        indexWithin3Km: [],
        indexCount: 0,
      }).coverage
    ).toBe('unknown');
    expect(
      resolveHomeNearbySpots({
        userLocation,
        animes: [],
        indexNearest: null,
        indexWithin3Km: [],
        indexCount: 100,
      }).coverage
    ).toBe('known');
  });
});

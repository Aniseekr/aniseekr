import { describe, expect, it } from 'bun:test';
import { resolveHomeNearbySpots } from '../../../libs/services/pilgrimage/home-nearby-spots';
import type { PilgrimageWork } from '../../../libs/services/pilgrimage/types';
import type { NearbySpotHit } from '../../../libs/services/pilgrimage/spot-index';

const userLocation = { latitude: 35.6613, longitude: 139.668 };
const work: PilgrimageWork = {
  key: '下北沢の作品',
  ja: '下北沢の作品',
  en: '',
  zh: { hans: '', hant: '' },
  mal: [],
  bgm: [],
  n: 1,
  conf: { c: 1, s: 0, u: 0 },
  cities: ['東京都'],
  dataVersion: 'test',
  titleJa: '下北沢の作品',
  titleEn: '',
  titleZh: { hans: '', hant: '' },
  spots: [{
    id: 'near',
    workKey: '下北沢の作品',
    name: '下北沢',
    address: '',
    note: '',
    lat: 35.662,
    lon: 139.668,
    confidence: 'confirmed',
    scenes: [{ episode: '第1話' }],
    sources: [],
  }],
};
const indexed: NearbySpotHit = {
  spotId: 'farther',
  workKey: 'other',
  name: '遠い場景',
  lat: 35.69,
  lon: 139.7,
  confidence: 'confirmed',
  episodes: [1],
  distanceKm: 4,
};

describe('PILG-077 home nearby fallback', () => {
  it('uses Atlas work spots while the nearby index is empty', () => {
    const result = resolveHomeNearbySpots({
      userLocation,
      animes: [work],
      indexNearest: null,
      indexWithin3Km: [],
      indexCount: 0,
    });
    expect(result.nearestSpot?.spotId).toBe('near');
    expect(result.nearbyCount).toBe(1);
    expect(result.coverage).toBe('unknown');
  });

  it('chooses the closer of index and Atlas work hits', () => {
    const result = resolveHomeNearbySpots({
      userLocation,
      animes: [work],
      indexNearest: indexed,
      indexWithin3Km: [],
      indexCount: 100,
    });
    expect(result.nearestSpot?.spotId).toBe('near');
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

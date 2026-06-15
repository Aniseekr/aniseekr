import { describe, expect, it } from 'bun:test';
import { buildShareRouteParams } from '../../../libs/services/pilgrimage/share-route-params';

const base = {
  spotId: 'spot-7',
  imageUrl: 'https://cdn/scene.jpg',
  shotUri: 'file:///shot.jpg',
  name: '駅前の坂道',
  ep: '3',
  animeId: '12345',
  animeTitle: 'My Anime',
  themeColor: '#FF9F0A',
  spotLat: '35.0316',
  spotLng: '135.7721',
  shotWidth: 3024,
  shotHeight: 4032,
} as const;

describe('buildShareRouteParams', () => {
  it('always forwards the captured shot dimensions as strings', () => {
    const params = buildShareRouteParams(base);
    expect(params.shotWidth).toBe('3024');
    expect(params.shotHeight).toBe('4032');
  });

  it('carries the core scene metadata through verbatim', () => {
    const params = buildShareRouteParams(base);
    expect(params.spotId).toBe('spot-7');
    expect(params.imageUrl).toBe('https://cdn/scene.jpg');
    expect(params.shotUri).toBe('file:///shot.jpg');
    expect(params.name).toBe('駅前の坂道');
    expect(params.ep).toBe('3');
    expect(params.animeId).toBe('12345');
    expect(params.animeTitle).toBe('My Anime');
    expect(params.themeColor).toBe('#FF9F0A');
    expect(params.spotLat).toBe('35.0316');
    expect(params.spotLng).toBe('135.7721');
  });

  it('coerces null-ish scalar fields to empty strings (router-safe)', () => {
    const params = buildShareRouteParams({
      ...base,
      ep: null,
      animeId: null,
      animeTitle: null,
      spotLat: null,
      spotLng: null,
    });
    expect(params.ep).toBe('');
    expect(params.animeId).toBe('');
    expect(params.animeTitle).toBe('');
    expect(params.spotLat).toBe('');
    expect(params.spotLng).toBe('');
  });

  it('omits optional sensor/score params when their values are absent', () => {
    const params = buildShareRouteParams(base);
    expect('tilt' in params).toBe(false);
    expect('headingDeltaDeg' in params).toBe(false);
    expect('matchScore' in params).toBe(false);
    expect('frameValid' in params).toBe(false);
    expect('frameReason' in params).toBe(false);
    expect('positionScore' in params).toBe(false);
  });

  it('includes the sensor + score params when present, stringified', () => {
    const params = buildShareRouteParams({
      ...base,
      tilt: 1.5,
      headingDeltaDeg: -4.25,
      matchScore: 72,
      frameValid: true,
      frameReason: 'dark',
      positionScore: 88,
    });
    expect(params.tilt).toBe('1.5');
    expect(params.headingDeltaDeg).toBe('-4.25');
    expect(params.matchScore).toBe('72');
    expect(params.frameValid).toBe('1');
    expect(params.frameReason).toBe('dark');
    expect(params.positionScore).toBe('88');
  });

  it('encodes frameValid=false as "0" (suppresses a misleading badge downstream)', () => {
    const params = buildShareRouteParams({ ...base, frameValid: false });
    expect(params.frameValid).toBe('0');
  });
});

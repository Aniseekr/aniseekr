import { describe, expect, it } from 'bun:test';
import {
  availablePreviewModes,
  buildImportedCompareParams,
  buildSceneCompareParams,
  resolveCaptureBucket,
} from '../../../libs/services/pilgrimage/reference-route';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { referenceResize } from '../../../libs/services/pilgrimage/reference-image-policy';

function spot(overrides: Partial<AnitabiPoint> = {}): AnitabiPoint {
  return {
    id: 'pt-1',
    name: '沼津駅',
    image: 'https://image.anitabi.cn/points/1.jpg',
    ep: 3,
    s: 42,
    geo: [35.1, 138.86],
    ...overrides,
  };
}

describe('reference compare params', () => {
  it('PILG-068 an anime-scene reference carries the real spot fields', () => {
    const params = buildSceneCompareParams(spot(), {
      animeId: 165553,
      animeTitle: 'ラブライブ！サンシャイン!!',
      themeColor: '#FF9F0A',
    });
    expect(params).toMatchObject({
      spotId: 'pt-1',
      imageUrl: 'https://image.anitabi.cn/points/1.jpg',
      name: '沼津駅',
      ep: '3',
      animeId: '165553',
      spotLat: '35.1',
      spotLng: '138.86',
    });
    expect(params.referenceKind).toBeUndefined();
  });

  it('PILG-068 a scene without geo sends no coordinates at all', () => {
    const params = buildSceneCompareParams(spot({ geo: [0, 0] }), {
      animeId: 1,
      animeTitle: 'A',
      themeColor: '#fff',
    });
    expect('spotLat' in params).toBe(false);
    expect('spotLng' in params).toBe(false);
  });

  it('PILG-068 an imported reference has no invented scene, anime or geo', () => {
    const params = buildImportedCompareParams('file:///ref.jpg', {
      label: 'Imported reference',
      themeColor: '#FF9F0A',
      now: 1_700_000_000_000,
      nonce: 7,
    });
    expect(params).toEqual({
      spotId: 'ref-1700000000000-7',
      imageUrl: 'file:///ref.jpg',
      name: 'Imported reference',
      ep: '',
      animeId: '',
      animeTitle: '',
      themeColor: '#FF9F0A',
      referenceKind: 'imported',
    });
  });

  it('PILG-068 imported or missing references are filed in the free bucket, scenes under their spot', () => {
    expect(resolveCaptureBucket({ referenceKind: 'imported', imageUrl: 'file:///r.jpg' })).toBe(
      'free'
    );
    expect(resolveCaptureBucket({ imageUrl: '' })).toBe('free');
    expect(resolveCaptureBucket({ imageUrl: 'https://image.anitabi.cn/p.jpg' })).toBe('spot');
  });
});

describe('preview modes', () => {
  it('PILG-069 a shot without a reference only offers the single-photo view', () => {
    expect(availablePreviewModes(false)).toEqual(['full']);
  });

  it('PILG-069 a shot with a reference offers every comparison layout, stacked first', () => {
    expect(availablePreviewModes(true)).toEqual([
      'stacked',
      'sideBySide',
      'overlay',
      'slider',
      'full',
    ]);
  });
});

describe('imported reference normalisation', () => {
  it('PILG-068 large library picks are scaled so the longest edge is 1920px', () => {
    expect(referenceResize(8064, 6048)).toEqual({ width: 1920 });
    expect(referenceResize(3024, 4032)).toEqual({ height: 1920 });
  });

  it('PILG-068 images that already fit are left alone', () => {
    expect(referenceResize(1920, 1080)).toBeNull();
    expect(referenceResize(0, 0)).toBeNull();
  });
});

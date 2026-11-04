import { describe, expect, it } from 'bun:test';
import { buildPilgrimageAlbumEntries } from '../../../libs/services/pilgrimage/album-captures';
import type { PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';
import type { PilgrimageWork } from '../../../libs/services/pilgrimage/types';

const capture: PilgrimageCapture = {
  spotId: 'retired-id',
  uri: 'file:///capture.jpg',
  capturedAt: 1,
  animeId: 123,
  spotGeo: [35, 139],
};
const work: PilgrimageWork = {
  dataVersion: 'v1',
  key: 'work',
  ja: '作品',
  en: null,
  bgm: [123],
  mal: [],
  n: 1,
  conf: { c: 1, s: 0, u: 0 },
  cities: [],
  titleJa: '作品',
  titleEn: '',
  spots: [
    {
      id: 'atlas-id',
      workKey: 'work',
      name: 'Atlas spot',
      address: '',
      note: '',
      lat: 35,
      lon: 139,
      confidence: 'confirmed',
      scenes: [],
      sources: [],
    },
  ],
};

describe('Pilgrimage album capture hydration', () => {
  it('PILG-092 uses the shared 50 metre matcher for a missing stored spot id', () => {
    const [entry] = buildPilgrimageAlbumEntries({ captures: [capture], animes: [work] });
    expect(entry.spot?.id).toBe('atlas-id');
    expect(entry.anime).toBe(work);
  });

  it('PILG-092 keeps an explicitly legacy capture unpaired', () => {
    const [entry] = buildPilgrimageAlbumEntries({
      captures: [{ ...capture, legacy: true }],
      animes: [work],
    });
    expect(entry.spot).toBeNull();
    expect(entry.anime).toBeNull();
  });
});

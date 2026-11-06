import { describe, expect, it } from 'bun:test';
import type { AtlasClient } from '../../../libs/services/pilgrimage/atlas/atlas-client';
import type { AtlasWork, AtlasWorkDetail } from '../../../libs/services/pilgrimage/atlas/types';
import { PilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';

describe('PilgrimageRepository handles sparse Atlas fields', () => {
  it('uses the Japanese title when the Chinese title value contains no Han characters', () => {
    expect(
      getPilgrimageAnimeTitles(
        {
          titleJa: 'ラブライブ！サンシャイン!!',
          titleEnglish: 'Love Live! Sunshine!!',
          titleZh: { hans: 'LoveLive! Sunshine!!', hant: 'LoveLive! Sunshine!!' },
        },
        { appLanguage: 'zh-Hant' }
      ).primary
    ).toBe('ラブライブ！サンシャイン!!');
  });

  it('normalizes missing titles and spot details at the repository boundary', async () => {
    const row = {
      key: 'sparse-work',
      ja: '疎な作品',
      en: null,
      mal: [],
      n: 1,
      conf: { c: 0, s: 0, u: 1 },
      cities: [],
    } as unknown as AtlasWork;
    const detail = {
      dataVersion: 'test-version',
      franchiseKey: 'sparse-work',
      titleJa: '疎な作品',
      malIds: [],
      spots: [
        {
          id: 'sparse-spot',
          name_ja: '住所未確認',
          confidence: 'unverified',
          location: null,
          sources: [],
        },
      ],
    } as unknown as AtlasWorkDetail;
    const client = {
      works: async () => ({ works: [row] }),
      work: async () => detail,
    } as unknown as AtlasClient;
    const repository = new PilgrimageRepository({ client });

    const work = await repository.getSpotsByKey('sparse-work');

    expect(work).not.toBeNull();
    expect(work?.titleEn).toBe('');
    expect(work?.titleZh).toBeUndefined();
    expect(() => getPilgrimageAnimeTitles(work!, { appLanguage: 'zh-Hant' })).not.toThrow();
    expect(getPilgrimageAnimeTitles(work!, { appLanguage: 'zh-Hant' }).primary).toBe('疎な作品');
    expect(work?.spots[0]).toMatchObject({
      address: '',
      note: '',
      scenes: [],
      lat: null,
      lon: null,
    });
  });
});

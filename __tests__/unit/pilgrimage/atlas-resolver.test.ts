import { describe, expect, it } from 'bun:test';
import { resolveAtlasWork } from '../../../libs/services/pilgrimage/atlas/atlas-resolver';
import { animeDetailAtlasContext } from '../../../libs/services/pilgrimage/pilgrimage-repository';

const works = [
  {
    key: 'hyouka',
    ja: '氷菓',
    en: 'Hyouka',
    mal: [12189],
    bgm: [27364],
    zh: { hans: '', hant: '' },
    n: 1,
    conf: { c: 1, s: 0, u: 0 },
    cities: [],
  },
  {
    key: 'yuru-camp',
    ja: 'ゆるキャン△',
    en: 'Laid-Back Camp',
    mal: [34798],
    bgm: [226780],
    zh: { hans: '', hant: '' },
    n: 1,
    conf: { c: 1, s: 0, u: 0 },
    cities: [],
  },
];

describe('Atlas work resolver', () => {
  it('PILG-079 prioritizes Bangumi id over MAL and titles', async () => {
    await expect(
      resolveAtlasWork({ bgmId: 27364, malId: 34798, title: 'wrong' }, works)
    ).resolves.toBe('hyouka');
  });

  it('PILG-079 resolves MAL id and exact normalized titles', async () => {
    await expect(resolveAtlasWork({ malId: 12189 }, works)).resolves.toBe('hyouka');
    await expect(resolveAtlasWork({ title: ' ＨＹＯＵＫＡ ' }, works)).resolves.toBe('hyouka');
  });

  it('normalizes all dash variants while keeping title matching exact', async () => {
    const shipWork = {
      ...works[0],
      key: 'kantai-collection',
      ja: '艦隊これくしょん ‐艦これ‐',
      en: 'Kantai Collection',
    };
    await expect(
      resolveAtlasWork({ titleJa: '艦隊これくしょん – 艦これ –' }, [shipWork])
    ).resolves.toBe('kantai-collection');
    await expect(
      resolveAtlasWork({ titleJa: '艦隊これくしょん – 艦これ – 改' }, [shipWork])
    ).resolves.toBeNull();
  });

  it('PILG-080 never treats an AniList id as a MAL id', async () => {
    const fetchPrequels = async () => [
      { anilistId: 34798, malId: null, title: 'unknown', relationType: 'PREQUEL' as const },
    ];
    await expect(resolveAtlasWork({ anilistId: 4 }, works, fetchPrequels)).resolves.toBeNull();
  });

  it('PILG-080 follows PREQUEL hops by AniList id and matches its MAL id', async () => {
    const requested: string[] = [];
    const fetchPrequels = async (id: string) => {
      requested.push(id);
      if (id === '4')
        return [
          { anilistId: 3, malId: null, title: 'intermediate', relationType: 'PREQUEL' as const },
        ];
      if (id === '3')
        return [
          { anilistId: 2, malId: 34798, title: 'Yuru Camp', relationType: 'PREQUEL' as const },
        ];
      return [];
    };
    await expect(resolveAtlasWork({ anilistId: 4 }, works, fetchPrequels)).resolves.toBe(
      'yuru-camp'
    );
    expect(requested).toEqual(['4', '3']);
  });

  it('PILG-080 only matches the direct prequel title, not unrelated relations', async () => {
    const fetchPrequels = async () => [
      { anilistId: 3, malId: null, title: 'unrelated', relationType: 'PREQUEL' as const },
    ];
    await expect(resolveAtlasWork({ anilistId: 4 }, works, fetchPrequels)).resolves.toBeNull();
  });

  it('PILG-081 returns null on a title miss without fuzzy matching', async () => {
    await expect(resolveAtlasWork({ title: 'Hyouka!! extra' }, works)).resolves.toBeNull();
  });

  it('A2 preserves MAL and AniList ids from anime details when browse source is MAL', async () => {
    const context = animeDetailAtlasContext({
      id: '104459',
      idMal: 38474,
      title: 'Laid-Back Camp Season 2',
      titleJapanese: 'ゆるキャン△ SEASON２',
      titleEnglish: 'Laid-Back Camp Season 2',
      titleRomaji: 'Yuru Camp△ Season 2',
      platformData: {
        anilist: { id: '104459' },
        myanimelist: { id: '38474' },
      },
    });
    const fetchPrequels = async (id: string) => {
      expect(id).toBe('104459');
      return [
        {
          anilistId: 98444,
          malId: 34798,
          title: 'Yuru Camp△',
          relationType: 'PREQUEL' as const,
        },
      ];
    };

    expect(context).toMatchObject({ anilistId: '104459', malId: '38474' });
    await expect(resolveAtlasWork(context, works, fetchPrequels)).resolves.toBe('yuru-camp');
  });
});

// Unit tests for the Anime Tourism 88 offline repository.
// Spec cases: A88-REPO-001..007.

import { describe, expect, it } from 'bun:test';

import {
  ANIME_TOURISM_88_REGIONS,
  AnimeTourism88Repository,
  type AnimeTourism88DataFile,
  type AnimeTourism88Entry,
} from '../../../libs/services/pilgrimage/anime88-repository';
import type { LocalityRepository } from '../../../libs/services/pilgrimage/locality/repository';
import type {
  AreaDestination,
  AreaDestinationId,
} from '../../../libs/services/pilgrimage/locality/types';

const YURUCAMP_YAMANASHI: AnimeTourism88Entry = {
  id: 1,
  year: 2025,
  titleJa: '『ゆるキャン△』シリーズ',
  titleEn: 'LAID-BACK CAMP series',
  region: 'chubu',
  prefecture: '山梨県',
  city: '山梨市',
  regionEn: 'Yamanashi Pref. / Yamanashi City',
  externalIds: { bangumi: 207195, anilist: 98444, mal: null },
  anilistPopularity: 160391,
};
const YURUCAMP_TOKYO: AnimeTourism88Entry = {
  id: 2,
  year: 2025,
  titleJa: '『ゆるキャン△』シリーズ',
  titleEn: 'LAID-BACK CAMP series',
  region: 'tokyo',
  prefecture: '東京都',
  city: '昭島市',
  regionEn: 'Tokyo / Akishima City',
  externalIds: { bangumi: 207195, anilist: 98444, mal: null },
  anilistPopularity: 160391,
};
const BOCCHI: AnimeTourism88Entry = {
  id: 3,
  year: 2025,
  titleJa: 'ぼっち・ざ・ろっく！',
  titleEn: 'BOCCHI THE ROCK!',
  region: 'tokyo',
  prefecture: '東京都',
  city: '世田谷区',
  regionEn: 'Tokyo / Setagaya-ku',
  externalIds: { bangumi: 328609, anilist: 130003, mal: null },
  anilistPopularity: 244113,
};
const ANOHANA: AnimeTourism88Entry = {
  id: 4,
  year: 2025,
  titleJa: 'あの日見た花の名前を僕達はまだ知らない。',
  titleEn: 'Anohana:The Flower We Saw That Day',
  region: 'kanto',
  prefecture: '埼玉県',
  city: '秩父市',
  regionEn: 'Saitama Pref. / Chichibu City',
  externalIds: { bangumi: 10440, anilist: 9989, mal: null },
  anilistPopularity: 379852,
};
const NULL_BANGUMI: AnimeTourism88Entry = {
  id: 5,
  year: 2025,
  titleJa: 'Mystery Show',
  titleEn: 'Mystery Show',
  region: 'kinki',
  prefecture: '京都府',
  city: '京都市',
  regionEn: 'Kyoto / Kyoto City',
  externalIds: { bangumi: null, anilist: null, mal: null },
  anilistPopularity: null,
};

const FIXTURE_FILE = {
  generatedAt: '2026-05-13',
  source: 'https://example.com/anime-tourism-88',
  year: 2025,
  count: 5,
  entries: [YURUCAMP_YAMANASHI, YURUCAMP_TOKYO, BOCCHI, ANOHANA, NULL_BANGUMI],
} satisfies AnimeTourism88DataFile;

const PROVENANCE = [
  {
    sourceName: { ja: 'fixture' },
    sourceUrl: FIXTURE_FILE.source,
    verifiedAt: '2026-05-13',
    copyrightNotice: { ja: 'fixture' },
  },
] as const;

const AREAS: readonly AreaDestination[] = FIXTURE_FILE.entries.map((entry) => ({
  id: `anime-tourism-88:2025:${entry.id}` as AreaDestinationId,
  areaKind: 'administrative_area',
  name: { ja: entry.city },
  prefecture: entry.prefecture,
  locality: entry.city,
  region: entry.region,
  animeIds: typeof entry.externalIds.bangumi === 'number' ? [entry.externalIds.bangumi] : [],
  programId: 'anime-tourism-88',
  edition: '2025',
  sourceEntryId: String(entry.id),
  placeRefs: [],
  provenance: PROVENANCE,
}));

const localityReader: Pick<
  LocalityRepository,
  'getAreaDestinations' | 'getAreaDestinationsForAnime' | 'getPlaceById'
> = {
  getAreaDestinations: (query = {}) =>
    AREAS.filter((area) => {
      if (query.animeId !== undefined && !area.animeIds.includes(query.animeId)) return false;
      if (query.programId !== undefined && area.programId !== query.programId) return false;
      if (query.edition !== undefined && area.edition !== query.edition) return false;
      return true;
    }),
  getAreaDestinationsForAnime: (animeId) => AREAS.filter((area) => area.animeIds.includes(animeId)),
  getPlaceById: () => null,
};

const CENTROIDS = new Map([
  ['山梨県\0山梨市', { lat: 35.6926, lng: 138.6845 }],
  ['東京都\0昭島市', { lat: 35.7058, lng: 139.3536 }],
  ['東京都\0世田谷区', { lat: 35.6469, lng: 139.6525 }],
  ['埼玉県\0秩父市', { lat: 36.0078, lng: 139.0843 }],
]);

const repo = new AnimeTourism88Repository(
  FIXTURE_FILE,
  localityReader,
  (prefecture, city) => CENTROIDS.get(`${prefecture}\0${city}`) ?? null
);

describe('anime88-repository', () => {
  it('A88-REPO-001 getAll88Entries returns the canonical list in order', () => {
    const all = repo.getAllEntries();
    expect(all.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    expect(repo.getEntryCount()).toBe(5);
    expect(repo.getEditionYear()).toBe(2025);
  });

  it('A88-REPO-002 get88EntriesByBangumiId returns every row for an anime', () => {
    const yurucamp = repo.getEntriesByBangumiId(207195);
    expect(yurucamp.map((e) => e.city)).toEqual(['山梨市', '昭島市']);
    const bocchi = repo.getEntriesByBangumiId(328609);
    expect(bocchi.map((e) => e.city)).toEqual(['世田谷区']);
    expect(repo.getEntriesByBangumiId(99999999)).toEqual([]);
  });

  it('A88-REPO-003 get88EntriesByRegion filters by the 7-group taxonomy', () => {
    expect(repo.getEntriesByRegion('tokyo').map((e) => e.id)).toEqual([2, 3]);
    expect(repo.getEntriesByRegion('chubu').map((e) => e.id)).toEqual([1]);
    expect(repo.getEntriesByRegion('kanto').map((e) => e.id)).toEqual([4]);
    expect(repo.getEntriesByRegion('hokkaido_tohoku')).toEqual([]);
  });

  it('A88-REPO-004 is88 reflects current selection membership', () => {
    expect(repo.includesAnime(207195)).toBe(true);
    expect(repo.includesAnime(328609)).toBe(true);
    expect(repo.includesAnime(999)).toBe(false);
  });

  it('A88-REPO-005 is88/getByBangumiId reject null and non-finite inputs', () => {
    expect(repo.includesAnime(null)).toBe(false);
    expect(repo.includesAnime(undefined)).toBe(false);
    expect(repo.includesAnime(Number.NaN)).toBe(false);
    expect(repo.getEntriesByBangumiId(null)).toEqual([]);
    expect(repo.getEntriesByBangumiId(Number.NaN)).toEqual([]);
  });

  it('A88-REPO-006 getUnique88Anime dedups, aggregates regions, skips null bangumi', () => {
    const unique = repo.getUniqueAnime();
    expect(unique.map((u) => u.bangumiId)).toEqual([207195, 328609, 10440]);
    const yuru = unique.find((u) => u.bangumiId === 207195);
    expect(yuru?.locations).toHaveLength(2);
    expect(yuru?.regions.sort()).toEqual(['chubu', 'tokyo']);
    expect(yuru?.anilistPopularity).toBe(160391);
    expect(unique.find((u) => u.titleJa === 'Mystery Show')).toBeUndefined();
  });

  it('A88-REPO-006b getUnique88AnimeByPopularity sorts by anilist popularity desc', () => {
    const sorted = repo.getUniqueAnimeByPopularity();
    expect(sorted.map((u) => u.bangumiId)).toEqual([10440, 328609, 207195]);
    expect(sorted.map((u) => u.anilistPopularity)).toEqual([379852, 244113, 160391]);
  });

  it('A88-REPO-007 get88EntriesWithCoords joins entries to city centroids', () => {
    const withCoords = repo.getEntriesWithCoords();
    // Mystery Show (id=5, 京都市) has no centroid in the fixture — should drop.
    expect(withCoords.map((e) => e.id)).toEqual([1, 2, 3, 4]);
    const tokyo = withCoords.find((e) => e.id === 2);
    expect(tokyo?.lat).toBeCloseTo(35.7058, 3);
    expect(tokyo?.lng).toBeCloseTo(139.3536, 3);
  });

  it('PILG-053 keeps city centroids out of the exact Place marker path', () => {
    expect(repo.getExactPlaces()).toEqual([]);
  });

  it('A88-REPO-008 ANIME_TOURISM_88_REGIONS lists all 7 groups', () => {
    expect(ANIME_TOURISM_88_REGIONS).toEqual([
      'hokkaido_tohoku',
      'kanto',
      'tokyo',
      'chubu',
      'kinki',
      'chugoku_shikoku',
      'kyushu_okinawa',
    ]);
  });
});

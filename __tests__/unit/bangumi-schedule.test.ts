import { describe, expect, it } from 'bun:test';
import type { Anime } from '../../components/rate/types';
import {
  dedupeById,
  groupAnimeByWeekday,
  applyPlatformAiring,
  matchesTypeFilter,
  splitSpecialAnime,
} from '../../libs/services/bangumi/schedule';
import { getBroadcastSeason } from '../../libs/utils/season-utils';

const anime = (id: string, airingAt?: number): Anime => ({
  id,
  title: id,
  image: '',
  ...(airingAt === undefined ? {} : { nextAiringEpisode: { airingAt, episode: 1 } }),
});

describe('season schedule regressions', () => {
  it('dedupe keeps the first occurrence and input order across repeated pages', () => {
    const first = anime('a');
    const second = anime('b');
    expect(dedupeById([first, second, { ...first, title: 'repeat' }, anime('c'), second])).toEqual([
      first,
      second,
      anime('c'),
    ]);
  });

  it('groups by local weekday and sends missing airing episodes to unknown', () => {
    const local = new Date(2026, 9, 5, 0, 15);
    const dated = anime('dated', local.getTime() / 1000);
    const undated = anime('undated');
    const groups = groupAnimeByWeekday([dated, undated]);
    expect(groups[local.getDay()]).toEqual([dated]);
    expect(groups.unknown).toEqual([undated]);
    expect(Object.values(groups).flat()).toHaveLength(2);
  });

  it('REPO-031 broadcast season boundaries keep the calendar year paired with the cour', () => {
    for (const [month, day, season] of [
      [0, 1, 'WINTER'],
      [2, 31, 'WINTER'],
      [3, 1, 'SPRING'],
      [8, 30, 'SUMMER'],
      [9, 1, 'FALL'],
      [11, 31, 'FALL'],
    ] as const) {
      expect(getBroadcastSeason(new Date(2026, month, day))).toEqual({ season, year: 2026 });
    }
  });

  it('weekly ONA series (JoJo SBR on Netflix) stay in the week grid; one-off ONAs are specials', () => {
    const weeklyOna: Anime = { ...anime('jojo', 1794556800), format: 'ONA', episodes: 11 };
    const oneShotOna: Anime = { ...anime('one-shot'), format: 'ONA', episodes: 1 };
    const { regular, special } = splitSpecialAnime([weeklyOna, oneShotOna]);
    expect(regular).toEqual([weeklyOna]);
    expect(special).toEqual([oneShotOna]);
    expect(matchesTypeFilter(weeklyOna, 'tv')).toBe(true);
    expect(matchesTypeFilter(oneShotOna, 'tv')).toBe(false);
    expect(matchesTypeFilter(oneShotOna, 'special')).toBe(true);
  });

  it('巴哈 still owes last week\'s JP episode: Chitose-kun ep 5 on Thu, not ep 6 a week later', () => {
    const at = (iso: string) => Date.parse(iso) / 1000;
    const chitose: Anime = { ...anime('198727', at('2026-11-17T14:00:00Z')), format: 'TV' };
    chitose.nextAiringEpisode = { airingAt: at('2026-11-17T14:00:00Z'), episode: 6 };
    const sites = () => [
      { platform: 'bahamut' as const, url: 'x', broadcast: 'R/2026-10-14T16:30:00.000Z/P7D' },
    ];
    // Wed 11/11 14:00 TW: 巴哈 ep 5 drops Thu 11/12 00:30 TW.
    const [before] = applyPlatformAiring([chitose], ['bahamut'], sites, at('2026-11-11T06:00:00Z'));
    expect(before.nextAiringEpisode).toMatchObject({
      episode: 5,
      airingAt: at('2026-11-11T16:30:00Z'),
      jpAiringAt: at('2026-11-10T14:00:00Z'),
    });
    // After that drop, the next 巴哈 episode is 6 on Thu 11/19.
    const [after] = applyPlatformAiring([chitose], ['bahamut'], sites, at('2026-11-12T00:00:00Z'));
    expect(after.nextAiringEpisode).toMatchObject({ episode: 6, airingAt: at('2026-11-18T16:30:00Z') });
  });
});

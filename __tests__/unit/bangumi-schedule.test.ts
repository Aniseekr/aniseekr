import { describe, expect, it } from 'bun:test';
import type { Anime } from '../../components/rate/types';
import {
  dedupeById,
  groupAnimeByWeekday,
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
});

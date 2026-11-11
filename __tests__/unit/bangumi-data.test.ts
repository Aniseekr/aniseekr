import { describe, expect, it } from 'bun:test';
import {
  compactBangumiData,
  platformAiringAt,
  parseWeeklyBroadcast,
} from '../../libs/services/streaming/bangumi-data';

const s = (iso: string) => Date.parse(iso) / 1000;

describe('bangumi-data platform slots', () => {
  it('巴哈 a day after JP: Chitose-kun JP Tue 22:00 TW → 巴哈 Thu 00:30 TW same week', () => {
    const bahamut = 'R/2026-10-14T16:30:00.000Z/P7D';
    expect(platformAiringAt(bahamut, s('2026-11-17T14:00:00Z'))).toBe(s('2026-11-18T16:30:00Z'));
  });

  it('global drop earlier than the AniList slot (JoJo SBR on Netflix) stays in the same week', () => {
    const netflix = 'R/2026-09-24T16:00:00.000Z/P7D';
    expect(platformAiringAt(netflix, s('2026-11-13T08:00:00Z'))).toBe(s('2026-11-12T16:00:00Z'));
  });

  it('platform run that starts more than a week later is unknown, not guessed', () => {
    expect(platformAiringAt('R/2026-12-01T16:00:00.000Z/P7D', s('2026-11-17T14:00:00Z'))).toBeNull();
  });

  it('rejects non-weekly or malformed intervals', () => {
    expect(parseWeeklyBroadcast('R/2026-10-14T16:30:00.000Z/P14D')).toBeNull();
    expect(parseWeeklyBroadcast('2026-10-14T16:30:00.000Z')).toBeNull();
    expect(parseWeeklyBroadcast('R/not-a-date/P7D')).toBeNull();
  });

  it('compacts to catalog platforms, TW variant first, skipping titles without an AniList id', () => {
    const index = compactBangumiData({
      siteMeta: {
        gamer: { urlTemplate: 'https://acg.gamer.com.tw/acgDetail.php?s={{id}}' },
        bilibili: { urlTemplate: 'https://www.bilibili.com/bangumi/media/md{{id}}/' },
        bilibili_tw: { urlTemplate: 'https://www.bilibili.com/bangumi/media/md{{id}}/' },
      },
      items: [
        {
          sites: [
            { site: 'aniList', id: '1' },
            { site: 'bilibili', id: 'cn' },
            { site: 'bilibili_tw', id: 'tw' },
            { site: 'gamer', id: '140852', begin: '2026-10-14T16:30:00.000Z' },
            { site: 'dmhy', id: 'resource' },
          ],
        },
        { sites: [{ site: 'gamer', id: '9' }] },
      ],
    });
    expect(index).toEqual({
      '1': [
        {
          platform: 'bahamut',
          url: 'https://acg.gamer.com.tw/acgDetail.php?s=140852',
          broadcast: 'R/2026-10-14T16:30:00.000Z/P7D',
        },
        { platform: 'bilibili', url: 'https://www.bilibili.com/bangumi/media/mdtw/' },
      ],
    });
  });
});

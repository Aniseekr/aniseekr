import { describe, expect, it } from 'bun:test';

import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import {
  getPilgrimageAnimeTitles,
  formatPilgrimageSubtitle,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';

describe('PilgrimageLocalization', () => {
  it('uses English first, Japanese second, and Chinese third', () => {
    const titles = getPilgrimageAnimeTitles(
      {
        id: 160209,
        title: '君の名は。',
        cn: '你的名字。',
        titleEnglish: 'Your Name.',
        titleRomaji: 'Kimi no Na wa.',
      },
      { lookupCrossIndex: () => null }
    );

    expect(titles.primary).toBe('Your Name.');
    expect(titles.secondary).toBe('君の名は。');
    expect(titles.tertiary).toBe('你的名字。');
    expect(formatPilgrimageSubtitle(titles)).toBe('君の名は。 · 你的名字。');
    expect(titles.original).toBe('君の名は。');
  });

  it('falls back to the original Japanese title before Chinese', () => {
    const titles = getPilgrimageAnimeTitles(
      {
        id: 485936,
        title: '響け！ユーフォニアム',
        cn: '吹响！悠风号',
        titleRomaji: 'Hibike! Euphonium',
      },
      { lookupCrossIndex: () => null }
    );

    expect(titles.primary).toBe('響け！ユーフォニアム');
    expect(titles.secondary).toBe('吹响！悠风号');
  });

  it('keeps spot titles source-correct when no English spot title exists', () => {
    const spot: AnitabiPoint = {
      id: 'spot-1',
      name: '鎌倉高校前駅',
      cn: '镰仓高校前站',
      image: 'https://image.anitabi.cn/points/1/spot-1.jpg',
      ep: 1,
      s: 0,
      geo: [35.3067, 139.5006],
    };

    expect(getPilgrimageSpotTitles(spot)).toMatchObject({
      primary: '鎌倉高校前駅',
      secondary: '镰仓高校前站',
    });
  });

  it('falls back to the Chinese spot title when Anitabi returns a non-string name', () => {
    const spot: AnitabiPoint = {
      id: '1n720r9',
      name: 556 as unknown as string,
      cn: '山梨县立图书馆',
      image: 'https://image.anitabi.cn/points/485936/1n720r9.jpg',
      ep: 11,
      s: 12,
      geo: [35.6683, 138.5702],
    };

    expect(getPilgrimageSpotTitles(spot)).toMatchObject({
      primary: '山梨县立图书馆',
      secondary: undefined,
    });
  });
});

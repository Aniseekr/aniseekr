import { describe, expect, it } from 'bun:test';
import { capsTracking, containsCjk, isCjkLabel, isCjkLanguage } from '../../libs/i18n/script';

describe('CJK detection', () => {
  it('maps every CJK UI language to zero caps tracking', () => {
    for (const lang of ['zh-Hant', 'zh-Hans', 'ja', 'ko'] as const) {
      expect(isCjkLanguage(lang)).toBe(true);
      expect(capsTracking(lang, 1.2)).toBe(0);
    }
    expect(isCjkLanguage('en')).toBe(false);
    expect(capsTracking('en', 1.2)).toBe(1.2);
  });

  it('decides plain-text labels by their content, not the UI language', () => {
    expect(isCjkLabel('PRO', 'zh-Hant')).toBe(false);
    expect(isCjkLabel('聖地巡禮', 'en')).toBe(true);
    expect(isCjkLabel(['12', ' ', '件'], 'en')).toBe(true);
    expect(isCjkLabel(42, 'ja')).toBe(false);
    expect(containsCjk('ゆるキャン△')).toBe(true);
    expect(containsCjk('한국어')).toBe(true);
  });

  it('falls back to the UI language when children are elements', () => {
    const element = { type: 'Text', props: {}, key: null };
    expect(isCjkLabel(element as never, 'zh-Hant')).toBe(true);
    expect(isCjkLabel(element as never, 'en')).toBe(false);
  });
});

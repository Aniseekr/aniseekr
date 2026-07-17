import { describe, expect, it } from 'bun:test';

import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';

describe('local-intel localization', () => {
  it('PILG-050 exact-language fields resolve as native', () => {
    expect(resolveLocalIntelText({ ja: 'あ', zhHant: '啊', en: 'A' }, 'zh-Hant')).toEqual({
      value: '啊',
      source: 'native',
    });
    expect(resolveLocalIntelText({ ja: 'あ', en: 'A' }, 'en')).toEqual({
      value: 'A',
      source: 'native',
    });
    expect(resolveLocalIntelText({ ja: 'あ', zhHans: '简' }, 'zh-Hans')).toEqual({
      value: '简',
      source: 'native',
    });
    expect(resolveLocalIntelText({ ja: 'あ' }, 'ja')).toEqual({ value: 'あ', source: 'native' });
  });

  it('PILG-050 zh-Hant converts an authored zh-Hans field via OpenCC as curated', () => {
    expect(resolveLocalIntelText({ ja: 'あ', zhHans: '简体汉字' }, 'zh-Hant')).toEqual({
      value: '簡體漢字',
      source: 'curated',
    });
  });

  it('PILG-050 falls back with an honest original tag', () => {
    // Chinese users fall back to Japanese (kanji-legible) before English.
    expect(resolveLocalIntelText({ ja: 'あ', en: 'A' }, 'zh-Hant')).toEqual({
      value: 'あ',
      source: 'original',
    });
    // Non-CJK users fall back to English before Japanese.
    expect(resolveLocalIntelText({ ja: 'あ', en: 'A' }, 'ko')).toEqual({
      value: 'A',
      source: 'original',
    });
    expect(resolveLocalIntelText({ ja: 'あ' }, 'en')).toEqual({ value: 'あ', source: 'original' });
  });
});

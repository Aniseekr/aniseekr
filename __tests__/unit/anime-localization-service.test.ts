import { describe, it, expect } from 'bun:test';
import { UnifiedAnimeItem } from '../../libs/models/unified-anime-item';
import {
  getDisplayTitle,
  resolveTitleByOrder,
  titleForLanguage,
} from '../../libs/utils/anime-localization-service';

function makeItem(overrides: Partial<ConstructorParameters<typeof UnifiedAnimeItem>[0]> = {}) {
  return new UnifiedAnimeItem({ title: 'CanonicalTitle', ...overrides });
}

describe('AnimeLocalizationService', () => {
  it('LOC-001 display title falls through chain and never returns empty', () => {
    const itemMinimal = makeItem();
    expect(getDisplayTitle(itemMinimal, 'fr-FR')).toBe('CanonicalTitle');
    // Empty lang string also resolves to canonical title.
    expect(getDisplayTitle(itemMinimal, '')).toBe('CanonicalTitle');
  });

  it('LOC-002 zh-Hans returns titleChinese when present', () => {
    const item = makeItem({ titleChinese: '冰菓', titleEnglish: 'Hyouka' });
    expect(getDisplayTitle(item, 'zh-Hans')).toBe('冰菓');
    expect(getDisplayTitle(item, 'zh-CN')).toBe('冰菓');
    // zh-Hant prefers traditional, then falls back to simplified.
    expect(getDisplayTitle(item, 'zh-Hant')).toBe('冰菓');
  });

  it('LOC-005 zh-Hant returns OpenCC-converted Traditional when only Simplified is available', () => {
    // Bangumi gives Simplified-only Chinese titles; the constructor auto-fills
    // titleChineseTraditional via toTraditional. zh-Hant should see the
    // converted form, not the original Simplified.
    const item = makeItem({ titleChinese: '工作细胞' });
    expect(getDisplayTitle(item, 'zh-Hant')).toBe('工作細胞');
    expect(getDisplayTitle(item, 'zh-TW')).toBe('工作細胞');
    // zh-Hans still gets the original Simplified.
    expect(getDisplayTitle(item, 'zh-Hans')).toBe('工作细胞');
  });

  it('LOC-006 zh-Hans returns OpenCC-converted Simplified when only Traditional is available', () => {
    const item = makeItem({ titleChineseTraditional: '進擊的巨人' });
    expect(getDisplayTitle(item, 'zh-Hans')).toBe('进击的巨人');
    expect(getDisplayTitle(item, 'zh-CN')).toBe('进击的巨人');
    // zh-Hant gets the original.
    expect(getDisplayTitle(item, 'zh-Hant')).toBe('進擊的巨人');
  });

  it('LOC-007 explicit titleChineseTraditional wins over auto-derived one', () => {
    const item = makeItem({
      titleChinese: '工作细胞',
      titleChineseTraditional: '工作細胞 (劇場版)',
    });
    // Constructor uses the explicit override, not the converter.
    expect(getDisplayTitle(item, 'zh-Hant')).toBe('工作細胞 (劇場版)');
  });

  it('LOC-003 falls back to canonical title when no localized title available', () => {
    const item = makeItem({ titleEnglish: null });
    // Japanese requested but only canonical is set.
    expect(getDisplayTitle(item, 'ja-JP')).toBe('CanonicalTitle');
    // Russian requested but only canonical is set.
    expect(getDisplayTitle(item, 'ru-RU')).toBe('CanonicalTitle');
  });

  it('LOC-004 search keywords include synonyms', () => {
    const item = makeItem({
      title: 'Cowboy Bebop',
      titleEnglish: 'COWBOY',
      synonyms: ['CB', 'Bebop'],
    });
    expect(item.searchKeywords).toContain('cb');
    expect(item.searchKeywords).toContain('bebop');
    expect(item.searchKeywords).toContain('cowboy');
  });
});

describe('resolveTitleByOrder', () => {
  const bundle = {
    title: 'Shingeki no Kyojin',
    titleEnglish: 'Attack on Titan',
    titleRomaji: 'Shingeki no Kyojin',
    titleJapanese: '進撃の巨人',
    titleChinese: '进击的巨人',
    titleRussian: 'Атака титанов',
  };

  it('LOC-010 walks the priority order', () => {
    expect(resolveTitleByOrder(bundle, ['english', 'chinese'], 'hant')).toBe('Attack on Titan');
    expect(resolveTitleByOrder(bundle, ['russian', 'english'], 'hant')).toBe('Атака титанов');
    expect(resolveTitleByOrder(bundle, ['japanese', 'english'], 'hant')).toBe('進撃の巨人');
  });

  it('LOC-011 chinese converts script on the fly', () => {
    // Only Simplified on the bundle → zh-Hant users get OpenCC Traditional.
    expect(resolveTitleByOrder(bundle, ['chinese'], 'hant')).toBe('進擊的巨人');
    expect(resolveTitleByOrder(bundle, ['chinese'], 'hans')).toBe('进击的巨人');
    // Only Traditional → zh-Hans users get OpenCC Simplified.
    const tradOnly = { title: 'x', titleChineseTraditional: '工作細胞' };
    expect(resolveTitleByOrder(tradOnly, ['chinese'], 'hans')).toBe('工作细胞');
    expect(resolveTitleByOrder(tradOnly, ['chinese'], 'hant')).toBe('工作細胞');
  });

  it('LOC-012 skips missing languages and falls back to canonical title', () => {
    const sparse = { title: 'Canonical', titleJapanese: 'ニッポン' };
    expect(resolveTitleByOrder(sparse, ['chinese', 'russian', 'japanese'], 'hant')).toBe('ニッポン');
    expect(resolveTitleByOrder(sparse, ['chinese', 'russian'], 'hant')).toBe('Canonical');
    expect(resolveTitleByOrder(sparse, [], 'hant')).toBe('Canonical');
  });

  it('LOC-013 empty strings are treated as missing', () => {
    const empty = { title: 'Canonical', titleEnglish: '', titleChinese: '' };
    expect(titleForLanguage(empty, 'english', 'hant')).toBeNull();
    expect(titleForLanguage(empty, 'chinese', 'hant')).toBeNull();
    expect(resolveTitleByOrder(empty, ['english', 'chinese'], 'hant')).toBe('Canonical');
  });
});

import { describe, expect, it } from 'bun:test';
import { translateGenre } from '../../libs/i18n/data-translator';

describe('translateGenre', () => {
  it('keeps the canonical English name in an English UI', () => {
    expect(translateGenre('Action', 'en')).toEqual({ value: 'Action', source: 'native' });
  });

  it('returns the curated dictionary entry for other UI languages', () => {
    expect(translateGenre('Action', 'zh-Hant')).toEqual({ value: '動作', source: 'curated' });
    expect(translateGenre('Adventure', 'ja')).toEqual({ value: '冒険', source: 'curated' });
  });

  it('matches genre names case-insensitively', () => {
    expect(translateGenre('action', 'zh-Hant').value).toBe('動作');
  });

  it('never guesses: unknown genres come back unchanged as original', () => {
    expect(translateGenre('Isekai Cooking', 'zh-Hant')).toEqual({
      value: 'Isekai Cooking',
      source: 'original',
    });
  });

  it('ignores the dictionary $comment metadata key', () => {
    expect(translateGenre('$comment', 'zh-Hant').source).toBe('original');
  });
});

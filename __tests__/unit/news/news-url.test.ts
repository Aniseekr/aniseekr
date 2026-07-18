import { describe, expect, it } from 'bun:test';

import { isSafeArticleUrl } from '../../../libs/services/news/news-url';

describe('isSafeArticleUrl', () => {
  it('rejects unsafe article urls', () => {
    expect(isSafeArticleUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeArticleUrl('/relative/article')).toBe(false);
    expect(isSafeArticleUrl('')).toBe(false);
    expect(isSafeArticleUrl('data:text/html,hello')).toBe(false);
  });

  it('accepts absolute http and https article urls', () => {
    expect(isSafeArticleUrl('http://example.com/news/1')).toBe(true);
    expect(isSafeArticleUrl('https://example.com/news/1')).toBe(true);
  });
});

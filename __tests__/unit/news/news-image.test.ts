import { describe, expect, it } from 'bun:test';

import { newsImageSource } from '../../../libs/services/news/news-image';

describe('newsImageSource', () => {
  it('returns null for non-absolute-http image urls', () => {
    expect(newsImageSource('/relative.jpg')).toBeNull();
    expect(newsImageSource('javascript:alert(1)')).toBeNull();
    expect(newsImageSource('data:image/png;base64,abc')).toBeNull();
    expect(newsImageSource('')).toBeNull();
  });

  it('returns an expo image source for absolute http and https urls', () => {
    expect(newsImageSource('http://example.com/image.jpg')).toEqual({
      uri: 'http://example.com/image.jpg',
    });
    expect(newsImageSource('https://example.com/image.jpg')).toEqual({
      uri: 'https://example.com/image.jpg',
    });
  });
});

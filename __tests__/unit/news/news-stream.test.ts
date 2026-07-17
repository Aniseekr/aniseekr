import { beforeEach, describe, expect, it } from 'bun:test';

import {
  __resetNewsStreamForTests,
  getStreamSync,
  refreshStream,
} from '../../../libs/services/news/news-stream';
import { __resetNewsSourcesForTests } from '../../../libs/services/news/news-sources';
import { saveFollowedSourceIds } from '../../../libs/services/news/news-follows';
import { appStorage } from '../../../libs/services/storage/app-storage';
import type { NewsArticle, NewsSourceFile } from '../../../libs/services/news/types';

const sources: NewsSourceFile = {
  generatedAt: 1,
  source: 'fixture',
  count: 2,
  entries: ['alpha', 'beta'].map((id) => ({
    id,
    name: { ja: id },
    feedUrl: `https://example.com/${id}.xml`,
    homepageUrl: `https://example.com/${id}`,
    category: 'news' as const,
    language: 'ja' as const,
    format: 'rss2' as const,
    recommended: true,
    frequency: 'medium' as const,
    verifiedAt: '2026-07-18',
  })),
};

const article = (sourceId: string, id: string, link: string, publishedAt: number): NewsArticle => ({
  id,
  sourceId,
  title: id,
  link,
  publishedAt,
});

describe('news stream', () => {
  beforeEach(() => {
    appStorage.clearAll();
    __resetNewsSourcesForTests(sources);
  });

  it('NEWS-007 merges sorts dedupes and isolates source failures', async () => {
    const cache = new Map<string, NewsArticle[]>();
    cache.set('alpha', [article('alpha', 'cached', 'https://example.com/cached', 2)]);
    __resetNewsStreamForTests({
      fetchXml: async (source) => {
        if (source.id === 'alpha') throw new Error('down');
        return `<rss><channel><item><guid>b</guid><title>B</title><link>https://example.com/b</link><pubDate>Wed, 15 Jul 2026 10:30:00 GMT</pubDate></item><item><guid>dup</guid><title>Dup</title><link>https://example.com/cached</link><pubDate>Wed, 16 Jul 2026 10:30:00 GMT</pubDate></item></channel></rss>`;
      },
      cache,
    });
    saveFollowedSourceIds(['alpha', 'beta']);

    const stream = await refreshStream();

    expect(stream.articles.map((item) => item.link)).toEqual([
      'https://example.com/b',
      'https://example.com/cached',
    ]);
  });

  it('NEWS-008 serves fresh and stale caches with independent ttls', () => {
    const cache = new Map<string, NewsArticle[]>();
    cache.set('alpha', [article('alpha', 'a', 'https://example.com/a', 10)]);
    cache.set('beta', [article('beta', 'b', 'https://example.com/b', 20)]);
    __resetNewsStreamForTests({ cache, staleIds: new Set(['alpha']) });
    saveFollowedSourceIds(['alpha', 'beta']);

    const stream = getStreamSync();

    expect(stream.articles.map((item) => item.id)).toEqual(['b', 'a']);
    expect(stream.staleSourceIds).toEqual(['alpha']);
  });
});

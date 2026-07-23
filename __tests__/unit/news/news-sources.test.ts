import { describe, expect, it } from 'bun:test';

import {
  __resetNewsSourcesForTests,
  getAllNewsSources,
  getNewsSource,
  getRecommendedSourceIds,
  hydrateNewsSourcesFromRuntime,
} from '../../../libs/services/news/news-sources';
import type { NewsSourceFile } from '../../../libs/services/news/types';

const valid = (id: string, recommended = false) => ({
  id,
  name: { ja: id },
  feedUrl: `https://example.com/${id}.xml`,
  homepageUrl: `https://example.com/${id}`,
  category: 'news' as const,
  language: 'ja' as const,
  format: 'rss2' as const,
  recommended,
  frequency: 'medium' as const,
  verifiedAt: '2026-07-18',
});

describe('news sources', () => {
  it('NEWS-005 loads dataset drops invalid dedupes and exposes recommended', () => {
    const file: NewsSourceFile = {
      generatedAt: 1,
      source: 'fixture',
      count: 6,
      entries: [
        valid('alpha', true),
        valid('alpha', false),
        valid('beta', true),
        { ...valid('missing-feed'), feedUrl: '' },
        { ...valid('missing-verified'), verifiedAt: '' },
      ],
    };
    __resetNewsSourcesForTests(file);

    expect(getAllNewsSources().map((source) => source.id)).toEqual(['alpha', 'beta']);
    expect(getNewsSource('alpha')?.recommended).toBe(true);
    expect(getRecommendedSourceIds()).toEqual(['alpha', 'beta']);

    hydrateNewsSourcesFromRuntime({ ...file, entries: [] });
    expect(getAllNewsSources().map((source) => source.id)).toEqual(['alpha', 'beta']);

    hydrateNewsSourcesFromRuntime({ ...file, entries: [valid('gamma'), valid('delta')] });
    expect(getAllNewsSources().map((source) => source.id)).toEqual(['gamma', 'delta']);
  });
});

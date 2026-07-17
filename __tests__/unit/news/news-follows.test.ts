import { beforeEach, describe, expect, it } from 'bun:test';

import { appStorage } from '../../../libs/services/storage/app-storage';
import {
  followSource,
  getNewsFollowsVersion,
  loadFollowedSourceIdsSync,
  saveFollowedSourceIds,
  unfollowSource,
} from '../../../libs/services/news/news-follows';
import { __resetNewsSourcesForTests } from '../../../libs/services/news/news-sources';
import type { NewsSourceFile } from '../../../libs/services/news/types';

const file: NewsSourceFile = {
  generatedAt: 1,
  source: 'fixture',
  count: 3,
  entries: [
    {
      id: 'alpha',
      name: { ja: 'alpha' },
      feedUrl: 'https://example.com/a.xml',
      homepageUrl: 'https://example.com/a',
      category: 'news',
      language: 'ja',
      format: 'rss2',
      recommended: true,
      frequency: 'medium',
      verifiedAt: '2026-07-18',
    },
    {
      id: 'beta',
      name: { ja: 'beta' },
      feedUrl: 'https://example.com/b.xml',
      homepageUrl: 'https://example.com/b',
      category: 'news',
      language: 'ja',
      format: 'rss2',
      recommended: false,
      frequency: 'medium',
      verifiedAt: '2026-07-18',
    },
  ],
};

describe('news follows', () => {
  beforeEach(() => {
    appStorage.clearAll();
    __resetNewsSourcesForTests(file);
  });

  it('NEWS-006 resolves recommended default and reduces follow set', () => {
    expect(loadFollowedSourceIdsSync()).toEqual(['alpha']);
    expect(followSource(['alpha'], 'beta')).toEqual(['alpha', 'beta']);
    expect(unfollowSource(['alpha', 'beta'], 'alpha')).toEqual(['beta']);

    saveFollowedSourceIds([]);
    expect(loadFollowedSourceIdsSync()).toEqual([]);

    saveFollowedSourceIds(['beta', 'stale']);
    expect(loadFollowedSourceIdsSync()).toEqual(['beta']);
  });

  it('NEWS-006 bumps the version on every write so consumers re-derive', () => {
    const before = getNewsFollowsVersion();
    saveFollowedSourceIds(['beta']);
    expect(getNewsFollowsVersion()).toBe(before + 1);
    saveFollowedSourceIds([]);
    expect(getNewsFollowsVersion()).toBe(before + 2);
  });
});

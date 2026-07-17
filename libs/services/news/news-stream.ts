import { RssClient } from '../../clients/rss-client';
import { Logger } from '../../utils/logger';
import { CacheService } from '../cache-service';
import { loadFollowedSourceIdsSync } from './news-follows';
import { getNewsSource } from './news-sources';
import { parseFeed } from './feed-parser';
import type { NewsArticle, NewsSource } from './types';

const FRESH_TTL_MS = 30 * 60 * 1000;
const STALE_GRACE_MS = 24 * 60 * 60 * 1000;

export interface NewsStreamSnapshot {
  articles: NewsArticle[];
  staleSourceIds: string[];
  updatedAt: number;
}

interface CacheMeta<T> {
  value: T;
  isStale: boolean;
}

interface StreamCacheAdapter {
  getSyncWithMeta: <T>(key: string, graceMs: number) => CacheMeta<T> | null;
  getWithMeta: <T>(key: string, graceMs: number) => Promise<CacheMeta<T> | null>;
  set: (key: string, value: unknown, ttlMs: number) => unknown;
}

type FetchXml = (source: NewsSource) => Promise<string>;

const defaultCache: StreamCacheAdapter = {
  getSyncWithMeta: (key, graceMs) => CacheService.getSyncWithMeta(key, graceMs),
  getWithMeta: (key, graceMs) => CacheService.getWithMeta(key, graceMs),
  set: (key, value, ttlMs) => CacheService.set(key, value, ttlMs),
};

let cache: StreamCacheAdapter = defaultCache;
let fetchXml: FetchXml = (source) => RssClient.fetch(source.feedUrl);
let now = () => Date.now();

export function getStreamSync(): NewsStreamSnapshot {
  const rows = readCachedSources((key) => cache.getSyncWithMeta<NewsArticle[]>(key, STALE_GRACE_MS));
  return buildSnapshot(rows);
}

export async function refreshStream(): Promise<NewsStreamSnapshot> {
  const followed = followedSources();
  const rows = await Promise.all(
    followed.map(async (source) => {
      try {
        const xml = await fetchXml(source);
        const articles = parseFeed(xml, source.id);
        await Promise.resolve(cache.set(cacheKey(source.id), articles, FRESH_TTL_MS));
        return { sourceId: source.id, articles, isStale: false };
      } catch (err) {
        Logger.warn(`[NewsStream] source failed: ${source.id}`, err);
        const fallback = await cache.getWithMeta<NewsArticle[]>(cacheKey(source.id), STALE_GRACE_MS);
        return {
          sourceId: source.id,
          articles: fallback?.value ?? [],
          isStale: fallback?.isStale ?? false,
        };
      }
    })
  );
  return buildSnapshot(rows);
}

function readCachedSources(read: (key: string) => CacheMeta<NewsArticle[]> | null): {
  sourceId: string;
  articles: NewsArticle[];
  isStale: boolean;
}[] {
  return followedSources().flatMap((source) => {
    const hit = read(cacheKey(source.id));
    return hit ? [{ sourceId: source.id, articles: hit.value, isStale: hit.isStale }] : [];
  });
}

function followedSources(): NewsSource[] {
  return loadFollowedSourceIdsSync().flatMap((id) => {
    const source = getNewsSource(id);
    return source ? [source] : [];
  });
}

function buildSnapshot(
  rows: { sourceId: string; articles: NewsArticle[]; isStale: boolean }[]
): NewsStreamSnapshot {
  const byLink = new Map<string, NewsArticle>();
  for (const row of rows) {
    for (const article of row.articles) {
      if (!byLink.has(article.link)) byLink.set(article.link, article);
    }
  }
  return {
    articles: [...byLink.values()].sort(
      (a, b) => b.publishedAt - a.publishedAt || a.id.localeCompare(b.id)
    ),
    staleSourceIds: rows.filter((row) => row.isStale).map((row) => row.sourceId),
    updatedAt: now(),
  };
}

export function newsFeedCacheKey(sourceId: string): string {
  return cacheKey(sourceId);
}

function cacheKey(sourceId: string): string {
  return `news:feed:${sourceId}`;
}

export function __resetNewsStreamForTests(opts?: {
  cache?: Map<string, NewsArticle[]>;
  staleIds?: Set<string>;
  fetchXml?: FetchXml;
  now?: () => number;
}): void {
  now = opts?.now ?? (() => Date.now());
  fetchXml = opts?.fetchXml ?? ((source) => RssClient.fetch(source.feedUrl));
  if (!opts?.cache) {
    cache = defaultCache;
    return;
  }
  cache = {
    getSyncWithMeta: <T,>(key: string) => mapMeta<T>(opts.cache!, opts.staleIds, key),
    getWithMeta: async <T,>(key: string) => mapMeta<T>(opts.cache!, opts.staleIds, key),
    set: (key: string, value: unknown) => {
      opts.cache!.set(sourceIdFromKey(key), value as NewsArticle[]);
    },
  };
}

function mapMeta<T>(
  store: Map<string, NewsArticle[]>,
  staleIds: Set<string> | undefined,
  key: string
): CacheMeta<T> | null {
  const sourceId = sourceIdFromKey(key);
  const value = store.get(sourceId);
  return value ? { value: value as T, isStale: staleIds?.has(sourceId) ?? false } : null;
}

function sourceIdFromKey(key: string): string {
  return key.replace(/^news:feed:/, '');
}

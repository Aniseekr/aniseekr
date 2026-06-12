// Localized-title enrichment.
//
// AniList (the source behind the legacy browse/search/detail facade) has no
// Chinese or Russian titles. This service fills the gap through the same
// aggregation that powers cross-platform sync: translate the item's ID via
// `idMappingService` (Fribb × manami merged list), then fetch the localized
// title from the platform that actually has it —
//
//   chinese → bangumi_id → Bangumi `/v0/subjects/{id}` `name_cn`
//   russian → shikimori_id → Shikimori `/animes/{id}` `russian`
//
// Results persist in CacheService (sync in-memory mirror + SQLite), so a
// title is fetched once per anime per language and then renders on frame 1.
// "No localized title exists" is itself cached (negative cache) so we don't
// re-probe the network for the same miss on every render.
//
// State machine per (lang, platform, id):
//   undefined → unknown, caller may `ensure()`        (render fallback)
//   null      → known-absent                          (render fallback)
//   string    → localized title                       (render it)

import { BangumiClient } from '../clients/bangumi-client';
import { ShikimoriClient } from '../clients/shikimori-client';
import { Logger } from '../utils/logger';
import { CacheService } from './cache-service';
import { idMappingService } from './sync/id-mapping-service';
import type { PlatformType } from './auth/types';

export type LocalizedTitleLanguage = 'chinese' | 'russian';

const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Don't re-attempt a failed fetch (network error) for this long. */
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const MAX_CONCURRENT = 3;

/** Wrapped so a cached `null` ("no localized title") differs from a cache miss. */
interface CachedTitle {
  v: string | null;
}

const SOURCE_PLATFORM: Record<LocalizedTitleLanguage, PlatformType> = {
  chinese: 'bangumi',
  russian: 'shikimori',
};

/**
 * v2: v1 keys were poisoned by negative results written while the dataset
 * had no bangumi_id at all (see 2026-06-12 spec). Bumping the prefix orphans
 * them; CacheManager prune removes them after TTL.
 */
const CACHE_PREFIX = 'title_loc_v2_';

function cacheKey(lang: LocalizedTitleLanguage, platform: PlatformType, id: string): string {
  return `${CACHE_PREFIX}${lang}_${platform}_${id}`;
}

async function fetchChineseTitle(bangumiId: string): Promise<string | null> {
  const subject = await BangumiClient.getSubject(bangumiId);
  const name = subject.name_cn?.trim();
  return name && name.length > 0 ? name : null;
}

async function fetchRussianTitle(shikimoriId: string): Promise<string | null> {
  const detail = await ShikimoriClient.get<{ russian?: string | null }>(
    `/animes/${encodeURIComponent(shikimoriId)}`
  );
  const name = detail.russian?.trim();
  return name && name.length > 0 ? name : null;
}

export interface TitleLocalizationDeps {
  cache?: Pick<typeof CacheService, 'getSync' | 'get' | 'set' | 'clearByPrefixWhereValue'>;
  idMapping?: Pick<
    typeof idMappingService,
    'mapID' | 'getChineseTitleSource' | 'getLastUpdateTime'
  >;
  fetchers?: Partial<Record<LocalizedTitleLanguage, (mappedId: string) => Promise<string | null>>>;
}

export class TitleLocalizationService {
  private readonly cache: NonNullable<TitleLocalizationDeps['cache']>;
  private readonly idMapping: NonNullable<TitleLocalizationDeps['idMapping']>;
  private readonly fetchers: Record<
    LocalizedTitleLanguage,
    (mappedId: string) => Promise<string | null>
  >;

  private readonly inflight = new Set<string>();
  private readonly failedAt = new Map<string, number>();
  private readonly queue: (() => Promise<void>)[] = [];
  private running = 0;

  /** Once true, stays true — an import is never undone. */
  private mappingReadyMemo = false;

  /**
   * Bumped by onMappingDataRefreshed. A resolution that started under an
   * older generation may NOT write a negative result: it was judged against
   * the dataset that the refresh just replaced.
   */
  private refreshGeneration = 0;

  private readonly listeners = new Set<() => void>();

  constructor(deps: TitleLocalizationDeps = {}) {
    this.cache = deps.cache ?? CacheService;
    this.idMapping = deps.idMapping ?? idMappingService;
    this.fetchers = {
      chinese: deps.fetchers?.chinese ?? fetchChineseTitle,
      russian: deps.fetchers?.russian ?? fetchRussianTitle,
    };
  }

  /**
   * Synchronous read for the render path.
   * `undefined` = not resolved yet (call `ensure()`), `null` = known-absent.
   */
  getSync(
    lang: LocalizedTitleLanguage,
    platform: PlatformType,
    id: string
  ): string | null | undefined {
    const cached = this.cache.getSync<CachedTitle>(cacheKey(lang, platform, id));
    return cached ? cached.v : undefined;
  }

  /**
   * Fire-and-forget resolution. Dedupes in-flight work, caps concurrency, and
   * backs off after a network failure. Notifies subscribers when a value
   * (including a negative result) lands in the cache.
   */
  ensure(lang: LocalizedTitleLanguage, platform: PlatformType, id: string): void {
    if (!id) return;
    const key = cacheKey(lang, platform, id);
    if (this.inflight.has(key)) return;
    if (this.cache.getSync<CachedTitle>(key) !== null) return;

    const failed = this.failedAt.get(key);
    if (failed !== undefined && Date.now() - failed < FAILURE_BACKOFF_MS) return;

    this.inflight.add(key);
    this.enqueue(async () => {
      let staleNegativeDropped = false;
      try {
        // The persistent layer may have it even when the memory mirror is
        // cold (fresh launch) — `get` pulls it into the mirror for getSync.
        const persisted = await this.cache.get<CachedTitle>(key);
        if (persisted) {
          this.emit();
          return;
        }

        const generation = this.refreshGeneration;
        const resolved = await this.resolve(lang, platform, id);
        if (resolved.kind === 'transient') {
          // Mapping dataset not imported yet — this is "we can't know",
          // never "known absent". Backoff, don't poison the cache.
          this.failedAt.set(key, Date.now());
          return;
        }

        if (resolved.title === null && generation !== this.refreshGeneration) {
          // The dataset was replaced while we were resolving — this negative
          // was judged against stale data. Drop it and re-kick (below, once
          // the inflight slot is free so the retry isn't deduped away).
          staleNegativeDropped = true;
          return;
        }

        await this.cache.set(
          key,
          { v: resolved.title } satisfies CachedTitle,
          resolved.title ? HIT_TTL_MS : MISS_TTL_MS
        );
        this.emit();
      } catch (err) {
        this.failedAt.set(key, Date.now());
        Logger.warn(`[TitleLocalization] ${lang} title fetch failed for ${platform}:${id}`, err);
      } finally {
        this.inflight.delete(key);
      }
      if (staleNegativeDropped) this.emit();
    });
  }

  private async isMappingReady(): Promise<boolean> {
    if (this.mappingReadyMemo) return true;
    const t = await this.idMapping.getLastUpdateTime();
    if (t !== null) this.mappingReadyMemo = true;
    return this.mappingReadyMemo;
  }

  /**
   * Resolution outcome: 'done' carries the title (or a confirmed absence);
   * 'transient' means we couldn't tell ("dataset not imported yet") and must
   * NOT write a negative cache — backoff and retry later instead.
   */
  private async resolve(
    lang: LocalizedTitleLanguage,
    platform: PlatformType,
    id: string
  ): Promise<{ kind: 'done'; title: string | null } | { kind: 'transient' }> {
    if (lang === 'chinese') {
      // Single SELECT: locally-shipped name_cn (offline, preferred) plus the
      // bangumi_id needed for the network fallback.
      const src = await this.idMapping.getChineseTitleSource(platform, id);
      if (src?.nameCn) return { kind: 'done', title: src.nameCn };
      if (src?.bangumiId) {
        return { kind: 'done', title: await this.fetchers.chinese(src.bangumiId) };
      }
      if (!(await this.isMappingReady())) return { kind: 'transient' };
      return { kind: 'done', title: null };
    }

    const mappedId = await this.idMapping.mapID(platform, id, SOURCE_PLATFORM[lang]);
    if (mappedId == null) {
      if (!(await this.isMappingReady())) return { kind: 'transient' };
      return { kind: 'done', title: null };
    }
    return { kind: 'done', title: await this.fetchers[lang](String(mappedId)) };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Called after a successful mapping-data import (app/_layout.tsx). Negative
   * entries were judged against the OLD dataset — drop them so the new data
   * gets a chance; positive hits stay. Clears fetch backoffs and notifies
   * subscribers so visible screens re-kick enrichment immediately.
   */
  async onMappingDataRefreshed(): Promise<void> {
    this.mappingReadyMemo = true;
    this.refreshGeneration += 1;
    this.failedAt.clear();
    await this.cache.clearByPrefixWhereValue(
      CACHE_PREFIX,
      JSON.stringify({ v: null } satisfies CachedTitle)
    );
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    this.pump();
  }

  private pump(): void {
    while (this.running < MAX_CONCURRENT && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running += 1;
      void task().finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }
}

export const titleLocalizationService = new TitleLocalizationService();

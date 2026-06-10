// Bridges the user's collection (user_anime + favorites) with the Anitabi
// pilgrimage data set. For every collected anime we resolve a Bangumi subject
// id and ask Anitabi for spots. Anime that can't be resolved or have no
// Anitabi entry are silently dropped.
//
// Resolution is three-layered: L2 in-memory cross-index → L1 SQLite
// id_mappings → L0 online Bangumi title search. The first two are offline
// snapshots that lag behind newly-aired anime; L0 exists so a freshly-added
// show (e.g. a currently-airing season) still reaches the map — it searches
// Bangumi with the titles we know, accepts only an exact normalized title
// match, and caches the verdict (hit or miss) so the search runs once, not on
// every map refresh.
//
// Used by the Pilgrimage tab's "Mine" filter so the map and list reflect what
// the user has actually collected, not just the curated `featured-anime` list.

import { LocalDB } from '../../db';
import type { PlatformType } from '../auth/types';
import { BangumiClient, type BangumiV0SearchResponse } from '../../clients/bangumi-client';
import { CacheService } from '../cache-service';
import { dataSourceConfig } from '../data-source-config';
import { idMappingService, IDMappingService } from '../sync/id-mapping-service';
import { lookupBangumiByPlatformId } from './anitabi-cross-index';
import { anitabiService, AnitabiService } from './anitabi-service';
import { pickBangumiSubjectByTitle } from './bangumi-title-match';
import type { AnitabiBangumi } from './types';

export type CollectionStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';

export interface CollectionPilgrimageEntry {
  /** Resolved Anitabi payload. */
  anime: AnitabiBangumi;
  /** Original anime id from user_anime / favorites (browse-source platform id). */
  collectionAnimeId: string;
  /** Resolved bangumi subject id. */
  bangumiId: number;
  /** Status from `user_anime`, if present. */
  status?: CollectionStatus;
  /** True when present in the favorites table. */
  isFavorite: boolean;
}

export interface CollectionPilgrimageStats {
  /** Number of collected anime that have Anitabi spots. */
  matched: number;
  /** Total distinct anime ids checked across user_anime + favorites. */
  total: number;
}

/** Minimal detail payload the online resolver needs — the browse source's
 *  native Japanese title matches Bangumi's `name` far more reliably than the
 *  romaji/English display title stored in the collection row. */
export interface ResolverDetailTitles {
  title?: string | null;
  titleJapanese?: string | null;
  titleEnglish?: string | null;
}

export type UnifiedDetailFetcher = (
  animeId: string,
  platform: PlatformType
) => Promise<ResolverDetailTitles | null>;

interface BangumiSearchClient {
  searchSubjects(keyword: string, page?: number): Promise<BangumiV0SearchResponse>;
}

interface ResolverCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlMs?: number): Promise<unknown>;
}

interface ServiceDeps {
  db?: typeof LocalDB;
  mappingService?: IDMappingService;
  anitabi?: AnitabiService;
  /** Override the assumed platform of stored anime ids. Defaults to browseSource. */
  sourcePlatform?: PlatformType;
  /** Bangumi keyword search used by the L0 online resolver. */
  bangumiSearch?: BangumiSearchClient;
  /** Persistent cache for resolved (and not-found) title lookups. */
  cache?: ResolverCache;
  /** Detail fetch used to learn the native Japanese title. Defaults to a lazy
   *  AnimeRepository call; injected in tests. */
  fetchUnifiedDetail?: UnifiedDetailFetcher;
}

interface RawRow {
  anime_id: string;
  title?: string | null;
  status?: string | null;
  is_favorite: number;
}

const STATUS_VALUES: ReadonlySet<CollectionStatus> = new Set([
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
]);

/** Cache key prefix for L0 title-resolution verdicts (per platform+anime id). */
const RESOLVE_CACHE_KEY_PREFIX = 'pilgrimage_bgm_resolve_';
/** A confirmed mapping is stable — keep it for 30 days. */
const RESOLVE_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A miss may flip once Bangumi indexes a new show — retry after 3 days. */
const RESOLVE_MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

interface ResolveCacheValue {
  bangumiId: number | null;
}

// Lazy require so importing this service doesn't drag the full repository +
// 7-source graph into unit tests; the repository module is already loaded in
// the running app by the time the resolver first fires.
const defaultUnifiedDetailFetcher: UnifiedDetailFetcher = async (animeId, platform) => {
  const { AnimeRepository } = require('../../repositories/anime-repository') as {
    AnimeRepository: {
      defaultInstance(): {
        fetchAnimeDetail(id: string, preferred?: PlatformType): Promise<ResolverDetailTitles>;
      };
    };
  };
  return AnimeRepository.defaultInstance().fetchAnimeDetail(animeId, platform);
};

export class CollectionPilgrimageService {
  private readonly db: typeof LocalDB;
  private readonly mappingService: IDMappingService;
  private readonly anitabi: AnitabiService;
  private readonly sourceOverride: PlatformType | undefined;
  private readonly bangumiSearch: BangumiSearchClient;
  private readonly cache: ResolverCache;
  private readonly fetchUnifiedDetail: UnifiedDetailFetcher;

  constructor(deps: ServiceDeps = {}) {
    this.db = deps.db ?? LocalDB;
    this.mappingService = deps.mappingService ?? idMappingService;
    this.anitabi = deps.anitabi ?? anitabiService;
    this.sourceOverride = deps.sourcePlatform;
    this.bangumiSearch = deps.bangumiSearch ?? BangumiClient;
    this.cache = deps.cache ?? CacheService;
    this.fetchUnifiedDetail = deps.fetchUnifiedDetail ?? defaultUnifiedDetailFetcher;
  }

  /**
   * Returns every collected anime that has Anitabi pilgrimage data.
   * Deduped by bangumi id; favorites that are also tracked in user_anime
   * collapse into a single entry with both flags set.
   */
  async getEntries(): Promise<CollectionPilgrimageEntry[]> {
    const rows = await this.loadCollectionRows();
    if (rows.length === 0) return [];

    const platform = this.resolveSourcePlatform();
    const resolved = await this.resolveBangumiIds(rows, platform);
    return this.fetchAndZip(resolved);
  }

  /** Lightweight count for the "X / Y" header chip. */
  async getStats(): Promise<CollectionPilgrimageStats> {
    const rows = await this.loadCollectionRows();
    if (rows.length === 0) return { matched: 0, total: 0 };

    const platform = this.resolveSourcePlatform();
    const resolved = await this.resolveBangumiIds(rows, platform);
    const entries = await this.fetchAndZip(resolved);
    return { matched: entries.length, total: rows.length };
  }

  private resolveSourcePlatform(): PlatformType {
    return this.sourceOverride ?? dataSourceConfig.browseSource;
  }

  private async loadCollectionRows(): Promise<RawRow[]> {
    const db = await this.db.getDatabase();
    const rows = await db.getAllAsync<RawRow>(
      `SELECT anime_id, title, status, 0 AS is_favorite FROM user_anime
       UNION
       SELECT id AS anime_id, title, NULL AS status, 1 AS is_favorite FROM favorites`
    );

    // Merge duplicates: prefer the row that has a status, OR-merge favorite flag.
    const merged = new Map<string, RawRow>();
    for (const row of rows) {
      const existing = merged.get(row.anime_id);
      if (!existing) {
        merged.set(row.anime_id, row);
        continue;
      }
      merged.set(row.anime_id, {
        anime_id: row.anime_id,
        title: existing.title ?? row.title ?? null,
        status: existing.status ?? row.status ?? null,
        is_favorite: existing.is_favorite || row.is_favorite ? 1 : 0,
      });
    }
    return [...merged.values()];
  }

  private async resolveBangumiIds(
    rows: RawRow[],
    platform: PlatformType
  ): Promise<{ row: RawRow; bangumiId: number }[]> {
    const out: { row: RawRow; bangumiId: number }[] = [];
    await Promise.all(
      rows.map(async (row) => {
        const bangumiId = await this.translateToBangumiId(row, platform);
        if (bangumiId !== null) out.push({ row, bangumiId });
      })
    );
    return out;
  }

  private async translateToBangumiId(row: RawRow, platform: PlatformType): Promise<number | null> {
    const animeId = row.anime_id;
    if (platform === 'bangumi') {
      const parsed = Number(animeId);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    // L2 first: pure in-memory lookup. Hits short-circuit the SQLite
    // round-trip for the (very common) anilist/myanimelist browse case.
    const l2 = lookupBangumiByPlatformId(platform, animeId);
    if (l2 !== null) return l2;

    // L1 fallback: the legacy IDMappingService backed by SQLite + manual
    // overrides. Slower but covers platforms outside the L2 index.
    try {
      const mapped = await this.mappingService.mapID(platform, animeId, 'bangumi');
      if (mapped !== null && mapped !== undefined) {
        const numeric = typeof mapped === 'number' ? mapped : Number(mapped);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
      }
    } catch {
      // fall through to L0
    }

    // L0: both offline snapshots miss (typical for a currently-airing show the
    // daily indexes haven't picked up yet) — resolve online by title.
    return this.resolveBangumiIdOnline(row, platform);
  }

  /**
   * Online resolution: search Bangumi with the titles we know for this anime
   * and accept only an exact normalized title match. The verdict — found id or
   * confirmed miss — is cached so each collection entry costs at most one
   * search burst, not one per map refresh. Network errors return null WITHOUT
   * caching, so the next refresh retries.
   */
  private async resolveBangumiIdOnline(
    row: RawRow,
    platform: PlatformType
  ): Promise<number | null> {
    const storedTitle = (row.title ?? '').trim();
    if (!storedTitle) return null;

    const cacheKey = `${RESOLVE_CACHE_KEY_PREFIX}${platform}_${row.anime_id}`;
    try {
      const cached = await this.cache.get<ResolveCacheValue>(cacheKey);
      if (cached) return cached.bangumiId;
    } catch {
      // cache read failures are non-fatal — resolve as if cold
    }

    // Titles we'd accept as "this anime". The browse source's detail payload
    // adds the native Japanese title, which is what Bangumi's `name` holds —
    // the stored display title is often romaji/English and won't string-match.
    const titles = [storedTitle];
    let nativeTitle: string | null = null;
    try {
      const detail = await this.fetchUnifiedDetail(row.anime_id, platform);
      nativeTitle = detail?.titleJapanese?.trim() || null;
      for (const candidate of [nativeTitle, detail?.title, detail?.titleEnglish]) {
        const trimmed = (candidate ?? '').trim();
        if (trimmed && !titles.includes(trimmed)) titles.push(trimmed);
      }
    } catch {
      // detail fetch is best-effort; the stored title alone may still match
    }

    // Search seeds: the native title is the most likely to hit Bangumi's
    // index, so it goes first when we have it.
    const seeds = nativeTitle && nativeTitle !== storedTitle
      ? [nativeTitle, storedTitle]
      : [storedTitle];

    for (const seed of seeds) {
      let response: BangumiV0SearchResponse;
      try {
        response = await this.bangumiSearch.searchSubjects(seed, 1);
      } catch {
        return null; // transient failure — no negative cache, retry next refresh
      }
      const match = pickBangumiSubjectByTitle(response.data ?? [], titles);
      if (match) {
        try {
          await this.cache.set(
            cacheKey,
            { bangumiId: match.id } satisfies ResolveCacheValue,
            RESOLVE_HIT_TTL_MS
          );
        } catch {
          // cache write failures are non-fatal
        }
        return match.id;
      }
    }

    // Every seed searched cleanly and nothing matched — remember the miss so
    // we don't re-search Bangumi on every collection refresh.
    try {
      await this.cache.set(
        cacheKey,
        { bangumiId: null } satisfies ResolveCacheValue,
        RESOLVE_MISS_TTL_MS
      );
    } catch {
      // cache write failures are non-fatal
    }
    return null;
  }

  private async fetchAndZip(
    resolved: { row: RawRow; bangumiId: number }[]
  ): Promise<CollectionPilgrimageEntry[]> {
    if (resolved.length === 0) return [];

    const fetched = await Promise.all(
      resolved.map(async ({ row, bangumiId }) => {
        try {
          const anime = await this.anitabi.getAnimePilgrimage(bangumiId);
          if (!anime) return null;
          return { row, bangumiId, anime };
        } catch {
          return null;
        }
      })
    );

    const seen = new Set<number>();
    const entries: CollectionPilgrimageEntry[] = [];
    for (const item of fetched) {
      if (!item || seen.has(item.bangumiId)) continue;
      seen.add(item.bangumiId);
      const status = normalizeStatus(item.row.status);
      entries.push({
        anime: item.anime,
        collectionAnimeId: item.row.anime_id,
        bangumiId: item.bangumiId,
        status,
        isFavorite: !!item.row.is_favorite,
      });
    }
    return entries;
  }
}

function normalizeStatus(raw: string | null | undefined): CollectionStatus | undefined {
  if (!raw) return undefined;
  return STATUS_VALUES.has(raw as CollectionStatus) ? (raw as CollectionStatus) : undefined;
}

export const collectionPilgrimageService = new CollectionPilgrimageService();

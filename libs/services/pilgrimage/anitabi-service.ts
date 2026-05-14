// Singleton service that fronts the Anitabi HTTP client with both an
// in-memory and a SQLite-backed cache. Spec: spec/pilgrimage_spec.md §4–§6.

import { LocalDB, type PilgrimageRow, type PilgrimageSaveInput } from '../../db';
import { AnitabiClient, DataSourceError } from '../../clients/anitabi-client';
import { CacheService } from '../cache-service';
import type { AnitabiBangumi, AnitabiPoint, AnitabiPointDetail } from './types';

/** Default lite-cache TTL (7 days) in milliseconds. */
export const PILGRIMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Cache key prefix used by getDetailedPoints (SQLite-backed). */
const DETAIL_CACHE_KEY_PREFIX = 'anitabi_detail_';

/** Sentinel rows for in-memory cache so we can also remember "no data" results. */
type CacheValue = { kind: 'hit'; value: AnitabiBangumi } | { kind: 'miss' };
type DetailCacheValue =
  | { kind: 'hit'; value: AnitabiPointDetail[] }
  | { kind: 'miss' };

interface ServiceOptions {
  /** Override now() (used by tests for TTL boundaries). */
  now?: () => number;
  /** Override the HTTP layer (used by tests). */
  client?: typeof AnitabiClient;
  /** Override LocalDB (used by tests that don't touch SQLite). */
  db?: typeof LocalDB;
  /** Override the generic key/value cache (used by tests). */
  cache?: typeof CacheService;
  /** Override the lite cache TTL. Defaults to 7 days. */
  ttlMs?: number;
}

export class AnitabiService {
  private static _instance: AnitabiService | null = null;

  private memCache = new Map<number, CacheValue>();
  private detailMemCache = new Map<number, DetailCacheValue>();
  /** In-flight detail requests deduped by bangumiId. */
  private pendingDetail = new Map<number, Promise<AnitabiPointDetail[]>>();
  private now: () => number;
  private client: typeof AnitabiClient;
  private db: typeof LocalDB;
  private cache: typeof CacheService;
  private ttlMs: number;

  constructor(opts: ServiceOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.client = opts.client ?? AnitabiClient;
    this.db = opts.db ?? LocalDB;
    this.cache = opts.cache ?? CacheService;
    this.ttlMs = opts.ttlMs ?? PILGRIMAGE_TTL_MS;
  }

  /** Process-wide singleton accessor. */
  static getInstance(): AnitabiService {
    if (!AnitabiService._instance) {
      AnitabiService._instance = new AnitabiService();
    }
    return AnitabiService._instance;
  }

  /**
   * Reset the singleton + clear all caches. Test-only seam.
   * Does NOT touch SQLite — call invalidateAll() for that.
   */
  static resetForTests(opts: ServiceOptions = {}): AnitabiService {
    AnitabiService._instance = new AnitabiService(opts);
    return AnitabiService._instance;
  }

  /**
   * Fetch the lite payload for an anime by Bangumi subject ID.
   * Returns null when the anime simply has no pilgrimage data (HTTP 404).
   *
   * Lookup order: in-memory → SQLite → network.
   */
  async getAnimePilgrimage(bangumiId: number): Promise<AnitabiBangumi | null> {
    // 1. In-memory cache
    const memHit = this.memCache.get(bangumiId);
    if (memHit) {
      return memHit.kind === 'hit' ? memHit.value : null;
    }

    // 2. SQLite cache
    try {
      const row = await this.db.getPilgrimage(bangumiId);
      if (row && row.expires_at > this.now()) {
        const decoded = this.rowToBangumi(row);
        this.memCache.set(bangumiId, { kind: 'hit', value: decoded });
        return decoded;
      }
    } catch (err) {
      // SQLite read failures are non-fatal — fall through to network.

      console.warn('[AnitabiService] SQLite read failed:', err);
    }

    // 3. Network
    let fresh: AnitabiBangumi | null;
    try {
      fresh = await this.client.getLite(bangumiId);
    } catch (err) {
      if (err instanceof DataSourceError && err.code === 'NOT_FOUND') {
        // Defensive — client maps 404→null already, but we double-check.
        this.memCache.set(bangumiId, { kind: 'miss' });
        return null;
      }
      throw err;
    }

    if (fresh === null) {
      this.memCache.set(bangumiId, { kind: 'miss' });
      return null;
    }

    this.memCache.set(bangumiId, { kind: 'hit', value: fresh });

    // Persist (best effort — log & continue on failure).
    try {
      const cachedAt = this.now();
      const save: PilgrimageSaveInput = {
        bangumiId: fresh.id,
        title: fresh.title,
        titleCn: fresh.cn ?? null,
        city: fresh.city ?? null,
        cover: fresh.cover ?? null,
        color: fresh.color ?? null,
        centerLat: fresh.geo?.[0] ?? null,
        centerLng: fresh.geo?.[1] ?? null,
        zoom: fresh.zoom ?? null,
        pointsLength: fresh.pointsLength ?? null,
        imagesLength: fresh.imagesLength ?? null,
        litePointsJson: JSON.stringify(fresh.litePoints ?? []),
        cachedAt,
        expiresAt: cachedAt + this.ttlMs,
      };
      await this.db.savePilgrimage(save);
    } catch (err) {
      console.warn('[AnitabiService] SQLite write failed:', err);
    }

    return fresh;
  }

  /**
   * Fetch the full /points/detail payload.
   * Returns [] when the anime has no pilgrimage data (HTTP 404).
   *
   * Lookup order matches getAnimePilgrimage: in-memory → SQLite (via
   * CacheService) → network. The detailed payload is large (~50–300 KB) but
   * effectively immutable for our purposes, so we cache it with the same
   * 7-day TTL as the lite payload.
   */
  async getDetailedPoints(bangumiId: number): Promise<AnitabiPointDetail[]> {
    // 1. In-memory cache (hot path on repeat visits within the session).
    const memHit = this.detailMemCache.get(bangumiId);
    if (memHit) {
      return memHit.kind === 'hit' ? memHit.value : [];
    }

    // 2. Dedup concurrent in-flight requests for the same anime.
    const pending = this.pendingDetail.get(bangumiId);
    if (pending) return pending;

    const promise = (async (): Promise<AnitabiPointDetail[]> => {
      // 3. SQLite cache.
      try {
        const cached = await this.cache.get<AnitabiPointDetail[]>(
          DETAIL_CACHE_KEY_PREFIX + bangumiId
        );
        if (cached) {
          this.detailMemCache.set(bangumiId, { kind: 'hit', value: cached });
          return cached;
        }
      } catch (err) {
        console.warn('[AnitabiService] detail cache read failed:', err);
      }

      // 4. Network.
      let fresh: AnitabiPointDetail[] | null;
      try {
        fresh = await this.client.getPointsDetail(bangumiId);
      } catch (err) {
        if (err instanceof DataSourceError && err.code === 'NOT_FOUND') {
          this.detailMemCache.set(bangumiId, { kind: 'miss' });
          return [];
        }
        throw err;
      }

      if (fresh === null) {
        this.detailMemCache.set(bangumiId, { kind: 'miss' });
        return [];
      }

      this.detailMemCache.set(bangumiId, { kind: 'hit', value: fresh });
      // Persist (best effort).
      try {
        await this.cache.set(DETAIL_CACHE_KEY_PREFIX + bangumiId, fresh, this.ttlMs);
      } catch (err) {
        console.warn('[AnitabiService] detail cache write failed:', err);
      }
      return fresh;
    })();

    this.pendingDetail.set(bangumiId, promise);
    try {
      return await promise;
    } finally {
      this.pendingDetail.delete(bangumiId);
    }
  }

  /** Drop the cache entry for one anime. */
  invalidate(bangumiId: number): void {
    this.memCache.delete(bangumiId);
    this.detailMemCache.delete(bangumiId);
    void this.cache.delete(DETAIL_CACHE_KEY_PREFIX + bangumiId).catch(() => undefined);
  }

  /** Drop every in-memory entry. */
  invalidateAll(): void {
    this.memCache.clear();
    this.detailMemCache.clear();
  }

  /**
   * Rehydrate a {@link AnitabiBangumi} from a SQLite row written by
   * {@link savePilgrimage}.
   */
  private rowToBangumi(row: PilgrimageRow): AnitabiBangumi {
    let litePoints: AnitabiPoint[] = [];
    if (row.lite_points_json) {
      try {
        const parsed = JSON.parse(row.lite_points_json) as unknown;
        if (Array.isArray(parsed)) {
          litePoints = parsed as AnitabiPoint[];
        }
      } catch {
        litePoints = [];
      }
    }
    return {
      id: row.bangumi_id,
      cn: row.title_cn ?? '',
      title: row.title,
      city: row.city ?? '',
      cover: row.cover ?? '',
      color: row.color ?? '',
      geo: [row.center_lat ?? 0, row.center_lng ?? 0],
      zoom: row.zoom ?? 0,
      modified: 0,
      litePoints,
      pointsLength: row.points_length ?? 0,
      imagesLength: row.images_length ?? 0,
    };
  }
}

export const anitabiService = AnitabiService.getInstance();

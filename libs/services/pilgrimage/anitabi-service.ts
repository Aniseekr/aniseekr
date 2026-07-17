// Singleton service that fronts the Anitabi HTTP client with both an
// in-memory and a SQLite-backed cache. Spec: docs/spec/pilgrimage_spec.md §4–§6.

import { LocalDB, type PilgrimageRow, type PilgrimageSaveInput } from '../../db';
import { AnitabiClient, DataSourceError } from '../../clients/anitabi-client';
import { CacheService } from '../cache-service';
import { normalizeLiteBangumi, normalizeRawPoints } from './anitabi-points';
import type {
  AnitabiBangumi,
  AnitabiPoint,
  RawAnitabiBangumiPoints,
  RawAnitabiPointsDetail,
} from './types';

/** Default lite-cache TTL (7 days) in milliseconds. */
export const PILGRIMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cache key prefix for the full per-anime point list. The `_v2` suffix is a
 * deliberate cache-bust: builds <= 1.1.5 cached the truncated `/points/detail`
 * payload under `anitabi_detail_`; bumping the prefix forces every device to
 * refetch the complete `/points` data instead of serving stale partial data.
 *
 * NOTE: do NOT bump this casually. A bump invalidates every device's cached
 * pilgrimage data simultaneously, and a single user scrolling through the
 * pilgrimage list can fan out into 10+ parallel SQLite writes — enough to
 * trigger expo-sqlite's "database is locked" path. The `origin` / `originURL`
 * additions added in 1.1.6 are additive (optional fields with safe fallbacks
 * in the UI), so old cached entries simply lack attribution data and pick it
 * up naturally as the 7-day TTL expires — no cache-bust required.
 */
export const DETAIL_CACHE_KEY_PREFIX = 'anitabi_points_v2_';

/** How far past TTL a cached detail payload may still be served on network failure. */
export const DETAIL_STALE_GRACE_MS = 90 * 24 * 60 * 60 * 1000;

/** Sentinel rows for in-memory cache so we can also remember "no data" results. */
type CacheValue = { kind: 'hit'; value: AnitabiBangumi } | { kind: 'miss' };
type DetailCacheValue = { kind: 'hit'; value: AnitabiPoint[] } | { kind: 'miss' };

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
  /** In-flight lite requests deduped by bangumiId. */
  private pendingLite = new Map<number, Promise<AnitabiBangumi | null>>();
  /** In-flight detail requests deduped by bangumiId. */
  private pendingDetail = new Map<number, Promise<AnitabiPoint[]>>();
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

    // 2. Concurrent callers share the same SQLite/network path.
    const pending = this.pendingLite.get(bangumiId);
    if (pending) return pending;

    const promise = (async (): Promise<AnitabiBangumi | null> => {
      // 3. SQLite cache
      let staleRow: PilgrimageRow | null = null;
      try {
        const row = await this.db.getPilgrimage(bangumiId);
        if (row) {
          if (row.expires_at > this.now()) {
            const decoded = this.rowToBangumi(row);
            this.memCache.set(bangumiId, { kind: 'hit', value: decoded });
            return decoded;
          }
          // Expired — keep as a stale-if-error fallback instead of discarding.
          staleRow = row;
        }
      } catch (err) {
        // SQLite read failures are non-fatal — fall through to network.

        console.warn('[AnitabiService] SQLite read failed:', err);
      }

      // 4. Network
      let fresh: AnitabiBangumi | null;
      try {
        fresh = await this.client.getLite(bangumiId);
      } catch (err) {
        if (err instanceof DataSourceError && err.code === 'NOT_FOUND') {
          // Defensive — client maps 404→null already, but we double-check.
          this.memCache.set(bangumiId, { kind: 'miss' });
          return null;
        }
        if (staleRow) {
          // Stale beats blank: anitabi is a fragile third party (CF WAF 403s,
          // see spec 2026-07-03 §1.1) — serve the expired row rather than
          // rendering an empty screen over data we still hold.
          // Stale serves are per-call, not memoized, so recovery is picked
          // up on the next call once the network is healthy again.
          return this.rowToBangumi(staleRow);
        }
        throw err;
      }

      if (fresh === null) {
        this.memCache.set(bangumiId, { kind: 'miss' });
        return null;
      }

      fresh = normalizeLiteBangumi(fresh);
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
    })();

    this.pendingLite.set(bangumiId, promise);
    try {
      return await promise;
    } finally {
      this.pendingLite.delete(bangumiId);
    }
  }

  /**
   * Fetch the COMPLETE point list for an anime — every scene-cut Anitabi has.
   * Returns [] when the anime has no pilgrimage data (HTTP 404 / empty).
   *
   * Backed by `GET /bangumi/{id}/points` (see {@link AnitabiClient.getPoints}
   * for why this is not `/points/detail`). The raw payload is large — folder /
   * theme metadata plus hundreds of points — so we normalise it down to the
   * fields we render before caching. Lookup order matches getAnimePilgrimage:
   * in-memory → SQLite (via CacheService) → network, 7-day TTL.
   */
  async getDetailedPoints(bangumiId: number): Promise<AnitabiPoint[]> {
    // 1. In-memory cache (hot path on repeat visits within the session).
    const memHit = this.detailMemCache.get(bangumiId);
    if (memHit) {
      return memHit.kind === 'hit' ? memHit.value : [];
    }

    // 2. Dedup concurrent in-flight requests for the same anime.
    const pending = this.pendingDetail.get(bangumiId);
    if (pending) return pending;

    const promise = (async (): Promise<AnitabiPoint[]> => {
      // 3. SQLite cache — a SINGLE getWithMeta read covers both the fresh
      // hit and the stale-if-error fallback. A plain `get()` (graceMs=0)
      // would DELETE the row once it's past TTL, so by the time a later
      // network failure tried to read it as "stale", it would already be
      // gone — that was the bug. Reading once with the grace window keeps
      // the row available for both outcomes.
      //
      // The row itself is written with a WIDENED ttl (this.ttlMs +
      // DETAIL_STALE_GRACE_MS — see the `cache.set` call below), so
      // CacheService.prune() at boot (CacheManager.pruneAll(), see
      // app/_layout.tsx) does not reap a row that's merely past the base
      // TTL but still inside the stale-if-error grace window. Because the
      // row's own ttl is now the widened value, we read with graceMs=0 (the
      // row survives on its own until the widened ttl) and derive staleness
      // ourselves from `meta.age` vs the BASE ttl, rather than trusting
      // CacheService's `isStale` (which would compare against the widened
      // ttl and basically never report stale).
      let staleCandidate: AnitabiPoint[] | null = null;
      try {
        const meta = await this.cache.getWithMeta<AnitabiPoint[]>(
          DETAIL_CACHE_KEY_PREFIX + bangumiId,
          0
        );
        if (meta && Array.isArray(meta.value) && meta.value.length > 0) {
          const isStale = meta.age > this.ttlMs;
          if (!isStale) {
            this.detailMemCache.set(bangumiId, { kind: 'hit', value: meta.value });
            return meta.value;
          }
          // Past the base TTL but within the stale-if-error grace window —
          // hold onto it as a fallback candidate. Do NOT memoize yet: we
          // only serve it if the network below actually fails.
          staleCandidate = meta.value;
        }
      } catch (err) {
        console.warn('[AnitabiService] points cache read failed:', err);
      }

      // 4. Network. `/points` carries the complete payload (every scene-cut)
      // but no `originURL`; `/points/detail` is server-deduped (~22–80% subset)
      // but is the only endpoint that exposes the originator URL. Fire both in
      // parallel and merge the URLs onto the full point list by id, so we keep
      // /points' breadth and pick up /points/detail's attribution links.
      let raw: RawAnitabiBangumiPoints | null;
      let detail: RawAnitabiPointsDetail | null = null;
      try {
        const [pointsResult, detailResult] = await Promise.allSettled([
          this.client.getPoints(bangumiId),
          this.client.getPointsDetail(bangumiId),
        ]);

        if (pointsResult.status === 'rejected') {
          const err = pointsResult.reason;
          if (err instanceof DataSourceError && err.code === 'NOT_FOUND') {
            this.detailMemCache.set(bangumiId, { kind: 'miss' });
            return [];
          }
          if (staleCandidate) {
            // Stale serves are per-call, not memoized, so recovery is
            // picked up on the next call once the network is healthy again.
            return staleCandidate;
          }
          throw err;
        }
        raw = pointsResult.value;
        // /points/detail failing is non-fatal — we still render points without
        // an originURL link. The `origin` text label still comes through from
        // /points itself.
        if (detailResult.status === 'fulfilled') {
          detail = detailResult.value;
        }
      } catch (err) {
        if (err instanceof DataSourceError && err.code === 'NOT_FOUND') {
          this.detailMemCache.set(bangumiId, { kind: 'miss' });
          return [];
        }
        if (staleCandidate) {
          // Stale serves are per-call, not memoized, so recovery is picked
          // up on the next call once the network is healthy again.
          return staleCandidate;
        }
        throw err;
      }

      const fresh = raw === null ? [] : normalizeRawPoints(raw.points, bangumiId);
      if (fresh.length > 0 && detail && detail.length > 0) {
        const urlById = new Map<string, string>();
        for (const item of detail) {
          if (!item || typeof item !== 'object') continue;
          const id = typeof item.id === 'string' ? item.id.trim() : '';
          const url = typeof item.originURL === 'string' ? item.originURL.trim() : '';
          if (id.length > 0 && url.length > 0) urlById.set(id, url);
        }
        if (urlById.size > 0) {
          for (let i = 0; i < fresh.length; i++) {
            const url = urlById.get(fresh[i].id);
            if (url && !fresh[i].originURL) {
              fresh[i] = { ...fresh[i], originURL: url };
            }
          }
        }
      }

      if (fresh.length === 0) {
        this.detailMemCache.set(bangumiId, { kind: 'miss' });
        return [];
      }

      this.detailMemCache.set(bangumiId, { kind: 'hit', value: fresh });
      // Persist (best effort). The row's SQLite ttl is widened to
      // ttlMs + DETAIL_STALE_GRACE_MS (see the read above) so a boot-time
      // CacheService.prune() cannot delete it before the stale-if-error
      // grace window we actually want has elapsed.
      try {
        await this.cache.set(
          DETAIL_CACHE_KEY_PREFIX + bangumiId,
          fresh,
          this.ttlMs + DETAIL_STALE_GRACE_MS
        );
      } catch (err) {
        console.warn('[AnitabiService] points cache write failed:', err);
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
    this.pendingLite.delete(bangumiId);
    void this.cache.delete(DETAIL_CACHE_KEY_PREFIX + bangumiId).catch(() => undefined);
  }

  /** Drop every in-memory entry. */
  invalidateAll(): void {
    this.memCache.clear();
    this.detailMemCache.clear();
    this.pendingLite.clear();
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
    return normalizeLiteBangumi({
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
    });
  }
}

export const anitabiService = AnitabiService.getInstance();

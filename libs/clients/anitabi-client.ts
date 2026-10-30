// Anitabi transport facade. Calls ONLY the endpoints documented in
// https://github.com/anitabi/anitabi.cn-document/blob/main/api.md — anitabi's
// Cloudflare puts an IP on temporary risk control when it requests paths
// outside that surface (anitabi/anitabi.cn-document#94), after which even the
// documented endpoints answer 403. On a 403 we stop calling anitabi for a
// while instead of trying other URLs; callers serve their cached data.

import type { AnitabiBangumi, RawAnitabiPointsDetail } from '../services/pilgrimage/types';
import { normalizeLiteBangumi } from '../services/pilgrimage/anitabi-points';
import { rateLimiter } from '../services/rate-limiter';

const ANITABI_BASE_URL = 'https://api.anitabi.cn';
const USER_AGENT = 'Aniseekr/1.0 (https://aniseekr.moe)';

/** How long to stay off anitabi after it answers 403. */
export const ANITABI_FORBIDDEN_BACKOFF_MS = 30 * 60 * 1000;

/**
 * Local DataSourceError used by the Anitabi client.
 *
 * The global DataSourceError lives under libs/services/data-sources/, which is
 * owned by another agent and not yet present. To keep the pilgrimage module
 * self-contained we ship a compatible local copy that mirrors the spec
 * contract (see docs/spec/architecture.md §7).
 */
export type AnitabiErrorCode =
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'DECODING_ERROR'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'INVALID_ID'
  | 'UNKNOWN';

export class DataSourceError extends Error {
  readonly code: AnitabiErrorCode;
  readonly platform: 'anitabi';
  readonly cause?: unknown;
  readonly status?: number;
  constructor(code: AnitabiErrorCode, message: string, cause?: unknown, status?: number) {
    super(message);
    this.name = 'DataSourceError';
    this.code = code;
    this.platform = 'anitabi';
    this.cause = cause;
    this.status = status;
  }
}

interface FetchOptions {
  /** Override fetch (used by tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. Defaults to 30 000. */
  timeoutMs?: number;
}

export class AnitabiClient {
  private static forbiddenUntil = 0;

  /**
   * Load the anime container and sample points (`GET /bangumi/{id}/lite`).
   * Returns null when the anime has no pilgrimage entry (HTTP 404).
   */
  static async getLite(bangumiId: number, opts: FetchOptions = {}): Promise<AnitabiBangumi | null> {
    const bangumi = await AnitabiClient.request<AnitabiBangumi>(`/bangumi/${bangumiId}/lite`, opts);
    return bangumi ? normalizeLiteBangumi(bangumi) : null;
  }

  /**
   * Load the point list with screenshots (`GET /bangumi/{id}/points/detail`).
   * This is a server-side subset of `pointsLength` (anitabi.cn-document#83);
   * it is the only documented point endpoint, so we accept the smaller list.
   *
   * Returns null when the anime has no pilgrimage entry (HTTP 404).
   */
  static async getPointsDetail(
    bangumiId: number,
    opts: FetchOptions = {}
  ): Promise<RawAnitabiPointsDetail | null> {
    return AnitabiClient.request<RawAnitabiPointsDetail>(
      `/bangumi/${bangumiId}/points/detail?haveImage=true`,
      opts
    );
  }

  /** Test-only seam: forget a previous 403 backoff. */
  static resetForTests(): void {
    AnitabiClient.forbiddenUntil = 0;
  }

  private static async request<T>(path: string, opts: FetchOptions): Promise<T | null> {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new DataSourceError('NETWORK_ERROR', 'fetch is not available in this environment');
    }
    if (Date.now() < AnitabiClient.forbiddenUntil) {
      throw new DataSourceError(
        'UNAUTHORIZED',
        'Anitabi answered 403 recently; backing off',
        undefined,
        403
      );
    }
    await rateLimiter.waitForAvailability('anitabi');

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const timer =
      controller !== undefined && timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    let response: Response;
    try {
      response = await fetchImpl(`${ANITABI_BASE_URL}${path}`, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller?.signal,
      });
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      throw new DataSourceError(
        'NETWORK_ERROR',
        `Failed to reach Anitabi: ${(err as Error).message}`,
        err
      );
    }
    if (timer !== undefined) clearTimeout(timer);

    if (response.status === 404) {
      return null;
    }
    if (response.status === 403) {
      AnitabiClient.forbiddenUntil = Date.now() + ANITABI_FORBIDDEN_BACKOFF_MS;
      throw new DataSourceError(
        'UNAUTHORIZED',
        'Anitabi request forbidden: HTTP 403',
        undefined,
        403
      );
    }
    if (response.status === 429) {
      throw new DataSourceError('RATE_LIMITED', 'Anitabi rate limit exceeded');
    }
    if (!response.ok) {
      throw new DataSourceError(
        response.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN',
        `Anitabi request failed: HTTP ${response.status}`,
        undefined,
        response.status
      );
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new DataSourceError(
        'DECODING_ERROR',
        `Failed to decode Anitabi response: ${(err as Error).message}`,
        err
      );
    }
  }
}

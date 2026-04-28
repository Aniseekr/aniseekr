/**
 * Jikan REST transport client (https://api.jikan.moe/v4).
 *
 * Pure HTTP — no domain mapping, no caching. The data source layer
 * (`libs/services/data-sources/jikan-data-source.ts`) is responsible for
 * mapping payloads to `UnifiedAnimeItem`.
 *
 * Responsibilities:
 *   - rate-limit channel `jikan`
 *   - 429 → exponential backoff retry (3 attempts: 1s, 2s, 4s) honoring `Retry-After`
 *   - HTTP errors → `DataSourceError`
 *
 * Spec: `spec/api_contracts.md` §2.
 */

import { DataSourceError } from '../services/data-sources/data-source-error';
import { rateLimiter } from '../services/rate-limiter';
import { Logger } from '../utils/logger';

const BASE_URL = 'https://api.jikan.moe/v4';

/**
 * Standard Jikan response envelope. Most endpoints wrap the payload in
 * `{ data, pagination }`; some endpoints (e.g. `/anime/{id}/themes`) embed
 * the payload directly under `data` without pagination.
 */
export interface JikanResponse<T> {
  data: T;
  pagination?: JikanPagination;
}

export interface JikanPagination {
  last_visible_page?: number;
  has_next_page?: boolean;
  items?: {
    count?: number;
    total?: number;
    per_page?: number;
  };
}

export interface JikanClientOptions {
  fetchImpl?: typeof fetch;
  /** Override the wait helper for tests so backoff doesn't burn real wall time. */
  sleep?: (ms: number) => Promise<void>;
  /** Override the base URL (for tests against a local server). */
  baseUrl?: string;
}

const DEFAULT_SLEEP = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Jikan transport. Stateless. Construct anywhere or use the default
 * `JikanClient` static methods.
 *
 * 429 handling:
 *   - up to 3 retries (4 total attempts)
 *   - delay schedule: 1s, 2s, 4s (or `Retry-After` header if larger)
 *   - cooldown registered on the rate-limiter so concurrent callers also wait
 */
export class JikanClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly baseUrl: string;

  constructor(options: JikanClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? DEFAULT_SLEEP;
    this.baseUrl = options.baseUrl ?? BASE_URL;
  }

  /**
   * Issue a GET request to a Jikan endpoint.
   *
   * `path` MUST start with `/`. `params` are stringified to query params.
   * Returns the parsed JSON body — caller decides how to narrow it.
   */
  async get<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<T> {
    const url = this.buildUrl(path, params);

    const MAX_ATTEMPTS = 4;
    const BACKOFF_MS = [1000, 2000, 4000];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await rateLimiter.waitForAvailability('jikan');

      let response: Response;
      try {
        response = await this.fetchImpl(url);
      } catch (cause) {
        throw DataSourceError.fromNetwork(cause, 'myanimelist');
      }

      if (response.status === 429) {
        const isLast = attempt >= MAX_ATTEMPTS - 1;
        if (isLast) {
          rateLimiter.registerCooldown('jikan', 10_000);
          throw DataSourceError.fromHttpStatus(429, {
            platform: 'myanimelist',
            message: 'Jikan rate limited (max retries exceeded)',
          });
        }
        const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
        const waitMs = Math.max(retryAfterMs ?? 0, BACKOFF_MS[attempt] ?? 4000);
        Logger.warn(
          `[JikanClient] 429 on ${path} — attempt ${attempt + 1}/${MAX_ATTEMPTS}, waiting ${waitMs}ms`
        );
        rateLimiter.registerCooldown('jikan', waitMs);
        await this.sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw DataSourceError.fromHttpStatus(response.status, {
          platform: 'myanimelist',
          message: `Jikan HTTP ${response.status} on ${path}`,
        });
      }

      try {
        return (await response.json()) as T;
      } catch (cause) {
        throw DataSourceError.fromDecoding(cause, 'myanimelist');
      }
    }

    // Unreachable — the loop either returns or throws. Defensive throw to
    // appease the type checker.
    throw new DataSourceError({
      code: 'RATE_LIMITED',
      platform: 'myanimelist',
      message: 'Jikan retry budget exhausted',
    });
  }

  private buildUrl(
    path: string,
    params: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
    return url.toString();
  }

  // MARK: - Static convenience (backwards-compatible facade)

  private static defaultInstance: JikanClient | null = null;

  private static getDefaultInstance(): JikanClient {
    if (!JikanClient.defaultInstance) {
      JikanClient.defaultInstance = new JikanClient();
    }
    return JikanClient.defaultInstance;
  }

  /**
   * Legacy entry point used by `CharacterService` and a few other callers.
   * Delegates to the default instance so retry/cooldown behavior is shared.
   */
  static async get<T>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<T> {
    return JikanClient.getDefaultInstance().get<T>(endpoint, params);
  }

  /** Replace the default instance (test hook). */
  static __setDefaultForTests(instance: JikanClient | null): void {
    JikanClient.defaultInstance = instance;
  }
}

// MARK: - Helpers

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
}

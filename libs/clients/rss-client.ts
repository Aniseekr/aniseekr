import { DataSourceError } from '../services/data-sources/data-source-error';
import { rateLimiter } from '../services/rate-limiter';

const USER_AGENT = 'Aniseekr/1.0 (https://github.com/Aniseekr)';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml';

type RssFetch = (input: string, init: RequestInit) => Promise<Response>;

interface FetchOptions {
  fetchImpl?: RssFetch;
  timeoutMs?: number;
  skipRateLimit?: boolean;
}

export class RssClient {
  static async fetch(url: string, opts: FetchOptions = {}): Promise<string> {
    const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as RssFetch | undefined);
    if (typeof fetchImpl !== 'function') {
      throw new DataSourceError({ code: 'NETWORK_ERROR', message: 'fetch is not available' });
    }
    if (!opts.skipRateLimit) {
      await rateLimiter.waitForAvailability('rss');
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const timer =
      controller !== undefined && timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: ACCEPT },
        signal: controller?.signal,
      });
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      throw new DataSourceError({
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'RSS network error',
        cause: err,
      });
    }
    if (timer !== undefined) clearTimeout(timer);

    if (response.status === 429) {
      const cooldownMs = retryAfterMs(response.headers.get('Retry-After'));
      rateLimiter.registerCooldown('rss', cooldownMs);
      throw new DataSourceError({ code: 'RATE_LIMITED', message: 'RSS rate limit exceeded' });
    }
    if (!response.ok) {
      throw new DataSourceError({
        code: response.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN',
        message: `RSS request failed: HTTP ${response.status}`,
      });
    }
    try {
      return await response.text();
    } catch (err) {
      throw new DataSourceError({
        code: 'DECODING_ERROR',
        message: err instanceof Error ? err.message : 'RSS decode error',
        cause: err,
      });
    }
  }
}

function retryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : 0;
}

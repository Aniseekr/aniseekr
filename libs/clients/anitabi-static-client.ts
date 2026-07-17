import {
  ANITABI_STATIC_CATALOG_URL,
  ANITABI_STATIC_PAGE_URL,
  decodeAnitabiStaticCatalog,
  decodeAnitabiStaticPage,
  getAnitabiStaticPage,
  type AnitabiStaticCatalog,
  type AnitabiStaticDecodedPage,
} from '../services/pilgrimage/anitabi-static-data';

interface StaticFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface FetchCache {
  catalog?: Promise<AnitabiStaticCatalog>;
  pages: Map<number, Promise<unknown>>;
}

let cacheByFetch = new WeakMap<typeof fetch, FetchCache>();

/** Client for the official static data files used by anitabi.cn itself. */
export class AnitabiStaticClient {
  static async getBangumi(
    bangumiId: number,
    opts: StaticFetchOptions = {}
  ): Promise<AnitabiStaticDecodedPage | null> {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('fetch is not available');

    const cache = getCache(fetchImpl);
    const catalog = await loadCatalog(fetchImpl, cache, opts.timeoutMs);
    const page = getAnitabiStaticPage(catalog, bangumiId);
    if (page === null) return null;
    const payload = await loadPage(fetchImpl, cache, page, opts.timeoutMs);
    return decodeAnitabiStaticPage(catalog, payload, bangumiId);
  }

  static resetCacheForTests(): void {
    cacheByFetch = new WeakMap();
  }
}

function getCache(fetchImpl: typeof fetch): FetchCache {
  let cache = cacheByFetch.get(fetchImpl);
  if (!cache) {
    cache = { pages: new Map() };
    cacheByFetch.set(fetchImpl, cache);
  }
  return cache;
}

function loadCatalog(
  fetchImpl: typeof fetch,
  cache: FetchCache,
  timeoutMs?: number
): Promise<AnitabiStaticCatalog> {
  if (!cache.catalog) {
    cache.catalog = requestJson(ANITABI_STATIC_CATALOG_URL, fetchImpl, timeoutMs)
      .then(decodeAnitabiStaticCatalog)
      .catch((error) => {
        cache.catalog = undefined;
        throw error;
      });
  }
  return cache.catalog;
}

function loadPage(
  fetchImpl: typeof fetch,
  cache: FetchCache,
  page: number,
  timeoutMs?: number
): Promise<unknown> {
  let pending = cache.pages.get(page);
  if (!pending) {
    pending = requestJson(ANITABI_STATIC_PAGE_URL(page), fetchImpl, timeoutMs).catch((error) => {
      cache.pages.delete(page);
      throw error;
    });
    cache.pages.set(page, pending);
  }
  return pending;
}

async function requestJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs = 30_000
): Promise<unknown> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer =
    controller !== undefined && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Referer: 'https://www.anitabi.cn/' },
      signal: controller?.signal,
    });
    if (!response.ok) throw new Error(`Anitabi static request failed: HTTP ${response.status}`);
    return await response.json();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

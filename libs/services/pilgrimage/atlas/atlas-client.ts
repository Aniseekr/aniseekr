import { CacheService } from '../../cache-service';
import type {
  AtlasCitiesIndex,
  AtlasMeta,
  AtlasSpotsLite,
  AtlasWorkDetail,
  AtlasWorkIndex,
} from './types';

const BASE_URL = 'https://atlas.aniseekr.moe';
const GRACE_MS = 30 * 24 * 60 * 60 * 1000;
type Cache = Pick<typeof CacheService, 'getSync' | 'getWithMeta' | 'set'>;

export class AtlasClient {
  private version: string | null = null;
  private pending = new Map<string, Promise<unknown>>();
  private cityLookupVersion: string | null = null;
  private cityLookupValues: ReadonlyMap<string, AtlasCityLabel> | null = null;
  constructor(private readonly options: { fetcher?: typeof fetch; cache?: Cache | null } = {}) {}
  private get fetcher() {
    return this.options.fetcher ?? fetch;
  }
  private get cache() {
    return this.options.cache === undefined ? CacheService : this.options.cache;
  }

  async meta(): Promise<AtlasMeta> {
    const key = 'atlas:meta';
    const cached = this.cache?.getSync<AtlasMeta>(key);
    const stale = cached ? null : await this.cache?.getWithMeta<AtlasMeta>(key, 60_000);
    const meta =
      cached ?? stale?.value ?? (await this.fetchJson<AtlasMeta>(`${BASE_URL}/meta.json`));
    this.version = meta.dataVersion;
    if (!cached && !stale) await this.cache?.set(key, meta, 60_000);
    if (stale?.isStale) void this.refreshMeta(key).catch(() => undefined);
    return meta;
  }
  async works(): Promise<AtlasWorkIndex> {
    const snapshot = require('./works.snapshot.json') as AtlasWorkIndex;
    const cachedMeta = this.cache?.getSync<AtlasMeta>('atlas:meta');
    const cacheVersion = cachedMeta?.dataVersion ?? snapshot.dataVersion ?? 'snapshot';
    const cached = this.cache?.getSync<AtlasWorkIndex>(`atlas:${cacheVersion}:works`);
    if (cached) return cached;

    void this.revalidateWorks(snapshot).catch(() => undefined);
    return snapshot;
  }
  async work(key: string): Promise<AtlasWorkDetail | null> {
    try {
      return await this.asset(`work:${key}`, null, (meta) =>
        meta.paths.work.replace('{key}', encodeURIComponent(key))
      );
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
  }
  async spotsLite(): Promise<AtlasSpotsLite> {
    return this.asset<AtlasSpotsLite>('spots-lite', null, (meta) => meta.paths.spotsLite);
  }
  async cities(): Promise<AtlasCitiesIndex> {
    return this.asset<AtlasCitiesIndex>(
      'cities',
      null,
      (meta) => meta.paths.cities ?? `/v/${meta.dataVersion}/cities.json`
    );
  }
  async cityLookup(): Promise<ReadonlyMap<string, AtlasCityLabel>> {
    const index = await this.cities();
    if (this.cityLookupVersion !== index.dataVersion || !this.cityLookupValues) {
      this.cityLookupValues = atlasCityLookup(index.cities);
      this.cityLookupVersion = index.dataVersion;
    }
    return this.cityLookupValues;
  }
  async moved(): Promise<{ moved: Record<string, string | null> }> {
    return this.asset<{ moved: Record<string, string | null> }>(
      'moved',
      null,
      (meta) => meta.paths.moved ?? `/v/${meta.dataVersion}/moved.json`
    );
  }
  async resolveMovedSpot(id: string): Promise<string | null> {
    const mapping = (await this.moved()).moved;
    return Object.prototype.hasOwnProperty.call(mapping, id) ? mapping[id] : id;
  }
  private async asset<T>(
    name: string,
    seed: T | null,
    path: (meta: AtlasMeta) => string
  ): Promise<T> {
    let meta = await this.meta();
    const key = `atlas:${meta.dataVersion}:${name}`;
    const sync = this.cache?.getSync<T>(key);
    if (sync) return sync;
    const stale = await this.cache?.getWithMeta<T>(key, GRACE_MS);
    if (stale) {
      if (stale.isStale) void this.refresh(key, path(meta)).catch(() => undefined);
      return stale.value;
    }
    if (seed) {
      void this.refresh(key, path(meta)).catch(() => undefined);
      return seed;
    }
    try {
      return await this.refresh(key, path(meta));
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      meta = await this.fetchJson<AtlasMeta>(`${BASE_URL}/meta.json`);
      this.version = meta.dataVersion;
      await this.cache?.set('atlas:meta', meta, 60_000);
      return this.refresh(`atlas:${meta.dataVersion}:${name}`, path(meta));
    }
  }
  private async refresh<T>(key: string, urlPath: string): Promise<T> {
    const pending = this.pending.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const request = (async () => {
      const value = await this.fetchJson<T>(`${BASE_URL}${urlPath}`);
      await this.cache?.set(key, value, 7 * 24 * 60 * 60 * 1000);
      return value;
    })();
    this.pending.set(key, request);
    try {
      return await request;
    } finally {
      this.pending.delete(key);
    }
  }
  private async refreshMeta(key: string): Promise<AtlasMeta> {
    const value = await this.fetchJson<AtlasMeta>(`${BASE_URL}/meta.json`);
    this.version = value.dataVersion;
    await this.cache?.set(key, value, 60_000);
    return value;
  }

  private async revalidateWorks(snapshot: AtlasWorkIndex): Promise<void> {
    const meta = await this.meta();
    const key = `atlas:${meta.dataVersion}:works`;
    const cached = await this.cache?.getWithMeta<AtlasWorkIndex>(key, GRACE_MS);
    if (cached && !cached.isStale) return;
    if (cached) {
      await this.refresh(key, meta.paths.works);
      return;
    }

    try {
      await this.refresh(key, meta.paths.works);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      const latestMeta = await this.fetchJson<AtlasMeta>(`${BASE_URL}/meta.json`);
      await this.cache?.set('atlas:meta', latestMeta, 60_000);
      await this.refresh(`atlas:${latestMeta.dataVersion}:works`, latestMeta.paths.works);
    }
    if (!meta.dataVersion) {
      await this.cache?.set('atlas:snapshot:works', snapshot, 7 * 24 * 60 * 60 * 1000);
    }
  }
  private async fetchJson<T>(url: string): Promise<T> {
    const response = await this.fetcher(url);
    if (!response.ok) throw new HttpError(response.status);
    return response.json() as Promise<T>;
  }
}
class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Atlas HTTP ${status}`);
  }
}

export type AtlasCityLabel = Pick<import('./types').AtlasCity, 'pref' | 'name'>;

function atlasCityLookup(
  cities: AtlasCitiesIndex['cities']
): ReadonlyMap<string, AtlasCityLabel> {
  return new Map(cities.map(({ muniCd, pref, name }) => [muniCd, { pref, name }]));
}

export const atlasClient = new AtlasClient();

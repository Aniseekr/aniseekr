import {
  BangumiClient,
  type BangumiV0SearchResponse,
  type BangumiV0Subject,
} from '../../clients/bangumi-client';
import { atlasClient, type AtlasCityLabel } from './atlas/atlas-client';
import type { AtlasWork } from './atlas/types';
import { normalizeAtlasTitle } from './atlas/atlas-resolver';
import { pilgrimageRepository } from './pilgrimage-repository';
import type { PilgrimageWork } from './types';

export type PilgrimageSearchSource = 'atlas-index' | 'bangumi-fallback';

export interface PilgrimageSearchResult {
  workKey: string;
  bangumiId: number | null;
  title: string;
  titleCn: string;
  titleEnglish?: string;
  titleRomaji?: string;
  city: string;
  cityCodes: string[];
  cover: string;
  color: string;
  pointsLength: number;
  source: PilgrimageSearchSource;
}

interface SearchOptions {
  limit?: number;
  includeBangumiFallback?: boolean;
}

interface BangumiSearchClient {
  searchSubjects(keyword: string, page?: number): Promise<BangumiV0SearchResponse>;
}

interface RepositoryLike {
  getSpotsByBangumiId(bangumiId: number): Promise<PilgrimageWork | null>;
}

interface ServiceOptions {
  works?: () => Promise<AtlasWork[]>;
  cityLookup?: () => Promise<ReadonlyMap<string, AtlasCityLabel>>;
  bangumiClient?: BangumiSearchClient;
  repository?: RepositoryLike;
}

const DEFAULT_LIMIT = 20;
const FALLBACK_CANDIDATE_LIMIT = 15;

export class PilgrimageSearchService {
  private readonly getWorks: () => Promise<AtlasWork[]>;
  private readonly getCityLookup: () => Promise<ReadonlyMap<string, AtlasCityLabel>>;
  private readonly bangumiClient: BangumiSearchClient;
  private readonly repository: RepositoryLike;

  constructor(options: ServiceOptions = {}) {
    this.getWorks = options.works ?? (async () => (await atlasClient.works()).works);
    this.getCityLookup = options.cityLookup ?? (() => atlasClient.cityLookup());
    this.bangumiClient = options.bangumiClient ?? BangumiClient;
    this.repository = options.repository ?? pilgrimageRepository;
  }

  async search(query: string, options: SearchOptions = {}): Promise<PilgrimageSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const limit = normalizeLimit(options.limit);
    const works = await this.getWorks();
    const local = searchAtlasWorks(trimmed, works, limit);
    if (local.length >= limit || options.includeBangumiFallback === false) {
      return this.addCityLabels(local);
    }

    const extras = await this.searchBangumiFallback(
      trimmed,
      works,
      limit - local.length,
      new Set(local.flatMap((result) => (result.bangumiId === null ? [] : [result.bangumiId])))
    );
    return this.addCityLabels([...local, ...extras]);
  }

  private async addCityLabels(results: PilgrimageSearchResult[]): Promise<PilgrimageSearchResult[]> {
    if (results.length === 0) return results;
    try {
      const lookup = await this.getCityLookup();
      return results.map((result) => ({
        ...result,
        city: result.cityCodes
          .map((code) => lookup.get(code))
          .filter((city): city is AtlasCityLabel => city !== undefined)
          .map((city) => `${city.pref} ${city.name}`)
          .join(' · '),
      }));
    } catch {
      return results;
    }
  }

  private async searchBangumiFallback(
    query: string,
    works: readonly AtlasWork[],
    limit: number,
    excludeIds: ReadonlySet<number>
  ): Promise<PilgrimageSearchResult[]> {
    let response: BangumiV0SearchResponse;
    try {
      response = await this.bangumiClient.searchSubjects(query, 1);
    } catch (error) {
      console.warn('[PilgrimageSearchService] Bangumi search failed:', error);
      return [];
    }

    const candidates = (response.data ?? [])
      .filter((subject) => subject.type === undefined || subject.type === 2)
      .slice(0, FALLBACK_CANDIDATE_LIMIT);
    const results: PilgrimageSearchResult[] = [];
    const seen = new Set(excludeIds);

    for (const candidate of candidates) {
      if (!isValidSubjectId(candidate.id) || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      const work = works.find((item) => (item.bgm ?? []).includes(candidate.id));
      if (!work) continue;
      const detail = await this.repository.getSpotsByBangumiId(candidate.id).catch(() => null);
      if (!detail) continue;
      results.push(resultFromWork(work, 'bangumi-fallback', candidate));
      if (results.length >= limit) break;
    }
    return results;
  }
}

export function searchAtlasWorks(
  query: string,
  works: readonly AtlasWork[],
  limit = DEFAULT_LIMIT
): PilgrimageSearchResult[] {
  const normalizedQuery = normalizeAtlasTitle(query);
  if (!normalizedQuery) return [];

  const scored = works.flatMap((work) => {
    const fields = [work.ja, work.en, work.zh?.hans, work.zh?.hant, ...work.cities].filter(
      (field): field is string => typeof field === 'string'
    );
    const score = fields.reduce<number | null>((best, field) => {
      const normalized = normalizeAtlasTitle(field);
      if (!normalized) return best;
      const candidate = normalized === normalizedQuery
        ? 0
        : normalized.startsWith(normalizedQuery)
          ? 10
          : normalized.includes(normalizedQuery)
            ? 20
            : null;
      return candidate === null || (best !== null && best <= candidate) ? best : candidate;
    }, null);
    return score === null ? [] : [{ work, score }];
  });

  scored.sort(
    (a, b) => a.score - b.score || b.work.n - a.work.n || a.work.ja.localeCompare(b.work.ja)
  );
  return scored.slice(0, normalizeLimit(limit)).map(({ work }) => resultFromWork(work));
}

function resultFromWork(
  work: AtlasWork,
  source: PilgrimageSearchSource = 'atlas-index',
  subject?: BangumiV0Subject
): PilgrimageSearchResult {
  const bangumiId = work.bgm?.[0] ?? null;
  return {
    workKey: work.key,
    bangumiId,
    title: work.ja || subject?.name || '',
    titleCn: work.zh?.hant || work.zh?.hans || subject?.name_cn || '',
    titleEnglish: work.en || undefined,
    city: '',
    cityCodes: work.cities,
    cover: bangumiId === null ? '' : `https://api.bgm.tv/v0/subjects/${bangumiId}/image?type=common`,
    color: '',
    pointsLength: work.n,
    source,
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.floor(limit);
}

function isValidSubjectId(id: unknown): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

export const pilgrimageSearchService = new PilgrimageSearchService();

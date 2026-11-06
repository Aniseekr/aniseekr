import type { AnimePrequelRelation } from '../../data-sources/anilist-data-source';
import type { AtlasWork } from './types';

export interface AnimeAtlasContext {
  bgmId?: number | string | null;
  malId?: number | string | null;
  anilistId?: number | string | null;
  title?: string | null;
  titleJa?: string | null;
  titleEn?: string | null;
}

export type PrequelRelationFetcher = (anilistId: string) => Promise<AnimePrequelRelation[]>;

const defaultFetchPrequels: PrequelRelationFetcher = async (anilistId) => {
  const { AniListDataSource } = await import('../../data-sources/anilist-data-source');
  return new AniListDataSource().fetchAnimePrequelRelations(anilistId);
};
const prequelCache = new WeakMap<
  PrequelRelationFetcher,
  Map<string, Promise<AnimePrequelRelation[]>>
>();

export function normalizeAtlasTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・･\-‐‑‒–—―－ー〜~!！?？:：'’"“”()（）「」『』【】、。,.]/g, '');
}

export async function resolveAtlasWork(
  context: AnimeAtlasContext,
  works: AtlasWork[],
  fetchPrequels: PrequelRelationFetcher = defaultFetchPrequels
): Promise<string | null> {
  const bgmId = numericId(context.bgmId);
  if (bgmId !== null) {
    const work = works.find((candidate) => (candidate.bgm ?? []).includes(bgmId));
    if (work) return work.key;
  }

  const malId = numericId(context.malId);
  if (malId !== null) {
    const work = works.find((candidate) => candidate.mal.includes(malId));
    if (work) return work.key;
  }

  const titleMatch = findExactTitle(
    [context.titleJa, context.titleEn, context.title].filter(isString),
    works
  );
  if (titleMatch) return titleMatch.key;
  if (context.anilistId == null) return null;

  let currentAniListId = String(context.anilistId);
  const visited = new Set([currentAniListId]);
  for (let hop = 0; hop < 3; hop += 1) {
    const prequel = (await getCachedPrequels(currentAniListId, fetchPrequels))[0];
    if (!prequel || visited.has(String(prequel.anilistId))) return null;

    currentAniListId = String(prequel.anilistId);
    visited.add(currentAniListId);

    if (prequel.malId !== null) {
      const prequelMalId = prequel.malId;
      const malMatch = works.find((candidate) => candidate.mal.includes(prequelMalId));
      if (malMatch) return malMatch.key;
    }

    const prequelTitleMatch = findExactTitle(prequel.title ? [prequel.title] : [], works);
    if (prequelTitleMatch) return prequelTitleMatch.key;
  }

  return null;
}

function getCachedPrequels(
  anilistId: string,
  fetchPrequels: PrequelRelationFetcher
): Promise<AnimePrequelRelation[]> {
  let cacheForFetcher = prequelCache.get(fetchPrequels);
  if (!cacheForFetcher) {
    cacheForFetcher = new Map();
    prequelCache.set(fetchPrequels, cacheForFetcher);
  }
  const cached = cacheForFetcher.get(anilistId);
  if (cached) return cached;

  const request = fetchPrequels(anilistId).catch((error: unknown) => {
    cacheForFetcher.delete(anilistId);
    throw error;
  });
  cacheForFetcher.set(anilistId, request);
  return request;
}

function findExactTitle(titles: string[], works: AtlasWork[]): AtlasWork | undefined {
  const normalizedTitles = titles.filter(isString).map(normalizeAtlasTitle);
  return works.find(
    (work) =>
      (isString(work.ja) && normalizedTitles.includes(normalizeAtlasTitle(work.ja))) ||
      (isString(work.en) && normalizedTitles.includes(normalizeAtlasTitle(work.en)))
  );
}

function numericId(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

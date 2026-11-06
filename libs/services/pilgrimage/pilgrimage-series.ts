import {
  BangumiClient,
  type BangumiRelatedSubject,
  type BangumiV0Subject,
} from '../../clients/bangumi-client';
import { pilgrimageRepository } from './pilgrimage-repository';
import type { PilgrimageSpot, PilgrimageWork } from './types';

export type PilgrimageSeriesSelection = 'all' | number;
export type PilgrimageSeriesPoint = PilgrimageSpot;

export interface PilgrimageSeriesSubject {
  id: number;
  title: string;
  titleCn: string;
  relation: string;
  date: string | null;
  platform: string | null;
  label: string;
}

export interface PilgrimageSeriesEntry {
  subject: PilgrimageSeriesSubject;
  anime: PilgrimageWork | null;
  points: readonly PilgrimageSpot[];
}

export interface PilgrimageSeriesResult {
  seedId: number;
  entries: PilgrimageSeriesEntry[];
  availableEntries: PilgrimageSeriesEntry[];
  unavailableEntries: PilgrimageSeriesEntry[];
  degraded: boolean;
}

interface BangumiRelatedClient {
  getSubject(id: number | string): Promise<BangumiV0Subject>;
  getRelatedSubjects(id: number | string): Promise<BangumiRelatedSubject[]>;
}

interface RepositoryLike {
  getSpotsByBangumiId(id: number): Promise<PilgrimageWork | null>;
}

interface ResolveSeriesOptions {
  bangumiClient?: BangumiRelatedClient;
  repository?: RepositoryLike;
  maxDepth?: number;
  maxSubjects?: number;
}

interface CandidateSubject {
  subject: BangumiV0Subject;
  relation: string;
  depth: number;
}

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_SUBJECTS = 16;
const STRONG_SERIES_RELATIONS = new Set([
  '续集', '前传', '主线故事', '番外篇', '衍生', '总集篇', '全集', 'sequel', 'prequel',
  'main story', 'side story', 'spin-off', 'spin off', 'summary', 'parent story',
]);
const SAME_WORLD_RELATIONS = new Set(['相同世界观', 'same setting', 'same universe']);

export async function resolvePilgrimageSeries(
  seedId: number,
  options: ResolveSeriesOptions = {}
): Promise<PilgrimageSeriesResult> {
  const bangumiClient = options.bangumiClient ?? BangumiClient;
  const repository = options.repository ?? pilgrimageRepository;
  let seedSubject: BangumiV0Subject;
  try {
    seedSubject = await bangumiClient.getSubject(seedId);
  } catch {
    const work = await repository.getSpotsByBangumiId(seedId).catch(() => null);
    const entry = buildEntry(
      { id: seedId, type: 2, name: work?.titleJa ?? '', name_cn: work?.titleZh?.hant ?? '' },
      '原作',
      work,
      0,
      1
    );
    return buildResult(seedId, [entry], true);
  }

  const { candidates, degraded } = await collectCandidates(seedSubject, {
    bangumiClient,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxSubjects: options.maxSubjects ?? DEFAULT_MAX_SUBJECTS,
  });
  const sorted = [...candidates].sort((a, b) => dateRank(a.subject.date) - dateRank(b.subject.date)
    || a.depth - b.depth || a.subject.id - b.subject.id);
  const entries = await Promise.all(sorted.map(async (candidate, index) => {
    const work = await repository.getSpotsByBangumiId(candidate.subject.id).catch(() => null);
    return buildEntry(candidate.subject, candidate.relation, work, index, sorted.length);
  }));
  return buildResult(seedId, entries, degraded);
}

export function shouldIncludeRelatedSubjectInSeries(
  seed: BangumiV0Subject,
  related: BangumiRelatedSubject
): boolean {
  if (related.type !== 2) return false;
  const relation = normalize(related.relation);
  if (STRONG_SERIES_RELATIONS.has(relation)) return true;
  if (!SAME_WORLD_RELATIONS.has(relation)) return false;
  const keys = [seed.name, seed.name_cn ?? ''].map(compactTitle).filter((value) => value.length >= 5);
  const title = compactTitle(`${related.name} ${related.name_cn ?? ''}`);
  return keys.some((key) => title.includes(key));
}

export function mergePilgrimageSeriesEntries(
  entries: readonly PilgrimageSeriesEntry[],
  selection: PilgrimageSeriesSelection
): { anime: PilgrimageWork | null; points: PilgrimageSpot[] } {
  const available = entries.filter((entry) => entry.anime !== null &&
    (selection === 'all' || entry.subject.id === selection));
  if (available.length === 0) return { anime: null, points: [] };
  const anime = available[0].anime;
  return { anime, points: available.flatMap((entry) => entry.points) };
}

async function collectCandidates(
  seed: BangumiV0Subject,
  options: { bangumiClient: BangumiRelatedClient; maxDepth: number; maxSubjects: number }
): Promise<{ candidates: CandidateSubject[]; degraded: boolean }> {
  const seen = new Map<number, CandidateSubject>();
  const root = { subject: seed, relation: '原作', depth: 0 };
  seen.set(seed.id, root);
  const queue = [root];
  let degraded = false;
  while (queue.length && seen.size < options.maxSubjects) {
    const current = queue.shift();
    if (!current || current.depth >= options.maxDepth) continue;
    let related: BangumiRelatedSubject[];
    try {
      related = await options.bangumiClient.getRelatedSubjects(current.subject.id);
    } catch {
      if (current.subject.id === seed.id) degraded = true;
      continue;
    }
    for (const item of related) {
      if (seen.size >= options.maxSubjects || seen.has(item.id)) continue;
      if (!shouldIncludeRelatedSubjectInSeries(seed, item)) continue;
      const subject: BangumiV0Subject = { ...item };
      const candidate = { subject, relation: item.relation, depth: current.depth + 1 };
      seen.set(item.id, candidate);
      queue.push(candidate);
    }
  }
  return { candidates: [...seen.values()], degraded };
}

function buildEntry(
  subject: BangumiV0Subject,
  relation: string,
  work: PilgrimageWork | null,
  index: number,
  total: number
): PilgrimageSeriesEntry {
  const label = total > 1 ? `S${index + 1}` : 'Main';
  return {
    subject: {
      id: subject.id,
      title: subject.name,
      titleCn: subject.name_cn ?? '',
      relation,
      date: subject.date ?? null,
      platform: subject.platform ?? null,
      label,
    },
    anime: work,
    points: work?.spots ?? [],
  };
}

function buildResult(seedId: number, entries: PilgrimageSeriesEntry[], degraded: boolean) {
  return {
    seedId,
    entries,
    availableEntries: entries.filter((entry) => entry.anime !== null),
    unavailableEntries: entries.filter((entry) => entry.anime === null),
    degraded,
  };
}

function dateRank(date: string | undefined): number {
  if (!date) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function compactTitle(value: string): string {
  return normalize(value).replace(/[^0-9a-z\u3040-\u30ff\u3400-\u9fff]+/g, '');
}

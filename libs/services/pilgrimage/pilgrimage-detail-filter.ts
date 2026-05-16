import { getPilgrimageSpotTitles } from './pilgrimage-localization';
import type { SpotIntentMap } from './spot-intents';
import type { AnitabiPoint, AnitabiSpot } from './types';

export type PilgrimageSpotFilter = 'all' | 'visited' | 'unvisited' | 'photos' | 'saved' | 'planned';

export interface PilgrimageDetailFilterOptions {
  query?: string;
  filter?: PilgrimageSpotFilter;
  visited?: Record<string, boolean | undefined>;
  captures?: Record<string, unknown>;
  intents?: SpotIntentMap;
}

export interface PilgrimageSpotFilterCounts {
  all: number;
  visited: number;
  unvisited: number;
  photos: number;
  saved: number;
  planned: number;
}

interface ParsedSearchQuery {
  raw: string;
  episode: number | null;
}

export function filterPilgrimagePoints(
  points: readonly AnitabiPoint[],
  options: PilgrimageDetailFilterOptions = {}
): AnitabiPoint[] {
  const parsed = parseSearchQuery(options.query);
  return points.filter((point) => {
    if (!pointMatchesSearch(point, parsed)) return false;
    return pointMatchesStatus(point, options);
  });
}

export function filterPilgrimageSpots(
  spots: readonly AnitabiSpot[],
  options: PilgrimageDetailFilterOptions = {}
): AnitabiSpot[] {
  const parsed = parseSearchQuery(options.query);
  return spots.filter((spot) => {
    if (!spotMatchesSearch(spot, parsed)) return false;
    return spotMatchesStatus(spot, options);
  });
}

export function countPilgrimageSpotFilters(
  spots: readonly AnitabiSpot[],
  visited: Record<string, boolean | undefined> = {},
  captures: Record<string, unknown> = {},
  intents: SpotIntentMap = {}
): PilgrimageSpotFilterCounts {
  let visitedCount = 0;
  let photoCount = 0;
  let savedCount = 0;
  let plannedCount = 0;

  for (const spot of spots) {
    if (spot.scenes.some((point) => visited[point.id] === true)) visitedCount += 1;
    if (spot.scenes.some((point) => captures[point.id] != null)) photoCount += 1;
    if (spot.scenes.some((point) => intents[point.id]?.saved === true)) savedCount += 1;
    if (spot.scenes.some((point) => intents[point.id]?.planned === true)) plannedCount += 1;
  }

  return {
    all: spots.length,
    visited: visitedCount,
    unvisited: spots.length - visitedCount,
    photos: photoCount,
    saved: savedCount,
    planned: plannedCount,
  };
}

export function normalizePilgrimageSearchQuery(query: string | undefined): string {
  return normalizeText(query ?? '');
}

export function sortPilgrimageSpotsByIntent(
  spots: readonly AnitabiSpot[],
  intents: SpotIntentMap = {}
): AnitabiSpot[] {
  return spots
    .map((spot, index) => ({
      spot,
      index,
      score: getSpotIntentScore(spot, intents),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ spot }) => spot);
}

function spotMatchesSearch(spot: AnitabiSpot, query: ParsedSearchQuery): boolean {
  if (!query.raw) return true;
  if (spot.scenes.some((point) => pointMatchesSearch(point, query))) return true;

  const fields = [spot.name, spot.cn];
  return fields.some((field) => normalizedIncludes(field, query.raw));
}

function pointMatchesSearch(point: AnitabiPoint, query: ParsedSearchQuery): boolean {
  if (!query.raw) return true;
  if (query.episode !== null) return point.ep === query.episode;

  const titles = getPilgrimageSpotTitles(point);
  const fields = [
    point.name,
    point.cn,
    titles.primary,
    titles.secondary,
    `ep ${point.ep}`,
    `ep${point.ep}`,
    `episode ${point.ep}`,
  ];
  return fields.some((field) => normalizedIncludes(field, query.raw));
}

function pointMatchesStatus(
  point: AnitabiPoint,
  { filter = 'all', visited = {}, captures = {}, intents = {} }: PilgrimageDetailFilterOptions
): boolean {
  switch (filter) {
    case 'visited':
      return visited[point.id] === true;
    case 'unvisited':
      return visited[point.id] !== true;
    case 'photos':
      return captures[point.id] != null;
    case 'saved':
      return intents[point.id]?.saved === true;
    case 'planned':
      return intents[point.id]?.planned === true;
    default:
      return true;
  }
}

function spotMatchesStatus(
  spot: AnitabiSpot,
  { filter = 'all', visited = {}, captures = {}, intents = {} }: PilgrimageDetailFilterOptions
): boolean {
  switch (filter) {
    case 'visited':
      return spot.scenes.some((point) => visited[point.id] === true);
    case 'unvisited':
      return !spot.scenes.some((point) => visited[point.id] === true);
    case 'photos':
      return spot.scenes.some((point) => captures[point.id] != null);
    case 'saved':
      return spot.scenes.some((point) => intents[point.id]?.saved === true);
    case 'planned':
      return spot.scenes.some((point) => intents[point.id]?.planned === true);
    default:
      return true;
  }
}

function getSpotIntentScore(spot: AnitabiSpot, intents: SpotIntentMap): number {
  let score = 0;
  for (const point of spot.scenes) {
    const intent = intents[point.id];
    if (!intent) continue;
    if (intent.saved) score = Math.max(score, 1);
    if (intent.planned) score = Math.max(score, 2);
    if (intent.saved && intent.planned) score = Math.max(score, 3);
  }
  return score;
}

function parseSearchQuery(query: string | undefined): ParsedSearchQuery {
  const raw = normalizeText(query ?? '');
  return {
    raw,
    episode: parseEpisodeQuery(raw),
  };
}

function parseEpisodeQuery(query: string): number | null {
  const compact = query.replace(/\s+/g, '');
  const match = compact.match(/^(?:ep|episode|第)?0*(\d+)(?:話|话|集)?$/);
  if (!match) return null;
  const episode = Number(match[1]);
  return Number.isInteger(episode) && episode >= 0 ? episode : null;
}

function normalizedIncludes(value: string | undefined, query: string): boolean {
  if (!value) return false;
  return normalizeText(value).includes(query);
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

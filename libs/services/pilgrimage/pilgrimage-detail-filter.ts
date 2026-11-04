import type { SpotIntentMap } from './spot-intents';
import type { PilgrimageSpot } from './types';

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

export function filterPilgrimageSpots(
  spots: readonly PilgrimageSpot[],
  options: PilgrimageDetailFilterOptions = {}
): PilgrimageSpot[] {
  const query = normalizePilgrimageSearchQuery(options.query);
  const episode = parseEpisodeQuery(query);
  return spots.filter((spot) => {
    if (query && !matchesQuery(spot, query, episode)) return false;
    return matchesFilter(spot, options);
  });
}

export function countPilgrimageSpotFilters(
  spots: readonly PilgrimageSpot[],
  visited: Record<string, boolean | undefined> = {},
  captures: Record<string, unknown> = {},
  intents: SpotIntentMap = {}
): PilgrimageSpotFilterCounts {
  const visitedCount = spots.filter((spot) => visited[spot.id] === true).length;
  return {
    all: spots.length,
    visited: visitedCount,
    unvisited: spots.length - visitedCount,
    photos: spots.filter((spot) => captures[spot.id] != null).length,
    saved: spots.filter((spot) => intents[spot.id]?.saved === true).length,
    planned: spots.filter((spot) => intents[spot.id]?.planned === true).length,
  };
}

export function normalizePilgrimageSearchQuery(query: string | undefined): string {
  return normalizeText(query ?? '');
}

export function sortPilgrimageSpotsByIntent(
  spots: readonly PilgrimageSpot[],
  intents: SpotIntentMap = {}
): PilgrimageSpot[] {
  return spots
    .map((spot, index) => ({ spot, index, score: getSpotIntentScore(spot, intents) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ spot }) => spot);
}

function matchesQuery(spot: PilgrimageSpot, query: string, episode: number | null): boolean {
  if (episode !== null && spot.scenes.some((scene) => parseEpisodeQuery(normalizeText(scene.episode)) === episode)) {
    return true;
  }
  if (episode !== null) return false;
  return [spot.name, spot.address, spot.note, ...spot.scenes.map((scene) => scene.episode)]
    .filter(Boolean)
    .some((field) => normalizeText(field).includes(query));
}

function matchesFilter(spot: PilgrimageSpot, options: PilgrimageDetailFilterOptions): boolean {
  const { filter = 'all', visited = {}, captures = {}, intents = {} } = options;
  switch (filter) {
    case 'visited': return visited[spot.id] === true;
    case 'unvisited': return visited[spot.id] !== true;
    case 'photos': return captures[spot.id] != null;
    case 'saved': return intents[spot.id]?.saved === true;
    case 'planned': return intents[spot.id]?.planned === true;
    default: return true;
  }
}

function getSpotIntentScore(spot: PilgrimageSpot, intents: SpotIntentMap): number {
  const intent = intents[spot.id];
  if (intent?.saved && intent.planned) return 3;
  if (intent?.planned) return 2;
  if (intent?.saved) return 1;
  return 0;
}

function parseEpisodeQuery(query: string): number | null {
  const match = query.replace(/\s+/g, '').match(/^(?:ep|episode|第)?0*(\d+)(?:話|话|集)?$/);
  if (!match) return null;
  const episode = Number(match[1]);
  return Number.isInteger(episode) ? episode : null;
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

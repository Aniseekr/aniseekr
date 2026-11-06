import { pilgrimageRepository } from '../pilgrimage-repository';
import type { PilgrimageSpot, PilgrimageWork } from '../types';
import { traceMoeClient, type TraceMoeMatch, type TraceMoeSearchInput, type TraceMoeSearchResult } from './trace-moe-client';

export type SceneIdentificationResult =
  | Exclude<TraceMoeSearchResult, { status: 'matched' }>
  | {
      status: 'identified';
      level: 'scene' | 'episode' | 'anime' | 'identified';
      trace: TraceMoeMatch;
      work: PilgrimageWork | null;
      spots: PilgrimageSpot[];
    };

export interface SceneIdDependencies {
  search(input: TraceMoeSearchInput): Promise<TraceMoeSearchResult>;
  resolveWork(trace: TraceMoeMatch): Promise<PilgrimageWork | null>;
}

const DEFAULT_DEPENDENCIES: SceneIdDependencies = {
  search: (input) => traceMoeClient.search(input),
  resolveWork: (trace) => pilgrimageRepository.getSpotsForAnime({
    anilistId: trace.anilistId,
    malId: trace.malId,
    titleJa: trace.titles.native,
    titleEn: trace.titles.english,
    title: trace.titles.romaji,
  }),
};

export class SceneIdService {
  constructor(private readonly dependencies: SceneIdDependencies = DEFAULT_DEPENDENCIES) {}

  async identify(input: TraceMoeSearchInput): Promise<SceneIdentificationResult> {
    const result = await this.dependencies.search(input);
    if (result.status !== 'matched') return result;
    const trace = result.match;
    const work = await this.dependencies.resolveWork(trace);
    const spots = work?.spots.filter((spot) =>
      trace.episode === null || spot.scenes.some((scene) => episodeNumber(scene.episode) === trace.episode)
    ) ?? [];
    const level = spots.length > 0 ? 'scene' : trace.episode !== null ? 'episode' : work ? 'anime' : 'identified';
    return { status: 'identified', level, trace, work, spots };
  }
}

function episodeNumber(value: string): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export const sceneIdService = new SceneIdService();

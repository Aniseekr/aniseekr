import { pilgrimageRepository } from '../pilgrimage-repository';
import type { AnitabiBangumi, AnitabiPoint } from '../types';
import {
  traceMoeClient,
  type TraceMoeMatch,
  type TraceMoeSearchInput,
  type TraceMoeSearchResult,
} from './trace-moe-client';

export const SCENE_MATCH_TOLERANCE_SECONDS = 15;

export interface SceneIdCandidate {
  spot: AnitabiPoint;
  deltaSeconds: number | null;
}

type TraceMoeFailure = Exclude<TraceMoeSearchResult, { status: 'matched' }>;

export type SceneIdentificationResult =
  | TraceMoeFailure
  | {
      status: 'identified';
      level: 'scene' | 'episode' | 'anime' | 'identified';
      trace: TraceMoeMatch;
      bangumiId: number | null;
      anime: AnitabiBangumi | null;
      candidates: SceneIdCandidate[];
    };

export interface KnownAnitabiSceneResult {
  status: 'metadata';
  bangumiId: number;
  spot: AnitabiPoint;
  episode: number;
  at: number;
}

export type AnitabiSceneIdentificationResult = SceneIdentificationResult | KnownAnitabiSceneResult;

export interface SceneIdDependencies {
  search(input: TraceMoeSearchInput): Promise<TraceMoeSearchResult>;
  resolveBangumiId(anilistId: number): Promise<number | null>;
  getAnime(bangumiId: number): Promise<AnitabiBangumi | null>;
  getPoints(bangumiId: number): Promise<AnitabiPoint[]>;
}

interface IdentifyOptions {
  knownBangumiId?: number;
}

interface IdentifyAnitabiSceneInput extends IdentifyOptions {
  image: TraceMoeSearchInput;
  point: AnitabiPoint;
  knownBangumiId: number;
}

const DEFAULT_DEPENDENCIES: SceneIdDependencies = {
  search: (input) => traceMoeClient.search(input),
  resolveBangumiId: (anilistId) =>
    pilgrimageRepository.resolveBangumiId({ sourcePlatform: 'anilist', id: anilistId }),
  getAnime: (bangumiId) => pilgrimageRepository.getSpotsByBangumiId(bangumiId),
  getPoints: (bangumiId) => pilgrimageRepository.getDetailedPointsByBangumiId(bangumiId),
};

export class SceneIdService {
  private readonly dependencies: SceneIdDependencies;

  constructor(dependencies: SceneIdDependencies = DEFAULT_DEPENDENCIES) {
    this.dependencies = dependencies;
  }

  async identify(
    image: TraceMoeSearchInput,
    options: IdentifyOptions = {}
  ): Promise<SceneIdentificationResult> {
    const traceResult = await this.dependencies.search(image);
    if (traceResult.status !== 'matched') return traceResult;

    const mappedBangumiId = await this.dependencies.resolveBangumiId(traceResult.match.anilistId);
    if (
      options.knownBangumiId !== undefined &&
      mappedBangumiId !== null &&
      mappedBangumiId !== options.knownBangumiId
    ) {
      return { status: 'no-match' };
    }

    const bangumiId = options.knownBangumiId ?? mappedBangumiId;
    if (bangumiId === null) {
      return identifiedWithoutPilgrimage(traceResult.match);
    }

    const anime = await this.dependencies.getAnime(bangumiId);
    if (anime === null) {
      return {
        ...identifiedWithoutPilgrimage(traceResult.match),
        bangumiId,
      };
    }

    const points = await this.dependencies.getPoints(bangumiId);
    const episodePoints =
      traceResult.match.episode === null
        ? []
        : points.filter((spot) => spot.ep > 0 && spot.ep === traceResult.match.episode);
    const sceneCandidates = episodePoints
      .filter((spot) => spot.s > 0)
      .map((spot) => ({
        spot,
        deltaSeconds: Math.abs(spot.s - traceResult.match.at),
      }))
      .filter((candidate) => candidate.deltaSeconds <= SCENE_MATCH_TOLERANCE_SECONDS)
      .sort((a, b) => a.deltaSeconds - b.deltaSeconds);

    if (sceneCandidates.length > 0) {
      return {
        status: 'identified',
        level: 'scene',
        trace: traceResult.match,
        bangumiId,
        anime,
        candidates: sceneCandidates,
      };
    }

    if (episodePoints.length > 0) {
      return {
        status: 'identified',
        level: 'episode',
        trace: traceResult.match,
        bangumiId,
        anime,
        candidates: episodePoints.map((spot) => ({
          spot,
          deltaSeconds: spot.s > 0 ? Math.abs(spot.s - traceResult.match.at) : null,
        })),
      };
    }

    return {
      status: 'identified',
      level: 'anime',
      trace: traceResult.match,
      bangumiId,
      anime,
      candidates: [],
    };
  }

  async identifyAnitabiScene(
    input: IdentifyAnitabiSceneInput
  ): Promise<AnitabiSceneIdentificationResult> {
    const metadata = getKnownAnitabiScene(input.knownBangumiId, input.point);
    if (metadata) return metadata;
    return this.identify(input.image, { knownBangumiId: input.knownBangumiId });
  }
}

export function getKnownAnitabiScene(
  bangumiId: number,
  point: AnitabiPoint
): KnownAnitabiSceneResult | null {
  if (point.ep <= 0 || point.s <= 0) return null;
  return {
    status: 'metadata',
    bangumiId,
    spot: point,
    episode: point.ep,
    at: point.s,
  };
}

function identifiedWithoutPilgrimage(
  trace: TraceMoeMatch
): Extract<SceneIdentificationResult, { status: 'identified' }> {
  return {
    status: 'identified',
    level: 'identified',
    trace,
    bangumiId: null,
    anime: null,
    candidates: [],
  };
}

export const sceneIdService = new SceneIdService();

import { describe, expect, it } from 'bun:test';

import {
  SceneIdService,
  type SceneIdDependencies,
} from '../../../libs/services/pilgrimage/scene-id/scene-id-service';
import type {
  TraceMoeMatch,
  TraceMoeSearchInput,
  TraceMoeSearchResult,
} from '../../../libs/services/pilgrimage/scene-id/trace-moe-client';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';

const IMAGE_INPUT: TraceMoeSearchInput = {
  image: new Blob(['scene'], { type: 'image/jpeg' }),
  fileName: 'scene.jpg',
};

function point(id: string, ep: number, s: number): AnitabiPoint {
  return {
    id,
    name: `Spot ${id}`,
    image: `https://img.example/${id}.jpg`,
    ep,
    s,
    geo: [35, 139],
  };
}

function anime(id: number, points: AnitabiPoint[]): AnitabiBangumi {
  return {
    id,
    cn: '測試動畫',
    title: 'Test Anime',
    city: 'Tokyo',
    cover: 'https://img.example/cover.jpg',
    color: '#336699',
    geo: [35, 139],
    zoom: 12,
    modified: 1,
    litePoints: points,
    pointsLength: points.length,
    imagesLength: points.length,
  };
}

function traceMatch(overrides: Partial<TraceMoeMatch> = {}): TraceMoeSearchResult {
  return {
    status: 'matched',
    match: {
      anilistId: 100,
      malId: 200,
      isAdult: false,
      titles: { native: '作品', romaji: 'Work', english: 'Work' },
      synonyms: [],
      episode: 3,
      at: 100,
      similarity: 0.97,
      previewImageUrl: 'https://trace.moe/image',
      previewVideoUrl: 'https://trace.moe/video',
      ...overrides,
    },
  };
}

function dependencies(overrides: Partial<SceneIdDependencies> = {}): SceneIdDependencies {
  const points = [point('near', 3, 94), point('edge', 3, 112), point('far', 3, 140)];
  return {
    search: async () => traceMatch(),
    resolveBangumiId: async () => 42,
    getAnime: async () => anime(42, points),
    getPoints: async () => points,
    ...overrides,
  };
}

describe('SceneIdService', () => {
  it('PILG-031 resolves AniList to Bangumi and sorts timestamp candidates by delta', async () => {
    const resolvedAniListIds: number[] = [];
    const service = new SceneIdService(
      dependencies({
        resolveBangumiId: async (anilistId) => {
          resolvedAniListIds.push(anilistId);
          return 42;
        },
      })
    );

    const result = await service.identify(IMAGE_INPUT);

    expect(resolvedAniListIds).toEqual([100]);
    expect(result.status).toBe('identified');
    if (result.status !== 'identified') throw new Error('Expected identified result');
    expect(result.level).toBe('scene');
    expect(result.bangumiId).toBe(42);
    expect(result.candidates.map(({ spot, deltaSeconds }) => [spot.id, deltaSeconds])).toEqual([
      ['near', 6],
      ['edge', 12],
    ]);
  });

  it('PILG-032 ambiguous episodes cannot produce episode or scene matches', async () => {
    const service = new SceneIdService(
      dependencies({ search: async () => traceMatch({ episode: null }) })
    );

    const result = await service.identify(IMAGE_INPUT);

    expect(result.status).toBe('identified');
    if (result.status !== 'identified') throw new Error('Expected identified result');
    expect(result.level).toBe('anime');
    expect(result.candidates).toEqual([]);
  });

  it('PILG-038 keeps same-episode spots actionable outside the timestamp window', async () => {
    const sameEpisode = [point('first', 3, 20), point('second', 3, 180)];
    const service = new SceneIdService(
      dependencies({
        getAnime: async () => anime(42, sameEpisode),
        getPoints: async () => sameEpisode,
      })
    );

    const result = await service.identify(IMAGE_INPUT);

    expect(result.status).toBe('identified');
    if (result.status !== 'identified') throw new Error('Expected identified result');
    expect(result.level).toBe('episode');
    expect(result.candidates.map(({ spot }) => spot.id)).toEqual(['first', 'second']);
  });

  it('PILG-033 keeps the identified anime actionable without pilgrimage data', async () => {
    const service = new SceneIdService(
      dependencies({
        resolveBangumiId: async () => null,
        getAnime: async () => {
          throw new Error('must not fetch without a Bangumi id');
        },
        getPoints: async () => {
          throw new Error('must not fetch without a Bangumi id');
        },
      })
    );

    const result = await service.identify(IMAGE_INPUT);

    expect(result.status).toBe('identified');
    if (result.status !== 'identified') throw new Error('Expected identified result');
    expect(result.level).toBe('identified');
    expect(result.bangumiId).toBeNull();
    expect(result.anime).toBeNull();
    expect(result.trace.anilistId).toBe(100);
  });

  it('PILG-034 bypasses trace for complete Anitabi metadata and rejects cross-anime fallback', async () => {
    let searchCalls = 0;
    const service = new SceneIdService(
      dependencies({
        search: async () => {
          searchCalls += 1;
          return traceMatch();
        },
        resolveBangumiId: async () => 99,
      })
    );
    const complete = point('known', 7, 321);
    const incomplete = point('missing', 0, 0);

    const direct = await service.identifyAnitabiScene({
      image: IMAGE_INPUT,
      point: complete,
      knownBangumiId: 42,
    });
    const mismatch = await service.identifyAnitabiScene({
      image: IMAGE_INPUT,
      point: incomplete,
      knownBangumiId: 42,
    });

    expect(direct).toEqual({
      status: 'metadata',
      bangumiId: 42,
      spot: complete,
      episode: 7,
      at: 321,
    });
    expect(mismatch).toEqual({ status: 'no-match' });
    expect(searchCalls).toBe(1);
  });
});

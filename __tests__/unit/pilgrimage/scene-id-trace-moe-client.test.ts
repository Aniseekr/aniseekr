import { beforeEach, describe, expect, it } from 'bun:test';

import {
  TraceMoeClient,
  type TraceMoeRateLimiter,
} from '../../../libs/services/pilgrimage/scene-id/trace-moe-client';
import { RateLimiter } from '../../../libs/services/rate-limiter';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function imageInput() {
  return {
    image: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }),
    fileName: 'scene.jpg',
  };
}

describe('TraceMoeClient', () => {
  beforeEach(() => {
    RateLimiter.__resetForTests();
  });

  it('PILG-029 decodes the strongest valid result and rejects similarity below 0.9', async () => {
    const waitedChannels: string[] = [];
    const limiter: TraceMoeRateLimiter = {
      waitForAvailability: async (channel) => {
        waitedChannels.push(channel);
        return 0;
      },
      registerCooldown: () => undefined,
    };
    const responses = [
      jsonResponse({
        frameCount: 120,
        error: '',
        result: [
          {
            anilist: 999,
            filename: 'weaker.mkv',
            episode: 3,
            from: 20,
            to: 22,
            similarity: 0.91,
            video: 'https://trace.moe/video/weak',
            image: 'https://trace.moe/image/weak',
          },
          {
            anilist: {
              id: 16498,
              idMal: 22199,
              isAdult: false,
              synonyms: ['Attack on Titan'],
              title: {
                native: '進撃の巨人',
                romaji: 'Shingeki no Kyojin',
                english: 'Attack on Titan',
              },
            },
            filename: 'best.mkv',
            episode: '4',
            from: 100,
            to: 102,
            similarity: 0.96,
            video: 'https://trace.moe/video/best',
            image: 'https://trace.moe/image/best',
          },
        ],
      }),
      jsonResponse({
        frameCount: 120,
        error: '',
        result: [
          {
            anilist: 16498,
            filename: 'low.mkv',
            episode: 4,
            from: 100,
            to: 102,
            similarity: 0.8999,
            video: 'https://trace.moe/video/low',
            image: 'https://trace.moe/image/low',
          },
        ],
      }),
    ];
    const requestedUrls: string[] = [];
    const client = new TraceMoeClient({
      limiter,
      timeoutMs: 0,
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return responses.shift()!;
      },
    });

    const matched = await client.search(imageInput());
    expect(matched).toEqual({
      status: 'matched',
      match: {
        anilistId: 16498,
        malId: 22199,
        isAdult: false,
        titles: {
          native: '進撃の巨人',
          romaji: 'Shingeki no Kyojin',
          english: 'Attack on Titan',
        },
        synonyms: ['Attack on Titan'],
        episode: 4,
        at: 101,
        similarity: 0.96,
        previewImageUrl: 'https://trace.moe/image/best',
        previewVideoUrl: 'https://trace.moe/video/best',
      },
    });

    const lowSimilarity = await client.search(imageInput());
    expect(lowSimilarity).toEqual({ status: 'no-match' });
    expect(waitedChannels).toEqual(['traceMoe', 'traceMoe']);
    expect(requestedUrls).toEqual([
      'https://api.trace.moe/search?cutBorders&anilistInfo',
      'https://api.trace.moe/search?cutBorders&anilistInfo',
    ]);
  });

  it('PILG-030 serializes searches and maps 402/429 without automatic retry', async () => {
    const limiter = RateLimiter.getInstance();
    let now = 10_000;
    type PendingSleep = { until: number; resolve: () => void };
    let pendingSleep: PendingSleep | null = null;
    limiter.__setTimeFunctions(
      () => now,
      (ms) =>
        new Promise<void>((resolve) => {
          pendingSleep = { until: now + ms, resolve };
        })
    );
    const responses = [
      jsonResponse({ error: 'Search queue or quota exceeded' }, 402),
      jsonResponse({ error: 'Rate limit exceeded' }, 429, { 'Retry-After': '12' }),
    ];
    const fetchTimes: number[] = [];
    let resolveFirstFetch: () => void = () => undefined;
    const client = new TraceMoeClient({
      limiter,
      timeoutMs: 0,
      now: () => now,
      fetchImpl: async () => {
        fetchTimes.push(now);
        if (fetchTimes.length === 1) {
          await new Promise<void>((resolve) => {
            resolveFirstFetch = resolve;
          });
        }
        return responses.shift()!;
      },
    });

    const firstPromise = client.search(imageInput());
    const secondPromise = client.search(imageInput());

    await Bun.sleep(0);
    expect(fetchTimes).toEqual([10_000]);
    expect(pendingSleep).toBeNull();
    resolveFirstFetch();
    expect(await firstPromise).toEqual({ status: 'service-limited' });
    await Promise.resolve();
    await Promise.resolve();
    now += 1_000;
    const sleeper = pendingSleep as PendingSleep | null;
    if (sleeper && sleeper.until <= now) {
      pendingSleep = null;
      sleeper.resolve();
    }

    expect(await secondPromise).toEqual({ status: 'rate-limited', retryAt: 23_000 });
    expect(fetchTimes).toEqual([10_000, 11_000]);
    expect(responses).toHaveLength(0);
    expect(limiter.getNextAvailableAt('traceMoe')).toBe(23_000);
  });
});

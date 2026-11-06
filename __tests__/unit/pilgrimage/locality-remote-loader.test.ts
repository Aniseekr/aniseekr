import { beforeEach, describe, expect, it } from 'bun:test';

import {
  BundledLocalityDataLoader,
  loadBundledLocalitySources,
} from '../../../libs/services/pilgrimage/locality/bundled-loader';
import { RemoteLocalityDataLoader } from '../../../libs/services/pilgrimage/locality/remote-loader';
import { __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';

// Downloaded locality data is untrusted: these pin that it can only ever replace
// the bundle with something newer and valid, and that every failure keeps what
// the user already sees.

const HOUR = 60 * 60 * 1000;
const bundledSources = loadBundledLocalitySources();
const bundledRevision = Number(bundledSources.localIntel.generatedAt);

function payload(overrides: { format?: number; generatedAt?: number; year?: number } = {}) {
  const generatedAt = overrides.generatedAt ?? bundledRevision + HOUR;
  const year = overrides.year ?? bundledSources.animeTourism88.year;
  return JSON.stringify({
    format: overrides.format ?? 1,
    commit: 'test',
    localIntel: {
      ...bundledSources.localIntel,
      generatedAt,
      entries: [
        ...bundledSources.localIntel.entries,
        {
          kind: 'event',
          id: 'remote-only-rally',
          bangumiIds: [1],
          category: 'stamp_rally',
          name: { ja: 'リモート集章' },
          description: { ja: 'テスト' },
          geo: null,
          schedule: { kind: 'fixed', startsAt: '2026-11-01', endsAt: '2026-12-31' },
          stampSpots: [],
          sourceUrl: 'https://example.com/rally',
          verifiedAt: '2026-11-05',
        },
      ],
      count: bundledSources.localIntel.entries.length + 1,
    },
    animeTourism88: {
      ...bundledSources.animeTourism88,
      year,
      entries: bundledSources.animeTourism88.entries.map((e) => ({ ...e, year })),
    },
  });
}

function loader(respond: () => Promise<Response>, now = () => 1_000 * HOUR) {
  let calls = 0;
  const instance = new RemoteLocalityDataLoader(
    new BundledLocalityDataLoader(),
    () => {
      calls += 1;
      return respond();
    },
    now
  );
  return { instance, calls: () => calls };
}

const ok = (body: string) => () => Promise.resolve(new Response(body, { status: 200 }));

describe('RemoteLocalityDataLoader', () => {
  beforeEach(() => __resetAppStorageForTests());

  it('swaps in a newer valid payload, and the 88 rows follow its edition', async () => {
    const { instance } = loader(ok(payload({ year: 2026 })));
    const next = await instance.loadLatest();
    expect(next.entities.events['remote-only-rally' as never]).toBeDefined();
    expect(instance.currentAnimeTourism88().year).toBe(2026);
  });

  it('serves the downloaded copy synchronously on the next launch', async () => {
    await loader(ok(payload())).instance.loadLatest();
    const relaunch = loader(() => Promise.reject(new Error('offline'))).instance;
    expect(relaunch.loadInitial().entities.events['remote-only-rally' as never]).toBeDefined();
  });

  it('ignores a cached copy that is not newer than the bundle', async () => {
    const bundledEnvelope = new BundledLocalityDataLoader().loadInitial();
    await loader(ok(payload({ generatedAt: bundledRevision }))).instance.loadLatest();
    const relaunch = loader(ok('')).instance;
    expect(relaunch.loadInitial().generatedAt).toBe(bundledEnvelope.generatedAt);
    expect(relaunch.loadInitial().entities.events['remote-only-rally' as never]).toBeUndefined();
  });

  it.each([
    ['network error', () => Promise.reject(new Error('offline'))],
    ['HTTP 503', () => Promise.resolve(new Response('', { status: 503 }))],
    ['non-JSON body', ok('<html>')],
    ['unknown format', ok(payload({ format: 2 }))],
    ['payload the validator rejects', ok(JSON.stringify({ format: 1, localIntel: {}, animeTourism88: {} }))],
  ])('keeps the bundle on %s', async (_label, respond) => {
    const { instance } = loader(respond as () => Promise<Response>);
    const before = instance.loadInitial();
    expect(await instance.loadLatest()).toBe(before);
    expect(instance.currentAnimeTourism88().year).toBe(bundledSources.animeTourism88.year);
  });

  it('downloads at most once per freshness window', async () => {
    let now = 1_000 * HOUR;
    const { instance, calls } = loader(ok(payload()), () => now);
    await instance.loadLatest();
    now += HOUR;
    await instance.loadLatest();
    expect(calls()).toBe(1);
    now += 6 * HOUR;
    await instance.loadLatest();
    expect(calls()).toBe(2);
  });
});

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import {
  SPOT_INTENTS_STORAGE_KEY,
  SPOT_INTENTS_STORAGE_KEY_V2,
} from '../../../libs/services/storage/keys';

import {
  applySpotIntent,
  applySpotIntentAtomic,
  buildSpotIntentMeta,
  loadSpotIntents,
  loadSpotIntentsSync,
  saveSpotIntents,
  toggleSpotIntent,
  type SpotIntentMeta,
} from '../../../libs/services/pilgrimage/spot-intents';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';

beforeEach(() => {
  appStorage.clearAll();
  __resetAppStorageForTests();
});

describe('pilgrimage spot intents', () => {
  it('persists only saved and planned flags', async () => {
    await saveSpotIntents({
      a: { saved: true, planned: true },
      b: { saved: false as unknown as true, planned: true },
    });

    expect(await loadSpotIntents()).toEqual({
      a: { saved: true, planned: true },
      b: { planned: true },
    });
  });

  it('exposes the latest save through the synchronous read', async () => {
    expect(loadSpotIntentsSync()).toEqual({});
    await saveSpotIntents({ a: { saved: true } });
    expect(loadSpotIntentsSync()).toEqual({ a: { saved: true } });
  });

  it('toggles one flag without removing the other flag', async () => {
    await saveSpotIntents({ a: { saved: true } });

    expect(toggleSpotIntent(await loadSpotIntents(), 'a', 'planned')).toEqual({
      a: { saved: true, planned: true },
    });
    expect(toggleSpotIntent({ a: { saved: true, planned: true } }, 'a', 'planned')).toEqual({
      a: { saved: true },
    });
    expect(toggleSpotIntent({ a: { saved: true } }, 'a', 'saved')).toEqual({});
  });
});

const META_A: SpotIntentMeta = {
  animeId: 115908,
  name: '響け！ユーフォニアム',
  cn: '吹响！上低音号',
  geo: [34.9, 135.8],
  image: 'https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160',
};

describe('spot intents v2 meta snapshot', () => {
  it('applySpotIntent add attaches meta; remove keeps meta while the other flag remains', () => {
    const added = applySpotIntent({}, 'pt1', 'planned', 'add', META_A);
    expect(added).toEqual({ pt1: { planned: true, meta: META_A } });

    const bothFlags = applySpotIntent(added, 'pt1', 'saved', 'add', META_A);
    expect(bothFlags).toEqual({ pt1: { planned: true, saved: true, meta: META_A } });

    const oneRemoved = applySpotIntent(bothFlags, 'pt1', 'planned', 'remove');
    expect(oneRemoved).toEqual({ pt1: { saved: true, meta: META_A } });

    const allGone = applySpotIntent(oneRemoved, 'pt1', 'saved', 'remove');
    expect(allGone).toEqual({});
  });

  it('persists and reloads meta through v2 storage', async () => {
    await saveSpotIntents({ pt1: { planned: true, meta: META_A } });
    expect(loadSpotIntentsSync()).toEqual({ pt1: { planned: true, meta: META_A } });
    expect(await loadSpotIntents()).toEqual({ pt1: { planned: true, meta: META_A } });
  });

  it('sanitizes malformed meta away but keeps the flags', async () => {
    await saveSpotIntents({
      pt1: { planned: true, meta: { animeId: 'x', name: 5, geo: [1], image: '' } as unknown as SpotIntentMeta },
    });
    expect(loadSpotIntentsSync()).toEqual({ pt1: { planned: true } });
  });

  it('migrates a v1 payload (flags preserved, meta undefined) when v2 is absent', () => {
    appStorage.set(SPOT_INTENTS_STORAGE_KEY, JSON.stringify({ old1: { saved: true, planned: true } }));
    expect(loadSpotIntentsSync()).toEqual({ old1: { saved: true, planned: true } });
  });

  it('a corrupted v2 blob falls through to valid v1 data instead of masking it with {}', () => {
    appStorage.set(SPOT_INTENTS_STORAGE_KEY_V2, '{not valid json');
    appStorage.set(SPOT_INTENTS_STORAGE_KEY, JSON.stringify({ old1: { saved: true } }));
    expect(loadSpotIntentsSync()).toEqual({ old1: { saved: true } });
  });
});

describe('applySpotIntentAtomic (atomic per-spot toggle)', () => {
  it('adds a flag for one spot and persists it', () => {
    const result = applySpotIntentAtomic('pt1', 'saved', 'add', META_A);
    expect(result).toEqual({ pt1: { saved: true, meta: META_A } });
    expect(loadSpotIntentsSync()).toEqual({ pt1: { saved: true, meta: META_A } });
  });

  it('removes a flag for one spot and persists it', () => {
    applySpotIntentAtomic('pt1', 'saved', 'add', META_A);
    const result = applySpotIntentAtomic('pt1', 'saved', 'remove');
    expect(result).toEqual({});
    expect(loadSpotIntentsSync()).toEqual({});
  });

  it('never clobbers a DIFFERENT spot toggled through a stale in-memory snapshot', () => {
    // Simulate a caller (e.g. a hook) holding an old React-state snapshot of
    // the map, taken BEFORE another surface persisted a change for a
    // different spot.
    const staleSnapshot = applySpotIntentAtomic('pt-a', 'saved', 'add', META_A);
    expect(staleSnapshot).toEqual({ 'pt-a': { saved: true, meta: META_A } });

    // Another surface (e.g. the map's own grouped toggle) persists a change
    // for a DIFFERENT spot — this must land on disk even though the caller
    // above is still holding the pre-write snapshot.
    applySpotIntentAtomic('pt-b', 'planned', 'add', META_A);

    // The caller now toggles a third flag on the ORIGINAL spot; even if it
    // were driven from the stale `staleSnapshot` closure, `applySpotIntentAtomic`
    // must read fresh storage rather than trusting it, so pt-b survives.
    applySpotIntentAtomic('pt-a', 'planned', 'add', META_A);

    expect(loadSpotIntentsSync()).toEqual({
      'pt-a': { saved: true, planned: true, meta: META_A },
      'pt-b': { planned: true, meta: META_A },
    });
  });
});

// Screen-level anime the route is currently showing. Used as the fallback
// meta for points that carry no per-point source annotation.
const SCREEN_FALLBACK = { animeId: 999, name: 'Screen Anime', cn: 'Screen 動畫' };

function makePoint(overrides: Partial<AnitabiPoint> = {}): AnitabiPoint {
  return {
    id: 'pt-a',
    name: 'Scene A',
    image: 'https://image.anitabi.cn/points/pt-a.jpg?plan=h160',
    ep: 1,
    s: 0,
    geo: [34.9, 135.8],
    ...overrides,
  };
}

describe('buildSpotIntentMeta', () => {
  it('two points in the same group with distinct geo/image produce distinct metas', () => {
    const p1 = makePoint({ id: 'pt-1', geo: [34.9, 135.8], image: 'https://img/1.jpg' });
    const p2 = makePoint({ id: 'pt-2', geo: [35.0, 135.9], image: 'https://img/2.jpg' });

    const meta1 = buildSpotIntentMeta(p1, SCREEN_FALLBACK);
    const meta2 = buildSpotIntentMeta(p2, SCREEN_FALLBACK);

    expect(meta1.geo).toEqual([34.9, 135.8]);
    expect(meta1.image).toBe('https://img/1.jpg');
    expect(meta2.geo).toEqual([35.0, 135.9]);
    expect(meta2.image).toBe('https://img/2.jpg');
    expect(meta1).not.toEqual(meta2);
  });

  it('a point WITH sourceBangumiId/sourceAnimeTitle uses the source values, not the fallback', () => {
    const sourcedPoint = {
      ...makePoint({ id: 'pt-source', geo: [35.6, 139.7], image: 'https://img/source.jpg' }),
      sourceBangumiId: 12345,
      sourceAnimeTitle: 'Source Season 2',
      sourceLabel: 'S2',
    } as AnitabiPoint;

    const meta = buildSpotIntentMeta(sourcedPoint, SCREEN_FALLBACK);

    expect(meta.animeId).toBe(12345);
    expect(meta.name).toBe('Source Season 2');
    expect(meta.geo).toEqual([35.6, 139.7]);
    expect(meta.image).toBe('https://img/source.jpg');
    // `PilgrimageSeriesPoint` doesn't carry a per-source `cn`, and the
    // fallback's `cn` describes a DIFFERENT anime — omit rather than
    // fabricate one (Rule 8).
    expect(meta.cn).toBeUndefined();
  });

  it('a point WITHOUT source annotations falls back to the screen-level meta', () => {
    const plainPoint = makePoint({ id: 'pt-plain', geo: [1, 2], image: 'https://img/plain.jpg' });

    const meta = buildSpotIntentMeta(plainPoint, SCREEN_FALLBACK);

    expect(meta.animeId).toBe(SCREEN_FALLBACK.animeId);
    expect(meta.name).toBe(SCREEN_FALLBACK.name);
    expect(meta.cn).toBe(SCREEN_FALLBACK.cn);
    expect(meta.geo).toEqual([1, 2]);
    expect(meta.image).toBe('https://img/plain.jpg');
  });

  it('omits cn when the fallback has none (never fabricated)', () => {
    const plainPoint = makePoint({ id: 'pt-no-cn' });
    const meta = buildSpotIntentMeta(plainPoint, { animeId: 1, name: 'No Cn Anime' });
    expect(meta.cn).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import { SPOT_INTENTS_STORAGE_KEY } from '../../../libs/services/storage/keys';

import {
  applySpotIntent,
  loadSpotIntents,
  loadSpotIntentsSync,
  saveSpotIntents,
  toggleSpotIntent,
  type SpotIntentMeta,
} from '../../../libs/services/pilgrimage/spot-intents';

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
});

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';

import {
  loadSpotIntents,
  loadSpotIntentsSync,
  saveSpotIntents,
  toggleSpotIntent,
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

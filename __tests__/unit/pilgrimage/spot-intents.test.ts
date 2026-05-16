import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'bun:test';

import {
  SPOT_INTENTS_STORAGE_KEY,
  loadSpotIntents,
  saveSpotIntents,
  toggleSpotIntent,
} from '../../../libs/services/pilgrimage/spot-intents';

beforeEach(async () => {
  await AsyncStorage.removeItem?.(SPOT_INTENTS_STORAGE_KEY);
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

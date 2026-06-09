import { beforeEach, describe, expect, it } from 'bun:test';

import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import {
  DEFAULT_PILGRIMAGE_MAP_VIEW_MODE,
  loadPilgrimageMapViewModeSync,
  setPilgrimageMapViewMode,
  subscribePilgrimageMapViewMode,
} from '../../../libs/services/pilgrimage/map-view-mode-prefs';

beforeEach(() => {
  appStorage.clearAll();
  __resetAppStorageForTests();
});

describe('pilgrimage map view mode prefs', () => {
  it('defaults to my location for on-site pilgrimage use', () => {
    expect(DEFAULT_PILGRIMAGE_MAP_VIEW_MODE).toBe('myLocation');
    expect(loadPilgrimageMapViewModeSync()).toBe('myLocation');
  });

  it('persists the latest selected mode synchronously', async () => {
    await setPilgrimageMapViewMode('anime');
    expect(loadPilgrimageMapViewModeSync()).toBe('anime');

    await setPilgrimageMapViewMode('myLocation');
    expect(loadPilgrimageMapViewModeSync()).toBe('myLocation');
  });

  it('ignores stale persisted values', () => {
    appStorage.set('aniseekr.pilgrimage.mapViewMode.v1', 'nearby');
    expect(loadPilgrimageMapViewModeSync()).toBe('myLocation');
  });

  it('notifies subscribers on change', async () => {
    const received: string[] = [];
    const unsub = subscribePilgrimageMapViewMode((next) => received.push(next));

    await setPilgrimageMapViewMode('anime');
    unsub();
    await setPilgrimageMapViewMode('myLocation');

    expect(received).toEqual(['anime']);
  });
});

import { describe, expect, it } from 'bun:test';

import { shouldRefreshPilgrimageCollectionOnFocus } from '../../../libs/services/pilgrimage/pilgrimage-hub-collection-state';

describe('pilgrimage hub collection state', () => {
  it('refreshes on first focus only when a snapshot skipped the mount collection fetch', () => {
    expect(
      shouldRefreshPilgrimageCollectionOnFocus({
        hasInitialCollection: true,
        hasSeenFocus: false,
      })
    ).toBe(true);
    expect(
      shouldRefreshPilgrimageCollectionOnFocus({
        hasInitialCollection: false,
        hasSeenFocus: false,
      })
    ).toBe(false);
    expect(
      shouldRefreshPilgrimageCollectionOnFocus({
        hasInitialCollection: false,
        hasSeenFocus: true,
      })
    ).toBe(true);
  });
});

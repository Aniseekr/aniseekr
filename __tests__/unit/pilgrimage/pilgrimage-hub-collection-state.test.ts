import { describe, expect, it } from 'bun:test';

import {
  applyPilgrimageCollectionEntries,
  shouldRefreshPilgrimageCollectionOnFocus,
} from '../../../libs/services/pilgrimage/pilgrimage-hub-collection-state';
import type { CollectionPilgrimageEntry } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

function anime(id: number, pointsLength: number, title = `Anime ${id}`): AnitabiBangumi {
  return {
    id,
    title,
    cn: '',
    city: '',
    cover: '',
    color: '#FF9F0A',
    geo: [35, 139],
    zoom: 12,
    modified: 1,
    litePoints: [],
    pointsLength,
    imagesLength: 1,
  };
}

function entry(item: AnitabiBangumi): CollectionPilgrimageEntry {
  return {
    anime: item,
    collectionAnimeId: String(item.id),
    bangumiId: item.id,
    isFavorite: false,
  };
}

describe('pilgrimage hub collection state', () => {
  it('uses the latest collection ids while keeping previously known anime available', () => {
    const previouslyKnown = [anime(10, 5), anime(20, 8, 'Old title')];
    const latestEntries = [
      entry(anime(20, 8, 'Fresh title')),
      entry(anime(30, 12)),
      entry(anime(30, 12, 'Duplicate ignored')),
    ];

    const refresh = applyPilgrimageCollectionEntries(previouslyKnown, latestEntries);

    expect([...refresh.collectionIds].sort((a, b) => a - b)).toEqual([20, 30]);
    expect(refresh.collectionAnimes.map((item) => item.id)).toEqual([30, 20]);
    expect(refresh.mergedAnimes.map((item) => item.id)).toEqual([30, 20, 10]);
    expect(refresh.mergedAnimes.find((item) => item.id === 20)?.title).toBe('Fresh title');
  });

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

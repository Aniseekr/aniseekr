import { describe, it, expect } from 'bun:test';

import {
  importLegacyAniseekerExport,
  isLegacyAniseekerExport,
  type LegacyAniseekerExport,
  type LegacyRatingMigrationData,
} from '../../../libs/services/backup/legacy-aniseeker';
import { BackupService } from '../../../libs/services/backup/backup-service';

import { makeFakeDb, makeFakeStorage } from './fakes';

describe('backup/legacy-aniseeker', () => {
  it('BACKUP-200 maps a bare RatingMigrationData[] export to v1 envelope.user_anime', () => {
    const legacy: LegacyAniseekerExport = {
      version: 'v1-v2-migration',
      ratings: [
        // Tracking → watching, score null, progress 5.
        {
          animeId: 100,
          title: 'Cowboy Bebop',
          imageUrl: 'bebop.jpg',
          ratingType: 'tracking',
          watchedEpisodes: 5,
          totalEpisodes: 26,
          syncSource: 'mal',
          createdAt: '2025-01-01T00:00:00Z',
        },
        // Liked + finished → completed, score 10, also a favorite/like.
        {
          animeId: 101,
          title: 'Frieren',
          imageUrl: 'frieren.jpg',
          ratingType: 'liked',
          watchedEpisodes: 28,
          totalEpisodes: 28,
          syncSource: 'anilist',
          createdAt: '2025-02-01T00:00:00Z',
        },
        // Neutral, mid-watch → watching, score 5, no favorites/ratings entry.
        {
          animeId: 102,
          title: 'Generic',
          imageUrl: null,
          ratingType: 'neutral',
          watchedEpisodes: 3,
          totalEpisodes: null,
          syncSource: null,
          createdAt: '2025-03-01T00:00:00Z',
        },
        // Disliked, unwatched → planned, score 1, ratings('pass'), no favorite.
        {
          animeId: 103,
          title: 'NotForMe',
          imageUrl: 'x.jpg',
          ratingType: 'dislike',
          watchedEpisodes: 0,
          totalEpisodes: null,
          syncSource: null,
          createdAt: '2025-04-01T00:00:00Z',
        },
      ],
    };

    const env = importLegacyAniseekerExport(legacy);

    expect(env.version).toBe(1);
    expect(env.legacy?.sourceApp).toBe('aniseeker-swiftui');
    expect(env.db.userAnime).toHaveLength(4);

    const bebop = env.db.userAnime.find((r) => r.anime_id === '100');
    expect(bebop?.status).toBe('watching');
    expect(bebop?.score).toBeNull();
    expect(bebop?.progress).toBe(5);
    expect(bebop?.total_episodes).toBe(26);

    const frieren = env.db.userAnime.find((r) => r.anime_id === '101');
    expect(frieren?.status).toBe('completed');
    expect(frieren?.score).toBe(10);
    expect(frieren?.progress).toBe(28);
    expect(frieren?.completed_at).not.toBeNull();

    const neutral = env.db.userAnime.find((r) => r.anime_id === '102');
    expect(neutral?.status).toBe('watching');
    expect(neutral?.score).toBe(5);

    const dislike = env.db.userAnime.find((r) => r.anime_id === '103');
    expect(dislike?.status).toBe('planned');
    expect(dislike?.score).toBe(1);
  });

  it('BACKUP-201 derives favorites + ratings from likes/dislikes', () => {
    const env = importLegacyAniseekerExport({
      version: 'v1-v2-migration',
      ratings: [
        {
          animeId: 200,
          title: 'A',
          imageUrl: 'a.jpg',
          ratingType: 'liked',
          watchedEpisodes: 12,
          totalEpisodes: 12,
          syncSource: null,
          createdAt: '2025-05-01T00:00:00Z',
        },
        {
          animeId: 201,
          title: 'B',
          imageUrl: 'b.jpg',
          ratingType: 'dislike',
          watchedEpisodes: 0,
          totalEpisodes: null,
          syncSource: null,
          createdAt: '2025-05-02T00:00:00Z',
        },
        {
          animeId: 202,
          title: 'C',
          imageUrl: null,
          ratingType: 'neutral',
          watchedEpisodes: 0,
          totalEpisodes: null,
          syncSource: null,
          createdAt: '2025-05-03T00:00:00Z',
        },
      ],
    });

    const favs = env.db.favorites.map((f) => f.id).sort();
    expect(favs).toEqual(['200']);

    const ratings = env.db.ratings;
    const ratingMap = new Map(ratings.map((r) => [r.id, r.rating]));
    expect(ratingMap.get('200')).toBe('like');
    expect(ratingMap.get('201')).toBe('pass');
    expect(ratingMap.has('202')).toBe(false);
  });

  it('BACKUP-202 explicit V2-style export (folders + tracking/watched/wishlist) round-trips', () => {
    const legacy: LegacyAniseekerExport = {
      version: 'v2-snapshot',
      exportedAt: '2025-12-09T10:00:00Z',
      userRatings: [
        {
          animeId: 300,
          title: 'X',
          imageUrl: 'x.jpg',
          ratingType: 'liked',
          myScore: 9,
          createdAt: '2025-06-01T00:00:00Z',
        },
      ],
      trackingItems: [
        {
          animeId: 301,
          title: 'Y',
          imageUrl: null,
          currentEpisode: 7,
          totalEpisodes: 24,
          trackingStatus: 'active',
        },
      ],
      watchedItems: [
        {
          animeId: 302,
          title: 'Z',
          imageUrl: null,
          watchedEpisodes: 12,
          totalEpisodes: 12,
          isCompleted: true,
          completedDate: '2025-07-15T00:00:00Z',
        },
      ],
      wishlistItems: [
        { animeId: 303, title: 'W', imageUrl: null, addedDate: '2025-08-01T00:00:00Z' },
      ],
      folders: [
        {
          id: 'C39DBEA1-7C9F-4FA6-9D5C-2B0E1A6A5E10',
          name: 'My Custom',
          icon: 'star',
          isSystemFolder: false,
          folderType: 'custom',
          createdAt: '2025-05-01T00:00:00Z',
          itemAnimeIds: [300, 301, 302],
        },
      ],
    };

    const env = importLegacyAniseekerExport(legacy);

    const statusFor = (id: string) =>
      env.db.userAnime.find((r) => r.anime_id === id)?.status;
    expect(statusFor('300')).toBe('completed'); // myScore present + later seen via watchedItems? No — score-only mapped as planned but rating wins
    expect(statusFor('301')).toBe('watching');
    expect(statusFor('302')).toBe('completed');
    expect(statusFor('303')).toBe('planned');

    expect(env.db.collectionFolders).toHaveLength(1);
    expect(env.db.collectionFolders[0]?.name).toBe('My Custom');
    expect(env.db.collectionFolders[0]?.type).toBe('custom');

    const items = env.db.collectionFolderItems.map((i) => i.anime_id).sort();
    expect(items).toEqual(['300', '301', '302']);
  });

  it('BACKUP-203 isLegacyAniseekerExport accepts both formats and rejects current envelopes', () => {
    expect(isLegacyAniseekerExport({ ratings: [] })).toBe(true);
    expect(
      isLegacyAniseekerExport({
        userRatings: [],
        trackingItems: [],
      })
    ).toBe(true);
    expect(isLegacyAniseekerExport({ version: 1, app: 'aniseekr-expo' })).toBe(false);
    expect(isLegacyAniseekerExport(null)).toBe(false);
    expect(isLegacyAniseekerExport('string')).toBe(false);
  });

  it('BACKUP-204 also accepts a raw RatingMigrationData[] (no wrapper)', () => {
    const bareArray: LegacyRatingMigrationData[] = [
      {
        animeId: 999,
        title: 'Bare',
        imageUrl: null,
        ratingType: 'tracking',
        watchedEpisodes: 1,
        totalEpisodes: null,
        syncSource: null,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ];
    const env = importLegacyAniseekerExport(bareArray);
    expect(env.db.userAnime).toHaveLength(1);
    expect(env.db.userAnime[0]?.anime_id).toBe('999');
    expect(env.db.userAnime[0]?.status).toBe('watching');
  });

  it('BACKUP-205 end-to-end: importLegacy → BackupService.restoreSnapshot persists rows', async () => {
    const env = importLegacyAniseekerExport({
      version: 'v1-v2-migration',
      ratings: [
        {
          animeId: 400,
          title: 'E2E',
          imageUrl: 'e2e.jpg',
          ratingType: 'liked',
          watchedEpisodes: 4,
          totalEpisodes: 12,
          syncSource: 'mal',
          createdAt: '2025-09-01T00:00:00Z',
        },
      ],
    });

    const db = makeFakeDb();
    const storage = makeFakeStorage();
    const svc = new BackupService({
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    });

    const summary = await svc.restoreSnapshot(env);
    expect(summary.userAnime).toBe(1);
    expect(db.tables.user_anime.get('400')?.status).toBe('watching');
    expect(db.tables.user_anime.get('400')?.score).toBe(10);
    expect(db.tables.favorites.get('400')?.title).toBe('E2E');
    expect(db.tables.ratings.get('400')?.rating).toBe('like');
  });
});

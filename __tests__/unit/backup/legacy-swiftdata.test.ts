import { describe, expect, it } from 'bun:test';

import {
  countLegacySwiftDataSnapshot,
  hasLegacyContent,
  swiftDataSnapshotToEnvelope,
  type LegacySwiftDataSnapshot,
} from '../../../libs/services/backup/legacy-swiftdata';

// 2001-01-01T00:00:00Z in seconds since the 1970 Unix epoch — the Swift
// reference-date anchor. Core Data stores Date as REAL using this anchor.
const SWIFT_REF_EPOCH_SECONDS = 978307200;

// Mirror Swift's default JSONEncoder Date representation: seconds since
// 2001-01-01T00:00:00Z. The old app stores this JSON blob in UserDefaults
// under `migration_v1_v2_data`; it does not export images or photo assets.
function swiftDate(unixMs: number): number {
  return unixMs / 1000 - SWIFT_REF_EPOCH_SECONDS;
}

const FOLDER_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function fixtureMigrationSnapshot(): LegacySwiftDataSnapshot {
  const createdAtMs = Date.UTC(2025, 5, 15, 12, 0, 0);
  return {
    hasStore: true,
    alreadyImported: false,
    storePath: 'UserDefaults:migration_v1_v2_data',
    ratings: [
      {
        animeId: 21,
        title: 'Cowboy Bebop',
        imageUrl: 'https://img/cb.jpg',
        ratingType: 'liked',
        watchedEpisodes: 26,
        totalEpisodes: 26,
        syncSource: 'mal',
        createdAt: swiftDate(createdAtMs),
      },
      {
        animeId: 47,
        title: 'Bleach: TYBW',
        ratingType: 'tracking',
        watchedEpisodes: 5,
        totalEpisodes: 13,
        createdAt: swiftDate(createdAtMs),
      },
    ],
  };
}

function fixtureV2Snapshot(): LegacySwiftDataSnapshot {
  // Specific timestamps so we can assert the Swift epoch math precisely.
  const completedAtMs = Date.UTC(2025, 5, 15, 12, 0, 0); // 2025-06-15T12:00:00Z
  const addedAtMs = Date.UTC(2025, 7, 1, 0, 0, 0); // 2025-08-01T00:00:00Z

  return {
    hasStore: true,
    alreadyImported: false,
    storePath: 'legacy-v2-fallback',
    userRatings: [
      {
        animeId: 21,
        title: 'Cowboy Bebop',
        imageUrl: 'https://img/cb.jpg',
        ratingType: 'liked',
        myScore: 9.5,
        createdAt: swiftDate(completedAtMs),
      },
    ],
    trackingItems: [
      {
        animeId: 47,
        title: 'Bleach: TYBW',
        imageUrl: null,
        currentEpisode: 5,
        totalEpisodes: 13,
        trackingStatus: 'active',
      },
    ],
    watchedItems: [
      {
        animeId: 100,
        title: 'Steins;Gate',
        imageUrl: null,
        watchedEpisodes: 24,
        totalEpisodes: 24,
        isCompleted: true,
        completedDate: swiftDate(completedAtMs),
      },
    ],
    wishlistItems: [
      {
        animeId: 200,
        title: 'Vinland Saga',
        imageUrl: null,
        priority: 2,
        addedDate: swiftDate(addedAtMs),
      },
    ],
    folders: [
      {
        id: FOLDER_UUID,
        name: 'Favorites 2025',
        icon: 'star',
        folderType: 'custom',
        isShared: false,
        isR18: false,
        createdAt: swiftDate(addedAtMs),
        itemAnimeIds: [21, 100],
      },
    ],
  };
}

describe('backup/legacy-swiftdata', () => {
  it('LEGACY-SD-001 hasLegacyContent / counts treat hasStore=false as empty', () => {
    expect(hasLegacyContent(null)).toBe(false);
    expect(hasLegacyContent({ hasStore: false, alreadyImported: false })).toBe(false);
    expect(
      countLegacySwiftDataSnapshot({ hasStore: false, alreadyImported: false }).total
    ).toBe(0);
  });

  it('LEGACY-SD-002 hasLegacyContent counts the old migration_v1_v2_data ratings blob', () => {
    const snap = fixtureMigrationSnapshot();
    expect(hasLegacyContent(snap)).toBe(true);
    const counts = countLegacySwiftDataSnapshot(snap);
    expect(counts).toEqual({
      ratingMigrationItems: 2,
      userRatings: 0,
      trackingItems: 0,
      watchedItems: 0,
      wishlistItems: 0,
      folders: 0,
      total: 2,
    });
  });

  it('LEGACY-SD-003 converts the migration_v1_v2_data blob into the current envelope', () => {
    const env = swiftDataSnapshotToEnvelope(fixtureMigrationSnapshot());
    expect(env.version).toBe(1);
    expect(env.app).toBe('aniseekr-expo');
    expect(env.legacy?.sourceApp).toBe('aniseeker-swiftui');

    const bebop = env.db.userAnime.find((r) => r.anime_id === '21');
    expect(bebop?.status).toBe('completed');
    expect(bebop?.score).toBe(10);
    expect(bebop?.progress).toBe(26);
    expect(bebop?.completed_at).toBe(Date.UTC(2025, 5, 15, 12, 0, 0));

    const bleach = env.db.userAnime.find((r) => r.anime_id === '47');
    expect(bleach?.status).toBe('watching');
    expect(bleach?.progress).toBe(5);
    expect(bleach?.total_episodes).toBe(13);
  });

  it('LEGACY-SD-004 keeps V2 direct snapshots as a defensive fallback', () => {
    const snap = fixtureV2Snapshot();
    expect(hasLegacyContent(snap)).toBe(true);
    const counts = countLegacySwiftDataSnapshot(snap);
    expect(counts).toEqual({
      ratingMigrationItems: 0,
      userRatings: 1,
      trackingItems: 1,
      watchedItems: 1,
      wishlistItems: 1,
      folders: 1,
      total: 5,
    });
  });

  it('LEGACY-SD-005 swiftDataSnapshotToEnvelope produces a v1 envelope with the legacy source tag', () => {
    const env = swiftDataSnapshotToEnvelope(fixtureV2Snapshot());
    expect(env.version).toBe(1);
    expect(env.app).toBe('aniseekr-expo');
    expect(env.legacy?.sourceApp).toBe('aniseeker-swiftui');
  });

  it('LEGACY-SD-006 merges userRating + watchedItem + wishlist for the same anime', () => {
    // The "completed > watching > planned" priority in legacy-aniseeker.ts's
    // merger should win — Cowboy Bebop has both a rating (planned/completed
    // based on score) and the wishlist row shouldn't bump it back down.
    const env = swiftDataSnapshotToEnvelope(fixtureV2Snapshot());
    const bebop = env.db.userAnime.find((r) => r.anime_id === '21');
    expect(bebop).toBeDefined();
    expect(bebop?.status).toBe('completed');
    expect(bebop?.score).toBe(9.5);
  });

  it('LEGACY-SD-007 reference-date dates are converted to ms-epoch in the envelope', () => {
    const env = swiftDataSnapshotToEnvelope(fixtureV2Snapshot());
    const steins = env.db.userAnime.find((r) => r.anime_id === '100');
    expect(steins?.status).toBe('completed');
    expect(steins?.completed_at).toBe(Date.UTC(2025, 5, 15, 12, 0, 0));
  });

  it('LEGACY-SD-008 folders and folder items are flattened into the envelope', () => {
    const env = swiftDataSnapshotToEnvelope(fixtureV2Snapshot());
    expect(env.db.collectionFolders).toEqual([
      {
        id: FOLDER_UUID,
        name: 'Favorites 2025',
        icon: 'star',
        type: 'custom',
        is_shared: 0,
        is_r18: 0,
        created_at: Date.UTC(2025, 7, 1, 0, 0, 0),
      },
    ]);
    expect(env.db.collectionFolderItems).toHaveLength(2);
    expect(env.db.collectionFolderItems.map((r) => r.anime_id).sort()).toEqual([
      '100',
      '21',
    ]);
    for (const item of env.db.collectionFolderItems) {
      expect(item.folder_id).toBe(FOLDER_UUID);
    }
  });

  it('LEGACY-SD-009 wishlist-only anime ends up as planned with the addedDate as updated_at', () => {
    const env = swiftDataSnapshotToEnvelope(fixtureV2Snapshot());
    const vinland = env.db.userAnime.find((r) => r.anime_id === '200');
    expect(vinland?.status).toBe('planned');
    expect(vinland?.updated_at).toBe(Date.UTC(2025, 7, 1, 0, 0, 0));
  });

  it('LEGACY-SD-010 tracking item maps to status=watching with progress', () => {
    const env = swiftDataSnapshotToEnvelope(fixtureV2Snapshot());
    const bleach = env.db.userAnime.find((r) => r.anime_id === '47');
    expect(bleach?.status).toBe('watching');
    expect(bleach?.progress).toBe(5);
    expect(bleach?.total_episodes).toBe(13);
  });

  it('LEGACY-SD-011 empty snapshot still produces a valid envelope shape', () => {
    const empty: LegacySwiftDataSnapshot = {
      hasStore: true,
      alreadyImported: false,
    };
    const env = swiftDataSnapshotToEnvelope(empty);
    expect(env.db.userAnime).toEqual([]);
    expect(env.db.collectionFolders).toEqual([]);
    expect(env.db.collectionFolderItems).toEqual([]);
  });
});

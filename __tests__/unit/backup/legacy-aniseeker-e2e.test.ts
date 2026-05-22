// End-to-end legacy restore: byte-for-byte SwiftUI export → fake SQLite.
//
// The string below is what `JSONEncoder().encode(dataToMigrate)` writes when
// `dataToMigrate: [RatingMigrationData]` in the old aniseeker. Three
// SwiftUI-specific quirks must survive the round trip:
//
//  1. The top-level value is a bare JSON array — NOT { ratings: [...] }.
//     PersistenceService.swift writes the array directly to UserDefaults under
//     "migration_v1_v2_data".
//
//  2. Optional properties with a nil value have their KEY OMITTED entirely
//     (Swift's synthesized Codable uses encodeIfPresent for Optional).
//     `imageUrl`, `totalEpisodes`, `syncSource` may simply not appear.
//
//  3. `createdAt` is a Double number of seconds since 2001-01-01T00:00:00Z
//     (Apple's `Date` reference). NOT ISO 8601, NOT Unix epoch.
//
// We assert that running this fixture through `importLegacyAniseekerExport →
// BackupService.restoreSnapshot` populates the SQLite tables exactly the way
// the new app expects.

import { describe, it, expect } from 'bun:test';

import { BackupService } from '../../../libs/services/backup/backup-service';
import {
  importLegacyAniseekerExport,
  type LegacyAniseekerExport,
  type LegacyRatingMigrationData,
} from '../../../libs/services/backup/legacy-aniseeker';

import { makeFakeDb, makeFakeStorage } from './fakes';

// Hand-crafted byte string mimicking JSONEncoder().encode([RatingMigrationData]).
// Spacing follows Swift's compact default (no pretty-printing). Omitted keys
// (imageUrl on row 3, totalEpisodes on rows 3 and 5, syncSource on row 3) test
// the encodeIfPresent path.
const REAL_SWIFT_BYTES = `[
{"animeId":1,"title":"Cowboy Bebop","imageUrl":"https://cdn/bebop.jpg","ratingType":"liked","watchedEpisodes":26,"totalEpisodes":26,"syncSource":"mal,anilist","createdAt":740102400},
{"animeId":2,"title":"Frieren","imageUrl":"https://cdn/frieren.jpg","ratingType":"tracking","watchedEpisodes":14,"totalEpisodes":28,"syncSource":"anilist","createdAt":757036800},
{"animeId":3,"title":"GenericA","ratingType":"neutral","watchedEpisodes":4,"createdAt":763862400},
{"animeId":4,"title":"NotForMe","imageUrl":"https://cdn/x.jpg","ratingType":"dislike","watchedEpisodes":0,"syncSource":"kitsu","createdAt":768441600},
{"animeId":5,"title":"StillWatching","imageUrl":"https://cdn/sw.jpg","ratingType":"tracking","watchedEpisodes":0,"totalEpisodes":12,"syncSource":"mal","createdAt":791510400}
]`.replace(/\n/g, '');

describe('backup/legacy-aniseeker · byte-for-byte SwiftUI fixture', () => {
  it('E2E-LEGACY-001 raw bytes parse cleanly into a LegacyAniseekerExport-shaped input', () => {
    const parsed = JSON.parse(REAL_SWIFT_BYTES);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(5);
    // Spot-check that keys really are camelCase + omitted.
    expect(parsed[2].imageUrl).toBeUndefined();
    expect(parsed[2].totalEpisodes).toBeUndefined();
    expect(parsed[2].syncSource).toBeUndefined();
    expect(typeof parsed[0].createdAt).toBe('number');
  });

  it('E2E-LEGACY-002 importLegacyAniseekerExport accepts the bare array form (no wrapper)', () => {
    const parsed = JSON.parse(REAL_SWIFT_BYTES) as LegacyRatingMigrationData[];
    const env = importLegacyAniseekerExport(parsed);
    expect(env.version).toBe(1);
    expect(env.legacy?.sourceApp).toBe('aniseeker-swiftui');
    expect(env.db.userAnime).toHaveLength(5);
  });

  it('E2E-LEGACY-003 full restore writes the expected rows to the SQLite-shaped fake', async () => {
    const parsed = JSON.parse(REAL_SWIFT_BYTES) as LegacyRatingMigrationData[];
    const env = importLegacyAniseekerExport(parsed);

    const db = makeFakeDb();
    const storage = makeFakeStorage();
    const svc = new BackupService({
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    });

    const summary = await svc.restoreSnapshot(env);
    expect(summary.userAnime).toBe(5);
    expect(summary.favorites).toBe(1); // only the 'liked' entry
    expect(summary.ratings).toBe(2); // liked + dislike

    // Cowboy Bebop — liked + finished → completed, score 10, also favorite + rating(like).
    const bebop = db.tables.user_anime.get('1');
    expect(bebop?.status).toBe('completed');
    expect(bebop?.score).toBe(10);
    expect(bebop?.progress).toBe(26);
    expect(bebop?.total_episodes).toBe(26);
    expect(typeof bebop?.completed_at).toBe('number');
    expect(db.tables.favorites.get('1')?.title).toBe('Cowboy Bebop');
    expect(db.tables.ratings.get('1')?.rating).toBe('like');

    // Frieren — tracking → watching (regardless of score).
    const frieren = db.tables.user_anime.get('2');
    expect(frieren?.status).toBe('watching');
    expect(frieren?.score).toBeNull();
    expect(frieren?.progress).toBe(14);
    expect(frieren?.total_episodes).toBe(28);

    // GenericA — neutral + partial progress + no totalEpisodes → watching, score 5.
    // imageUrl was OMITTED in the Swift bytes, so it lands as null in the DB.
    const generic = db.tables.user_anime.get('3');
    expect(generic?.status).toBe('watching');
    expect(generic?.score).toBe(5);
    expect(generic?.image_url).toBeNull();
    expect(generic?.total_episodes).toBeNull();

    // NotForMe — dislike, 0 progress → planned, score 1, rating(pass), no favorite.
    const notForMe = db.tables.user_anime.get('4');
    expect(notForMe?.status).toBe('planned');
    expect(notForMe?.score).toBe(1);
    expect(db.tables.ratings.get('4')?.rating).toBe('pass');
    expect(db.tables.favorites.get('4')).toBeUndefined();

    // StillWatching — tracking + 0 progress → still watching by virtue of ratingType.
    const sw = db.tables.user_anime.get('5');
    expect(sw?.status).toBe('watching');
    expect(sw?.progress).toBe(0);
  });

  it('E2E-LEGACY-004 also handles the wrapped form { ratings: [...] } the same way', async () => {
    const wrapped: LegacyAniseekerExport = {
      version: 'v1-v2-migration',
      exportedAt: '2026-05-22T10:00:00Z',
      ratings: JSON.parse(REAL_SWIFT_BYTES) as LegacyRatingMigrationData[],
    };
    const env = importLegacyAniseekerExport(wrapped);

    const db = makeFakeDb();
    const storage = makeFakeStorage();
    const svc = new BackupService({
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    });

    const summary = await svc.restoreSnapshot(env);
    expect(summary.userAnime).toBe(5);
    expect(db.tables.user_anime.get('1')?.status).toBe('completed');
    expect(db.tables.user_anime.get('5')?.status).toBe('watching');
  });

  it('E2E-LEGACY-005 dates land in plausible 2024-2026 millisecond range (no off-by-31-years bug)', () => {
    const parsed = JSON.parse(REAL_SWIFT_BYTES) as LegacyRatingMigrationData[];
    const env = importLegacyAniseekerExport(parsed);
    const yearOf = (ms: number | null | undefined): number =>
      typeof ms === 'number' ? new Date(ms).getUTCFullYear() : NaN;

    for (const row of env.db.userAnime) {
      expect(yearOf(row.updated_at)).toBeGreaterThanOrEqual(2024);
      expect(yearOf(row.updated_at)).toBeLessThanOrEqual(2026);
    }
  });
});

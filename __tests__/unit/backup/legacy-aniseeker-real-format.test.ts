// These fixtures mimic what the old aniseeker SwiftUI app actually writes:
//
//   MigrationPlan.swift / PersistenceService.swift do
//     `JSONEncoder().encode(dataToMigrate)` with NO date strategy override.
//
// Swift Codable + default JSONEncoder produces:
//   - camelCase property names (verbatim)
//   - Dates as Double seconds since the reference date 2001-01-01T00:00:00Z
//     (NOT ISO 8601, NOT Unix epoch)
//   - Optional properties with `nil` value → omitted keys (encodeIfPresent path),
//     not explicit null
//
// We've audited the SwiftUI repo (no fileExporter / UIDocumentPicker / Export
// menu) — the `migration_v1_v2_data` UserDefaults blob is the canonical legacy
// export. These tests pin that shape exactly so the importer round-trips real
// device data.

import { describe, it, expect } from 'bun:test';

import {
  importLegacyAniseekerExport,
  type LegacyAniseekerExport,
} from '../../../libs/services/backup/legacy-aniseeker';
import { BackupService } from '../../../libs/services/backup/backup-service';
import { parseBackupEnvelope, serializeBackupEnvelope } from '../../../libs/services/backup/schema';

import { makeFakeDb, makeFakeStorage } from './fakes';

// 2001-01-01T00:00:00Z relative to 1970-01-01T00:00:00Z.
const SWIFT_REFERENCE_EPOCH_S = 978307200;

function swiftDateFor(year: number, month: number, day: number): number {
  const ms = Date.UTC(year, month - 1, day, 0, 0, 0);
  return ms / 1000 - SWIFT_REFERENCE_EPOCH_S;
}

describe('backup/legacy-aniseeker · real Swift JSONEncoder shape', () => {
  it('LEGACY-REAL-001 decodes Swift reference-date Double timestamps', () => {
    // 2025-09-01 → 24 years + 8 months after 2001 reference
    const createdAtSwift = swiftDateFor(2025, 9, 1);
    expect(createdAtSwift).toBeGreaterThan(7e8);
    expect(createdAtSwift).toBeLessThan(8e8);

    const exp: LegacyAniseekerExport = {
      ratings: [
        {
          animeId: 100,
          title: 'Bebop',
          // imageUrl key OMITTED (Swift encodeIfPresent for nil Optional)
          ratingType: 'tracking',
          watchedEpisodes: 5,
          // totalEpisodes / syncSource also omitted
          createdAt: createdAtSwift,
        },
      ],
    };

    const env = importLegacyAniseekerExport(exp);
    const row = env.db.userAnime.find((r) => r.anime_id === '100');
    expect(row).toBeDefined();
    expect(row?.status).toBe('watching');
    expect(row?.image_url).toBeNull();
    expect(row?.total_episodes).toBeNull();
    // Date should be re-anchored to 1970 epoch ms.
    expect(row?.updated_at).toBe(Date.UTC(2025, 8, 1)); // month is 0-indexed
  });

  it('LEGACY-REAL-002 handles a realistic 5-item migration blob (mixed rating types)', () => {
    const blob = {
      // Swift's default JSONEncoder writes a top-level array here — the
      // PersistenceService writes encoded `[RatingMigrationData]` directly.
      ratings: [
        {
          animeId: 1,
          title: 'Cowboy Bebop',
          imageUrl: 'https://cdn/bebop.jpg',
          ratingType: 'liked',
          watchedEpisodes: 26,
          totalEpisodes: 26,
          syncSource: 'mal,anilist',
          createdAt: swiftDateFor(2024, 6, 15),
        },
        {
          animeId: 2,
          title: 'Frieren',
          imageUrl: 'https://cdn/frieren.jpg',
          ratingType: 'tracking',
          watchedEpisodes: 14,
          totalEpisodes: 28,
          syncSource: 'anilist',
          createdAt: swiftDateFor(2025, 1, 3),
        },
        {
          animeId: 3,
          title: 'GenericA',
          // imageUrl omitted (nil)
          ratingType: 'neutral',
          watchedEpisodes: 4,
          // totalEpisodes omitted
          // syncSource omitted
          createdAt: swiftDateFor(2025, 3, 20),
        },
        {
          animeId: 4,
          title: 'NotForMe',
          imageUrl: 'https://cdn/x.jpg',
          ratingType: 'dislike',
          watchedEpisodes: 0,
          syncSource: 'kitsu',
          createdAt: swiftDateFor(2025, 5, 9),
        },
        {
          animeId: 5,
          title: 'StillWatching',
          imageUrl: 'https://cdn/sw.jpg',
          ratingType: 'tracking',
          watchedEpisodes: 0,
          totalEpisodes: 12,
          syncSource: 'mal',
          createdAt: swiftDateFor(2026, 2, 1),
        },
      ],
    } as unknown as LegacyAniseekerExport;

    const env = importLegacyAniseekerExport(blob);

    expect(env.db.userAnime).toHaveLength(5);
    expect(env.legacy?.sourceApp).toBe('aniseeker-swiftui');

    const bebop = env.db.userAnime.find((r) => r.anime_id === '1');
    expect(bebop?.status).toBe('completed');
    expect(bebop?.score).toBe(10);
    expect(bebop?.completed_at).toBe(Date.UTC(2024, 5, 15));

    const frieren = env.db.userAnime.find((r) => r.anime_id === '2');
    expect(frieren?.status).toBe('watching');
    expect(frieren?.progress).toBe(14);
    expect(frieren?.total_episodes).toBe(28);

    const generic = env.db.userAnime.find((r) => r.anime_id === '3');
    expect(generic?.status).toBe('watching');
    expect(generic?.image_url).toBeNull();
    expect(generic?.total_episodes).toBeNull();

    const notForMe = env.db.userAnime.find((r) => r.anime_id === '4');
    expect(notForMe?.status).toBe('planned');
    expect(notForMe?.score).toBe(1);

    const stillWatching = env.db.userAnime.find((r) => r.anime_id === '5');
    expect(stillWatching?.status).toBe('watching'); // ratingType=tracking forces watching even at 0 progress

    // Favorites + ratings derivation.
    const favIds = env.db.favorites.map((f) => f.id).sort();
    expect(favIds).toEqual(['1']);

    const ratingMap = new Map(env.db.ratings.map((r) => [r.id, r.rating]));
    expect(ratingMap.get('1')).toBe('like');
    expect(ratingMap.get('4')).toBe('pass');
    expect(ratingMap.has('2')).toBe(false);
    expect(ratingMap.has('3')).toBe(false);
  });

  it('LEGACY-REAL-003 also accepts ms-epoch numbers, s-epoch numbers, and ISO strings on the same field', () => {
    const cases = [
      { label: 'iso', value: '2025-06-15T00:00:00Z', expected: Date.UTC(2025, 5, 15) },
      { label: 's-epoch', value: 1734220800, expected: 1734220800 * 1000 },
      { label: 'ms-epoch', value: 1734220800000, expected: 1734220800000 },
      { label: 'swift', value: swiftDateFor(2025, 9, 1), expected: Date.UTC(2025, 8, 1) },
    ];

    for (const c of cases) {
      const env = importLegacyAniseekerExport({
        ratings: [
          {
            animeId: 999,
            title: c.label,
            ratingType: 'liked',
            watchedEpisodes: 1,
            totalEpisodes: 1,
            createdAt: c.value as never,
          } as never,
        ],
      });
      const row = env.db.userAnime[0];
      expect(row?.updated_at).toBe(c.expected);
    }
  });

  it('LEGACY-REAL-004 end-to-end: Swift fixture → restore → SQLite tables match', async () => {
    const exp: LegacyAniseekerExport = {
      ratings: [
        {
          animeId: 42,
          title: 'Real fixture',
          imageUrl: 'https://cdn/real.jpg',
          ratingType: 'liked',
          watchedEpisodes: 12,
          totalEpisodes: 12,
          syncSource: 'mal',
          createdAt: swiftDateFor(2024, 12, 1),
        },
      ],
    };

    const env = importLegacyAniseekerExport(exp);
    const json = serializeBackupEnvelope(env);
    // Round-trip through the canonical envelope parser.
    const reparsed = parseBackupEnvelope(json);

    const db = makeFakeDb();
    const storage = makeFakeStorage();
    const svc = new BackupService({
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    });

    const summary = await svc.restoreSnapshot(reparsed);
    expect(summary.userAnime).toBe(1);
    expect(summary.favorites).toBe(1);
    expect(summary.ratings).toBe(1);

    const userAnime = db.tables.user_anime.get('42');
    expect(userAnime?.status).toBe('completed');
    expect(userAnime?.score).toBe(10);
    expect(userAnime?.completed_at).toBe(Date.UTC(2024, 11, 1));
  });
});

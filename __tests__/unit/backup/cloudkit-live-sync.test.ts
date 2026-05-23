import { describe, it, expect, beforeEach, mock } from 'bun:test';

import {
  CloudKitLiveSync,
  type CloudKitBridgeLike,
} from '../../../libs/services/backup/cloudkit-live-sync';
import {
  cloudKitRecordsToEnvelope,
  type CloudKitRecord,
} from '../../../libs/services/backup/cloudkit-converter';
import { BackupService } from '../../../libs/services/backup/backup-service';
import { createEmptyBackup } from '../../../libs/services/backup/schema';

import { makeFakeDb, makeFakeStorage } from './fakes';

import type { LegacySwiftDataSnapshot } from '../../../libs/services/backup/legacy-swiftdata';

interface FakeBridgeOptions {
  initialRecords?: CloudKitRecord[];
  legacy?: LegacySwiftDataSnapshot;
}

function makeFakeBridge(opts: FakeBridgeOptions = {}): CloudKitBridgeLike & {
  _store: CloudKitRecord[];
  _writeCalls: number;
  _legacy: LegacySwiftDataSnapshot | null;
  _legacyMarked: boolean;
} {
  const store = [...(opts.initialRecords ?? [])];
  let writeCalls = 0;
  let legacy = opts.legacy ?? null;
  let legacyMarked = false;
  return {
    _store: store,
    get _writeCalls() {
      return writeCalls;
    },
    get _legacy() {
      return legacy;
    },
    get _legacyMarked() {
      return legacyMarked;
    },
    isInstalled() {
      return true;
    },
    async getAvailability() {
      return 'ready';
    },
    async fetchAllRecords() {
      return [...store];
    },
    async writeRecords(records) {
      writeCalls++;
      for (const r of records) {
        const idx = store.findIndex(
          (s) => s.recordType === r.recordType && s.recordName === r.recordName
        );
        if (idx >= 0) store[idx] = r;
        else store.push(r);
      }
      return { written: records.length, failed: 0 };
    },
    async deleteAllRecords() {
      const n = store.length;
      store.length = 0;
      return { deleted: n };
    },
    async fetchLegacySwiftDataStore() {
      if (!legacy) {
        return { hasStore: false, alreadyImported: legacyMarked };
      }
      return { ...legacy, alreadyImported: legacyMarked || legacy.alreadyImported };
    },
    async markLegacyStoreImported() {
      legacyMarked = true;
      if (legacy) legacy = { ...legacy, alreadyImported: true };
    },
  };
}

describe('backup/cloudkit-live-sync', () => {
  let bridge: ReturnType<typeof makeFakeBridge>;
  let db: ReturnType<typeof makeFakeDb>;
  let storage: ReturnType<typeof makeFakeStorage>;
  let svc: BackupService;
  let sync: CloudKitLiveSync;

  beforeEach(() => {
    bridge = makeFakeBridge();
    db = makeFakeDb();
    storage = makeFakeStorage();
    svc = new BackupService({
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    });
    sync = new CloudKitLiveSync({ bridge, backupService: svc });
  });

  it('LIVESYNC-001 isAvailable returns true only when the bridge reports ready', async () => {
    expect(await sync.isAvailable()).toBe(true);
    bridge.getAvailability = mock(async () => 'no-account') as never;
    expect(await sync.isAvailable()).toBe(false);
    bridge.getAvailability = mock(async () => 'unavailable') as never;
    expect(await sync.isAvailable()).toBe(false);
  });

  it('LIVESYNC-002 pull() fetches CloudKit records and restores them into the local DB', async () => {
    bridge._store.push({
      recordType: 'WatchedAnime',
      recordName: 'W-1',
      fields: {
        animeId: 1,
        title: 'Bebop',
        watchedEpisodes: 26,
        totalEpisodes: 26,
        isCompleted: 1,
      },
    });
    const summary = await sync.pull();
    expect(summary.userAnime).toBe(1);
    expect(db.tables.user_anime.get('1')?.status).toBe('completed');
  });

  it('LIVESYNC-003 push() writes the current local snapshot as CloudKit records', async () => {
    db.tables.user_anime.set('7', {
      anime_id: '7',
      title: 'New',
      image_url: null,
      status: 'watching',
      score: null,
      progress: 5,
      total_episodes: 24,
      started_at: null,
      completed_at: null,
      updated_at: 1,
    });

    const result = await sync.push();
    expect(result.written).toBeGreaterThan(0);
    const trackedRecord = bridge._store.find(
      (r) => r.recordType === 'TrackingAnime' && r.fields.animeId === 7
    );
    expect(trackedRecord).toBeDefined();
  });

  it('LIVESYNC-004 sync() is push-then-pull and converges both sides', async () => {
    // Local has anime #1, cloud has anime #2 — both should end up in both.
    db.tables.user_anime.set('1', {
      anime_id: '1',
      title: 'Local-only',
      image_url: null,
      status: 'watching',
      score: null,
      progress: 1,
      total_episodes: null,
      started_at: null,
      completed_at: null,
      updated_at: 1,
    });
    bridge._store.push({
      recordType: 'TrackingAnime',
      recordName: 'T-2',
      fields: { animeId: 2, title: 'Cloud-only', currentEpisode: 3 },
    });

    await sync.sync();

    expect(db.tables.user_anime.get('1')).toBeDefined();
    expect(db.tables.user_anime.get('2')).toBeDefined();
    expect(bridge._store.some((r) => r.fields.animeId === 1)).toBe(true);
    expect(bridge._store.some((r) => r.fields.animeId === 2)).toBe(true);
  });

  it('LIVESYNC-005 round-trip preserves env.legacy.sourceApp on pull', async () => {
    bridge._store.push({
      recordType: 'WishlistItem',
      recordName: 'P-1',
      fields: { animeId: 1, title: 'Plan to watch' },
    });
    const records = await bridge.fetchAllRecords();
    const env = cloudKitRecordsToEnvelope(records);
    expect(env.legacy?.sourceApp).toBe('aniseeker-cloudkit');
  });

  it('LIVESYNC-006 push refuses to run when the bridge is unavailable', async () => {
    bridge.getAvailability = mock(async () => 'unavailable') as never;
    await expect(sync.push()).rejects.toThrow(/CloudKit not available/);
  });

  // ---------- Legacy aniseeker migration blob ----------

  describe('legacy aniseeker migration blob', () => {
    const SAMPLE_LEGACY: LegacySwiftDataSnapshot = {
      hasStore: true,
      alreadyImported: false,
      storePath: 'UserDefaults:migration_v1_v2_data',
      ratings: [
        {
          animeId: 21,
          title: 'Bebop',
          imageUrl: null,
          ratingType: 'liked',
          watchedEpisodes: 26,
          totalEpisodes: 26,
          createdAt: Date.UTC(2025, 5, 1),
        },
        {
          animeId: 100,
          title: 'Steins;Gate',
          imageUrl: null,
          ratingType: 'neutral',
          watchedEpisodes: 24,
          totalEpisodes: 24,
          createdAt: Date.UTC(2025, 5, 1),
        },
      ],
    };

    it('LIVESYNC-LEG-001 hasPendingLegacyMigration is false when there is no store', async () => {
      expect(await sync.hasPendingLegacyMigration()).toBe(false);
    });

    it('LIVESYNC-LEG-002 hasPendingLegacyMigration is true when the migration blob has rows', async () => {
      bridge = makeFakeBridge({ legacy: SAMPLE_LEGACY });
      sync = new CloudKitLiveSync({ bridge, backupService: svc });
      expect(await sync.hasPendingLegacyMigration()).toBe(true);
    });

    it('LIVESYNC-LEG-003 dryRunLegacy returns a diff without writing anything', async () => {
      bridge = makeFakeBridge({ legacy: SAMPLE_LEGACY });
      sync = new CloudKitLiveSync({ bridge, backupService: svc });
      const result = await sync.dryRunLegacy();
      expect(result).not.toBeNull();
      expect(result?.diff.hasChanges).toBe(true);
      expect(result?.diff.userAnime.added).toBeGreaterThan(0);
      // The DB must still be untouched — dry-run is read-only.
      expect(db.tables.user_anime.size).toBe(0);
      expect(bridge._legacyMarked).toBe(false);
    });

    it('LIVESYNC-LEG-004 pullLegacy restores migration rows AND marks them imported', async () => {
      bridge = makeFakeBridge({ legacy: SAMPLE_LEGACY });
      sync = new CloudKitLiveSync({ bridge, backupService: svc });
      const summary = await sync.pullLegacy();
      expect(summary?.userAnime).toBe(2);
      expect(db.tables.user_anime.get('21')?.status).toBe('completed');
      expect(db.tables.user_anime.get('100')?.status).toBe('completed');
      expect(bridge._legacyMarked).toBe(true);
      // Subsequent probe should report alreadyImported so the UI hides.
      expect(await sync.hasPendingLegacyMigration()).toBe(false);
    });

    it('LIVESYNC-LEG-005 pullLegacy is a no-op on an empty/missing migration blob', async () => {
      // No legacy passed → fetchLegacySwiftDataStore returns hasStore=false.
      const summary = await sync.pullLegacy();
      expect(summary).toBeNull();
      expect(bridge._legacyMarked).toBe(false);
    });
  });
});

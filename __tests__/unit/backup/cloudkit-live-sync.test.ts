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

function makeFakeBridge(initial: CloudKitRecord[] = []): CloudKitBridgeLike & {
  _store: CloudKitRecord[];
  _writeCalls: number;
} {
  const store = [...initial];
  let writeCalls = 0;
  return {
    _store: store,
    get _writeCalls() {
      return writeCalls;
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
});

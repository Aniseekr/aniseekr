import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { LocalDB } from '../../../libs/db';
import { offlineQueueService } from '../../../libs/services/sync/offline-queue-service';
import { multiPlatformSyncService } from '../../../libs/services/sync/multi-platform-sync-service';
import { trackingService } from '../../../libs/services/tracking/tracking-service';
import { authService } from '../../../libs/services/auth/auth-service';
import { anilistProvider } from '../../../libs/services/providers/anilist-provider';
import type * as SQLite from 'expo-sqlite';

let sqlite: Database;
let db: SQLite.SQLiteDatabase;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE sync_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, job_type TEXT, platform TEXT, payload TEXT, attempts INTEGER, next_attempt_at INTEGER, last_error TEXT, state TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE tracking_tombstones (anime_id TEXT PRIMARY KEY, platform_ids TEXT, created_at INTEGER);
    CREATE TABLE sync_dirty_records (anime_id TEXT, platform TEXT, field TEXT, marked_at INTEGER, UNIQUE(anime_id, platform, field));
    CREATE TABLE user_anime (anime_id TEXT PRIMARY KEY, title TEXT, image_url TEXT, status TEXT, score REAL, progress INTEGER, total_episodes INTEGER, notes TEXT, rewatch_count INTEGER, updated_at INTEGER);`);
  const wrapper = {
    getAllAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).all(...args),
    getFirstAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).get(...args),
    runAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).run(...args),
    withExclusiveTransactionAsync: async (fn: (tx: SQLite.SQLiteDatabase) => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await fn(db);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  db = wrapper as unknown as SQLite.SQLiteDatabase;
  spyOn(LocalDB, 'getDatabase').mockResolvedValue(db);
});

afterEach(() => {
  mock.restore();
  sqlite.close();
});

const job = (progress: number) => ({
  type: 'progress' as const,
  platform: 'anilist' as const,
  payload: { animeId: '1', progress },
});

describe('sync queue consistency', () => {
  it('waits for an in-flight remove before sending the re-tracking add', async () => {
    const anime = {
      id: 'anilist_1',
      platformIds: { anilist: '1' },
      title: 'Title',
      imageUrl: '',
      status: 'watching' as const,
      progress: 0,
      score: 0,
      updatedAt: new Date(),
      source: 'anilist' as const,
    };
    spyOn(authService, 'initialize').mockResolvedValue(undefined);
    spyOn(authService, 'getConnectedPlatforms').mockReturnValue(['anilist']);
    const removeStarted = Promise.withResolvers<void>();
    const finishRemove = Promise.withResolvers<void>();
    const order: string[] = [];
    await offlineQueueService.enqueueBatch([
      { type: 'remove', platform: 'anilist', payload: { animeId: '1', localAnimeId: 'anilist_1' } },
    ]);

    const firstDrain = offlineQueueService.drain(async (current) => {
      order.push(current.jobType);
      removeStarted.resolve();
      await finishRemove.promise;
    });
    await removeStarted.promise;

    await multiPlatformSyncService.syncLocalMutation(anime, async (tx) => {
      await tx.runAsync(
        'INSERT INTO tracking_tombstones (anime_id, platform_ids, created_at) VALUES (\'anilist_1\', \'{"anilist":"1"}\', ?)',
        Date.now()
      );
      return { changes: { status: 'watching' }, options: { ensureListEntry: true } };
    });

    expect(order).toEqual(['remove']);
    expect(sqlite.query('SELECT job_type, state FROM sync_jobs ORDER BY id').all()).toEqual([
      { job_type: 'remove', state: 'running' },
      { job_type: 'add', state: 'pending' },
    ]);
    finishRemove.resolve();
    await firstDrain;

    await offlineQueueService.drain(async (current) => {
      order.push(current.jobType);
    });
    expect(order).toEqual(['remove', 'add']);
  });

  it('keeps the re-tracking add blocked while the remove retries after failure', async () => {
    await offlineQueueService.enqueueBatch([
      { type: 'remove', platform: 'anilist', payload: { animeId: '1' } },
      { type: 'add', platform: 'anilist', payload: { animeId: '1', status: 'watching' } },
    ]);
    const order: string[] = [];
    await offlineQueueService.drain(async (current) => {
      order.push(current.jobType);
      throw new Error('temporary network failure');
    });
    expect(order).toEqual(['remove']);

    sqlite.exec("UPDATE sync_jobs SET next_attempt_at = 0 WHERE job_type = 'remove'");
    await offlineQueueService.drain(async (current) => {
      order.push(current.jobType);
    });
    expect(order).toEqual(['remove', 'remove', 'add']);
  });
  it('atomically records the local identity and keeps newer edits protected', async () => {
    await offlineQueueService.enqueueBatch([
      { ...job(1), payload: { animeId: '1', localAnimeId: 'anilist_1', progress: 1 } },
    ]);
    expect(sqlite.query('SELECT anime_id, field FROM sync_dirty_records').all()).toEqual([
      { anime_id: 'anilist_1', field: 'progress' },
    ]);
    await offlineQueueService.drain(async (current) => {
      if (current.payload.progress === 1) {
        await offlineQueueService.enqueueBatch([
          { ...job(2), payload: { animeId: '1', localAnimeId: 'anilist_1', progress: 2 } },
        ]);
      }
      throw new Error('offline');
    });
    expect(sqlite.query('SELECT anime_id, field FROM sync_dirty_records').all()).toEqual([
      { anime_id: 'anilist_1', field: 'progress' },
    ]);
  });

  it('rolls back the local change and job when dirty persistence fails', async () => {
    sqlite.exec('DROP TABLE sync_dirty_records');
    await expect(
      offlineQueueService.mutateWithJobs(async (tx) => {
        await tx.runAsync(
          "INSERT INTO user_anime (anime_id, status) VALUES ('anilist_1', 'watching')"
        );
        return [{ ...job(1), payload: { animeId: '1', localAnimeId: 'anilist_1', progress: 1 } }];
      })
    ).rejects.toThrow();
    expect(sqlite.query('SELECT COUNT(*) AS count FROM user_anime').get()).toEqual({ count: 0 });
    expect(sqlite.query('SELECT COUNT(*) AS count FROM sync_jobs').get()).toEqual({ count: 0 });
  });

  it('clears only status after an add while a progress job remains', async () => {
    await offlineQueueService.enqueueBatch([
      {
        type: 'add',
        platform: 'anilist',
        payload: { animeId: '1', localAnimeId: 'anilist_1', status: 'watching' },
      },
      { ...job(3), payload: { animeId: '1', localAnimeId: 'anilist_1', progress: 3 } },
    ]);
    await offlineQueueService.drain(async (current) => {
      if (current.jobType === 'progress') throw new Error('offline');
    });
    expect(sqlite.query('SELECT field FROM sync_dirty_records').all()).toEqual([
      { field: 'progress' },
    ]);
  });

  it('keeps progress protected when a status edit folds into a pending add', async () => {
    await offlineQueueService.enqueueBatch([
      {
        type: 'add',
        platform: 'anilist',
        payload: { animeId: '1', localAnimeId: 'anilist_1', status: 'watching' },
      },
      { ...job(3), payload: { animeId: '1', localAnimeId: 'anilist_1', progress: 3 } },
    ]);
    await offlineQueueService.enqueueBatch([
      {
        type: 'status',
        platform: 'anilist',
        payload: { animeId: '1', localAnimeId: 'anilist_1', status: 'completed' },
      },
    ]);
    expect(sqlite.query('SELECT field FROM sync_dirty_records ORDER BY field').all()).toEqual([
      { field: 'progress' },
      { field: 'status' },
    ]);
  });

  it('keeps a newer edit dirty when an older running job succeeds', async () => {
    await offlineQueueService.enqueueBatch([
      { ...job(1), payload: { animeId: '1', localAnimeId: 'anilist_1', progress: 1 } },
    ]);
    await offlineQueueService.drain(async (current) => {
      if (current.payload.progress === 1) {
        await offlineQueueService.enqueueBatch([
          { ...job(2), payload: { animeId: '1', localAnimeId: 'anilist_1', progress: 2 } },
        ]);
      } else {
        throw new Error('offline');
      }
    });
    expect(sqlite.query('SELECT field FROM sync_dirty_records').all()).toEqual([
      { field: 'progress' },
    ]);
  });

  it('keeps an unparseable job for retry instead of reporting success', async () => {
    await offlineQueueService.enqueueBatch([job(1)]);
    sqlite.exec("UPDATE sync_jobs SET payload = 'not json'");
    const execute = (
      multiPlatformSyncService as unknown as { executeJob: (job: unknown) => Promise<void> }
    ).executeJob.bind(multiPlatformSyncService);
    const result = await offlineQueueService.drain(execute);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(sqlite.query('SELECT state, attempts FROM sync_jobs').get()).toEqual({
      state: 'pending',
      attempts: 1,
    });
  });

  it('revives a dead add when a newer status updates it', async () => {
    await offlineQueueService.enqueueBatch([
      { type: 'add', platform: 'anilist', payload: { animeId: '1', status: 'watching' } },
    ]);
    sqlite.exec("UPDATE sync_jobs SET state = 'dead', attempts = 5");
    await offlineQueueService.enqueueBatch([
      { type: 'status', platform: 'anilist', payload: { animeId: '1', status: 'completed' } },
    ]);
    const pending = await offlineQueueService.listPending();
    expect(pending.map((entry) => [entry.jobType, entry.payload.status, entry.attempts])).toEqual([
      ['add', 'completed', 0],
    ]);
  });

  it('preserves progress and sends only the status through the real tracking and queue services', async () => {
    sqlite.exec(
      "INSERT INTO user_anime (anime_id, status, progress) VALUES ('anilist_1', 'watching', 6)"
    );
    spyOn(authService, 'initialize').mockResolvedValue(undefined);
    spyOn(authService, 'getConnectedPlatforms').mockReturnValue(['anilist']);
    spyOn(authService, 'getValidCredentials').mockResolvedValue({
      platform: 'anilist',
      token: { accessToken: 'test-token', tokenType: 'Bearer' },
      connectedAt: new Date(),
    });
    const updateStatus = spyOn(anilistProvider, 'updateStatus').mockResolvedValue(undefined);
    const updateProgress = spyOn(anilistProvider, 'updateProgress').mockResolvedValue(undefined);

    await trackingService.upsertTracking({ animeId: 'anilist_1', status: 'completed' });

    expect((await trackingService.getStatus('anilist_1'))?.progress).toBe(6);
    expect(updateStatus).toHaveBeenCalledWith('1', 'completed', 'test-token');
    expect(updateProgress).not.toHaveBeenCalled();
    expect(await offlineQueueService.pendingCount()).toBe(0);
  });

  it('does not retry an older job that fails while a newer edit is queued', async () => {
    await offlineQueueService.enqueueBatch([job(1)]);
    const seen: number[] = [];
    await offlineQueueService.drain(async (current) => {
      seen.push(current.payload.progress!);
      if (current.payload.progress === 1) {
        await offlineQueueService.enqueueBatch([job(2)]);
        throw new Error('offline');
      }
    });
    expect(seen).toEqual([1, 2]);
    expect(await offlineQueueService.pendingCount()).toBe(0);
    expect(
      sqlite.query("SELECT COUNT(*) AS count FROM sync_jobs WHERE state = 'dead'").get()
    ).toEqual({ count: 0 });
  });

  it('recovers interrupted jobs and discards one replaced during interruption', async () => {
    await offlineQueueService.enqueueBatch([job(1)]);
    sqlite.exec("UPDATE sync_jobs SET state = 'running'");
    await offlineQueueService.enqueueBatch([job(2)]);
    const seen: number[] = [];
    await offlineQueueService.drain(async (current) => {
      seen.push(current.payload.progress!);
    });
    expect(seen).toEqual([2]);
    await offlineQueueService.enqueueBatch([job(3)]);
    sqlite.exec("UPDATE sync_jobs SET state = 'running' WHERE state = 'pending'");
    await offlineQueueService.drain(async (current) => {
      seen.push(current.payload.progress!);
    });
    expect(seen).toEqual([2, 3]);
  });

  it('blocks fields behind a failed add until it succeeds, while other work proceeds', async () => {
    await offlineQueueService.enqueueBatch([
      { type: 'add', platform: 'anilist', payload: { animeId: '1', status: 'watching' } },
      job(4),
      { ...job(5), payload: { animeId: '2', progress: 5 } },
      { ...job(6), platform: 'myanimelist' },
    ]);
    const seen: string[] = [];
    await offlineQueueService.drain(async (current) => {
      seen.push(`${current.platform}:${current.payload.animeId}:${current.jobType}`);
      if (current.jobType === 'add') throw new Error('offline');
    });
    expect(seen).toEqual(['anilist:1:add', 'anilist:2:progress', 'myanimelist:1:progress']);
    await offlineQueueService.drain(async () => {
      throw new Error('blocked job ran');
    });
    sqlite.exec("UPDATE sync_jobs SET next_attempt_at = 0 WHERE job_type = 'add'");
    await offlineQueueService.drain(async (current) => {
      seen.push(`${current.platform}:${current.payload.animeId}:${current.jobType}`);
    });
    expect(seen.slice(-2)).toEqual(['anilist:1:add', 'anilist:1:progress']);
  });

  it('keeps fields blocked when the add reaches the dead letter queue', async () => {
    await offlineQueueService.enqueueBatch([
      { type: 'add', platform: 'anilist', payload: { animeId: '1', status: 'watching' } },
      job(4),
    ]);
    sqlite.exec("UPDATE sync_jobs SET attempts = 4 WHERE job_type = 'add'");
    const seen: string[] = [];
    await offlineQueueService.drain(async (current) => {
      seen.push(current.jobType);
      throw new Error('offline');
    });
    expect(seen).toEqual(['add']);
    expect(await offlineQueueService.deadCount()).toBe(1);
    expect(await offlineQueueService.pendingCount()).toBe(1);
  });

  it('does not execute a batch entry removed by a newer edit', async () => {
    await offlineQueueService.enqueueBatch([
      job(1),
      { ...job(1), payload: { animeId: '2', progress: 1 } },
    ]);
    const seen: string[] = [];
    await offlineQueueService.drain(async (current) => {
      seen.push(`${current.payload.animeId}:${current.payload.progress}`);
      if (current.payload.animeId === '1') {
        await offlineQueueService.enqueueBatch([
          { ...job(2), payload: { animeId: '2', progress: 2 } },
        ]);
      }
    });
    expect(seen).toEqual(['1:1', '2:2']);
  });
});

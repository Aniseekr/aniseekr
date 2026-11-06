import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type * as SQLite from 'expo-sqlite';
import { LocalDB } from '../../../libs/db';
import { conflictResolutionService } from '../../../libs/services/sync/conflict-resolution-service';
import { multiPlatformSyncService } from '../../../libs/services/sync/multi-platform-sync-service';
import { trackingService } from '../../../libs/services/tracking/tracking-service';
import { authService } from '../../../libs/services/auth/auth-service';
import { offlineQueueService } from '../../../libs/services/sync/offline-queue-service';

const values = JSON.stringify([
  { platform: 'anilist', value: 7.5, updatedAt: 1 },
  { platform: 'myanimelist', value: 8, updatedAt: 2 },
]);

afterEach(() => mock.restore());

describe('manual conflict resolution', () => {
  it('writes the selected score and queues it through the tracking mutation even if unchanged', async () => {
    const writes: unknown[][] = [];
    const db = {
      getFirstAsync: async () => ({ anime_id: 'anilist:123', field: 'score', values_json: values }),
      getAllAsync: async () => [{ anime_id: '123' }],
      runAsync: async (...args: unknown[]) => { writes.push(args); return { changes: 1 }; },
    } as unknown as SQLite.SQLiteDatabase;
    spyOn(LocalDB, 'getDatabase').mockResolvedValue(db);
    spyOn(trackingService, 'invalidateTrackingCache').mockImplementation(() => {});
    const mutation = spyOn(multiPlatformSyncService, 'syncLocalMutation').mockImplementation(async (item, apply) => {
      expect(item.id).toBe('123');
      expect(item.platformIds).toEqual({ anilist: '123' });
      expect(await apply(db)).toEqual({ changes: { score: 8 } });
    });
    await conflictResolutionService.resolveManually(5, 'myanimelist');
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(writes[0][0]).toContain('UPDATE sync_conflicts');
    expect(writes[1].slice(1)).toEqual([80, expect.any(Number), '123']);
  });

  it('queues the selected value for the connected platform through the actual sync path', async () => {
    const db = {
      getFirstAsync: async () => ({ anime_id: 'anilist:123', field: 'score', values_json: values }),
      getAllAsync: async () => [{ anime_id: '123' }],
      runAsync: async () => ({ changes: 1 }),
    } as unknown as SQLite.SQLiteDatabase;
    spyOn(LocalDB, 'getDatabase').mockResolvedValue(db);
    spyOn(trackingService, 'invalidateTrackingCache').mockImplementation(() => {});
    spyOn(authService, 'initialize').mockResolvedValue(undefined);
    spyOn(authService, 'getConnectedPlatforms').mockReturnValue(['anilist']);
    const enqueue = spyOn(offlineQueueService, 'mutateWithJobs').mockImplementation(async (mutate) => {
      const jobs = await mutate(db);
      expect(jobs).toEqual([{ type: 'score', platform: 'anilist', payload: {
        animeId: '123', localAnimeId: '123', score: 8,
      } }]);
      return jobs;
    });
    spyOn(multiPlatformSyncService, 'drainOfflineQueue').mockResolvedValue({
      processed: 0, succeeded: 0, failed: 0, failedByPlatform: {}, dead: 0, deadByPlatform: {},
    });
    await conflictResolutionService.resolveManually(5, 'myanimelist');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('leaves ambiguous local matches unresolved', async () => {
    const db = {
      getFirstAsync: async () => ({ anime_id: 'anilist:123', field: 'score', values_json: values }),
      getAllAsync: async () => [{ anime_id: '123' }, { anime_id: 'anilist_123' }],
    } as unknown as SQLite.SQLiteDatabase;
    spyOn(LocalDB, 'getDatabase').mockResolvedValue(db);
    const mutation = spyOn(multiPlatformSyncService, 'syncLocalMutation');
    await expect(conflictResolutionService.resolveManually(5, 'anilist')).rejects.toThrow('uniquely identify');
    expect(mutation).not.toHaveBeenCalled();
  });

  it('rejects an unidentifiable legacy conflict before any write', async () => {
    const db = { getFirstAsync: async () => ({ anime_id: 'some-title', field: 'score', values_json: values }) } as unknown as SQLite.SQLiteDatabase;
    spyOn(LocalDB, 'getDatabase').mockResolvedValue(db);
    const mutation = spyOn(multiPlatformSyncService, 'syncLocalMutation');
    await expect(conflictResolutionService.resolveManually(5, 'anilist')).rejects.toThrow('reliably identify');
    expect(mutation).not.toHaveBeenCalled();
  });
});

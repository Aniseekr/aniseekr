import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { PlatformType, UniversalAnimeItem } from '../../../libs/services/auth/types';
import { authService } from '../../../libs/services/auth/auth-service';
import { anilistProvider } from '../../../libs/services/providers/anilist-provider';
import { annictProvider } from '../../../libs/services/providers/annict-provider';
import { bangumiProvider } from '../../../libs/services/providers/bangumi-provider';
import { malProvider } from '../../../libs/services/providers/mal-provider';
import { LocalDB } from '../../../libs/db';
import {
  trackingService,
  changedLocalAnimeFields,
  localScoreToProviderScore,
  platformIdsForLocalAnimeId,
} from '../../../libs/services/tracking/tracking-service';
import { idMappingService } from '../../../libs/services/sync/id-mapping-service';
import { multiPlatformSyncService } from '../../../libs/services/sync/multi-platform-sync-service';
import { offlineQueueService } from '../../../libs/services/sync/offline-queue-service';
import { syncDirtyTracker } from '../../../libs/services/sync/sync-dirty-tracker';
import type { SyncJob } from '../../../libs/services/sync/offline-queue-service';
import type * as SQLite from 'expo-sqlite';

const SOURCE_ID = '810001';
const MAL_ID = '810002';
const ANNICT_ID = '810003';
const BANGUMI_ID = '810004';
const originalScoreSupport = annictProvider.supportsScoreUpdates;
const queued: { type: SyncJob['jobType']; platform: PlatformType; payload: SyncJob['payload'] }[] =
  [];

function item(platformId = SOURCE_ID): UniversalAnimeItem {
  return {
    id: `anilist_${platformId}`,
    platformIds: { anilist: platformId },
    title: 'A title shared by unrelated items',
    imageUrl: '',
    status: 'on_hold',
    progress: 6,
    score: 6,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    source: 'anilist',
  };
}

beforeEach(() => {
  queued.length = 0;
  annictProvider.supportsScoreUpdates = false;
  Object.assign(annictProvider, { supportsProgressUpdates: false });
  Object.assign(bangumiProvider, { supportsProgressUpdates: false });

  spyOn(authService, 'initialize').mockResolvedValue(undefined);
  spyOn(authService, 'getConnectedPlatforms').mockReturnValue([
    'anilist',
    'myanimelist',
    'annict',
    'bangumi',
  ]);
  spyOn(authService, 'getValidCredentials').mockResolvedValue({
    platform: 'anilist',
    token: { accessToken: 'test-token', tokenType: 'Bearer' },
    connectedAt: new Date(),
  });
  spyOn(idMappingService, 'mapID').mockImplementation(async (_from, fromId, to) => {
    if (fromId !== SOURCE_ID) return null;
    if (to === 'myanimelist') return MAL_ID;
    if (to === 'annict') return ANNICT_ID;
    if (to === 'bangumi') return BANGUMI_ID;
    return null;
  });
  spyOn(offlineQueueService, 'enqueueBatch').mockImplementation(async (jobs) => {
    queued.push(...jobs);
  });
  spyOn(offlineQueueService, 'drain').mockImplementation(async (executor) => {
    for (let index = 0; index < queued.length; index += 1) {
      const queuedJob = queued[index];
      await executor({
        id: index + 1,
        jobType: queuedJob.type,
        platform: queuedJob.platform,
        // These tests exercise provider dispatch independently of local-row lookup.
        payload: { ...queuedJob.payload, localAnimeId: undefined },
        attempts: 0,
        nextAttemptAt: Date.now(),
        state: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } satisfies SyncJob);
    }
    return {
      processed: queued.length,
      succeeded: queued.length,
      failed: 0,
      failedByPlatform: {},
      dead: 0,
      deadByPlatform: {},
    };
  });
  spyOn(syncDirtyTracker, 'markDirty').mockResolvedValue(undefined);
  spyOn(syncDirtyTracker, 'clear').mockResolvedValue(undefined);

  for (const provider of [anilistProvider, malProvider, annictProvider, bangumiProvider]) {
    spyOn(provider, 'updateProgress').mockResolvedValue(undefined);
    spyOn(provider, 'updateStatus').mockResolvedValue(undefined);
    spyOn(provider, 'updateScore').mockResolvedValue(undefined);
    spyOn(provider, 'addToList').mockResolvedValue(undefined);
  }
  spyOn(anilistProvider, 'clearScore').mockResolvedValue(undefined);
  spyOn(malProvider, 'clearScore').mockResolvedValue(undefined);
  spyOn(bangumiProvider, 'clearScore').mockResolvedValue(undefined);
});

afterEach(() => {
  annictProvider.supportsScoreUpdates = originalScoreSupport;
  mock.restore();
});

describe('local edit writeback', () => {
  it('writes only the edited field to each platform with an exact mapped ID', async () => {
    await multiPlatformSyncService.syncLocalChanges(item(), { status: 'watching' });

    expect(queued.map(({ type, platform, payload }) => ({ type, platform, payload }))).toEqual([
      {
        type: 'status',
        platform: 'anilist',
        payload: { animeId: SOURCE_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'status',
        platform: 'myanimelist',
        payload: { animeId: MAL_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'status',
        platform: 'annict',
        payload: { animeId: ANNICT_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'status',
        platform: 'bangumi',
        payload: { animeId: BANGUMI_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
    ]);
    expect(anilistProvider.updateStatus).toHaveBeenCalledWith(SOURCE_ID, 'watching', 'test-token');
    expect(malProvider.updateStatus).toHaveBeenCalledWith(MAL_ID, 'watching', 'test-token');
    expect(annictProvider.updateStatus).toHaveBeenCalledWith(ANNICT_ID, 'watching', 'test-token');
    expect(anilistProvider.updateProgress).not.toHaveBeenCalled();
    expect(malProvider.updateScore).not.toHaveBeenCalled();
  });

  it('adds a newly tracked item to each exact mapped platform ID', async () => {
    await multiPlatformSyncService.syncLocalChanges(
      item(),
      { status: 'watching' },
      { ensureListEntry: true }
    );

    expect(queued.map(({ type, platform, payload }) => ({ type, platform, payload }))).toEqual([
      {
        type: 'add',
        platform: 'anilist',
        payload: { animeId: SOURCE_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'add',
        platform: 'myanimelist',
        payload: { animeId: MAL_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'add',
        platform: 'annict',
        payload: { animeId: ANNICT_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'add',
        platform: 'bangumi',
        payload: { animeId: BANGUMI_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
    ]);
    expect(anilistProvider.addToList).toHaveBeenCalledWith(SOURCE_ID, 'watching', 'test-token');
    expect(malProvider.addToList).toHaveBeenCalledWith(MAL_ID, 'watching', 'test-token');
    expect(annictProvider.addToList).toHaveBeenCalledWith(ANNICT_ID, 'watching', 'test-token');
    expect(bangumiProvider.addToList).toHaveBeenCalledWith(BANGUMI_ID, 'watching', 'test-token');
    expect(anilistProvider.updateStatus).not.toHaveBeenCalled();
  });

  it('writes progress only where the provider can set an exact watched count', async () => {
    await multiPlatformSyncService.syncLocalChanges(item(), { progress: 0 });

    expect(queued.map(({ type, platform, payload }) => ({ type, platform, payload }))).toEqual([
      {
        type: 'progress',
        platform: 'anilist',
        payload: { animeId: SOURCE_ID, localAnimeId: `anilist_${SOURCE_ID}`, progress: 0 },
      },
      {
        type: 'progress',
        platform: 'myanimelist',
        payload: { animeId: MAL_ID, localAnimeId: `anilist_${SOURCE_ID}`, progress: 0 },
      },
    ]);
    expect(annictProvider.updateProgress).not.toHaveBeenCalled();
    expect(bangumiProvider.updateProgress).not.toHaveBeenCalled();
  });

  it('does not write through conflicting platform ID mappings', async () => {
    const anime = item();
    anime.platformIds.bangumi = '810005';
    spyOn(authService, 'getConnectedPlatforms').mockReturnValue(['myanimelist']);
    spyOn(idMappingService, 'mapID').mockImplementation(async (from, _fromId, to) => {
      if (to !== 'myanimelist') return null;
      return from === 'anilist' ? MAL_ID : '810006';
    });

    spyOn(offlineQueueService, 'drain').mockResolvedValue({
      processed: 0, succeeded: 0, failed: 0, failedByPlatform: {}, dead: 0, deadByPlatform: {},
    });
    await multiPlatformSyncService.syncLocalChanges(anime, { status: 'completed' });

    expect(queued[0].payload.unresolvedPlatformIds).toEqual(anime.platformIds);
    expect(queued[0].payload.animeId).toBe(`unresolved:${anime.id}`);
    expect(malProvider.updateStatus).not.toHaveBeenCalled();
  });

  it('commits a new local record and all supported remote jobs in one SQLite transaction', async () => {
    const events: string[] = [];
    const tx = {
      getFirstAsync: async () => null,
      getAllAsync: async () => [],
      runAsync: async (sql: string, ...params: unknown[]) => {
        if (sql.includes('INSERT INTO sync_jobs')) {
          events.push('queue');
          queued.push({
            type: params[0] as SyncJob['jobType'],
            platform: params[1] as PlatformType,
            payload: JSON.parse(String(params[2])) as SyncJob['payload'],
          });
        } else {
          events.push('local');
        }
        return { changes: 1, lastInsertRowId: queued.length };
      },
    } as unknown as SQLite.SQLiteDatabase;
    const fakeDb = {
      getFirstAsync: async () => null,
      getAllAsync: async () => [],
      runAsync: async () => {
        events.push('outside-transaction');
        return { changes: 1, lastInsertRowId: 1 };
      },
      withExclusiveTransactionAsync: async (
        work: (transaction: SQLite.SQLiteDatabase) => Promise<void>
      ) => {
        events.push('begin');
        await work(tx);
        events.push('commit');
      },
    } as unknown as Awaited<ReturnType<typeof LocalDB.getDatabase>>;
    spyOn(LocalDB, 'getDatabase').mockResolvedValue(fakeDb);

    await trackingService.upsertTracking({
      animeId: `anilist_${SOURCE_ID}`,
      status: 'watching',
      progress: 7,
      score: 80,
      title: 'A title shared by unrelated items',
      platformIds: { anilist: SOURCE_ID },
      source: 'anilist',
    });

    expect(events[0]).toBe('begin');
    expect(events[events.length - 1]).toBe('commit');
    expect(events).not.toContain('outside-transaction');
    expect(events.slice(1, -1)).toContain('local');
    expect(events.slice(1, -1)).toContain('queue');
    expect(queued.map(({ type, platform, payload }) => ({ type, platform, payload }))).toEqual([
      {
        type: 'add',
        platform: 'anilist',
        payload: { animeId: SOURCE_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'progress',
        platform: 'anilist',
        payload: { animeId: SOURCE_ID, localAnimeId: `anilist_${SOURCE_ID}`, progress: 7 },
      },
      {
        type: 'score',
        platform: 'anilist',
        payload: { animeId: SOURCE_ID, localAnimeId: `anilist_${SOURCE_ID}`, score: 8 },
      },
      {
        type: 'add',
        platform: 'myanimelist',
        payload: { animeId: MAL_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'progress',
        platform: 'myanimelist',
        payload: { animeId: MAL_ID, localAnimeId: `anilist_${SOURCE_ID}`, progress: 7 },
      },
      {
        type: 'score',
        platform: 'myanimelist',
        payload: { animeId: MAL_ID, localAnimeId: `anilist_${SOURCE_ID}`, score: 8 },
      },
      {
        type: 'add',
        platform: 'annict',
        payload: { animeId: ANNICT_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'add',
        platform: 'bangumi',
        payload: { animeId: BANGUMI_ID, localAnimeId: `anilist_${SOURCE_ID}`, status: 'watching' },
      },
      {
        type: 'score',
        platform: 'bangumi',
        payload: { animeId: BANGUMI_ID, localAnimeId: `anilist_${SOURCE_ID}`, score: 8 },
      },
    ]);
    expect(annictProvider.updateProgress).not.toHaveBeenCalled();
    expect(bangumiProvider.updateProgress).not.toHaveBeenCalled();
  });

  it('does not resolve by title and only writes scores to supported platforms', async () => {
    await multiPlatformSyncService.syncLocalChanges(item(), { score: 8 });

    expect(queued.map(({ type, platform, payload }) => ({ type, platform, payload }))).toEqual([
      {
        type: 'score',
        platform: 'anilist',
        payload: { animeId: SOURCE_ID, localAnimeId: `anilist_${SOURCE_ID}`, score: 8 },
      },
      {
        type: 'score',
        platform: 'myanimelist',
        payload: { animeId: MAL_ID, localAnimeId: `anilist_${SOURCE_ID}`, score: 8 },
      },
      {
        type: 'score',
        platform: 'bangumi',
        payload: { animeId: BANGUMI_ID, localAnimeId: `anilist_${SOURCE_ID}`, score: 8 },
      },
    ]);
    expect(annictProvider.updateScore).not.toHaveBeenCalled();
    expect(anilistProvider.updateScore).toHaveBeenCalledWith(SOURCE_ID, 8, 'test-token');
    expect(malProvider.updateScore).toHaveBeenCalledWith(MAL_ID, 8, 'test-token');
    expect(bangumiProvider.updateScore).toHaveBeenCalledWith(BANGUMI_ID, 8, 'test-token');

    queued.length = 0;
    spyOn(offlineQueueService, 'drain').mockResolvedValue({
      processed: 0, succeeded: 0, failed: 0, failedByPlatform: {}, dead: 0, deadByPlatform: {},
    });
    await multiPlatformSyncService.syncLocalChanges(item('810099'), { status: 'dropped' });
    expect(queued.filter((job) => job.payload.unresolvedPlatformIds)).toHaveLength(3);
  });

  it('clears scores only on providers with an explicit clearing implementation', async () => {
    await multiPlatformSyncService.syncLocalChanges(item(), { score: null });

    expect(queued.map(({ type, platform }) => ({ type, platform }))).toEqual([
      { type: 'score-clear', platform: 'anilist' },
      { type: 'score-clear', platform: 'myanimelist' },
      { type: 'score-clear', platform: 'bangumi' },
    ]);
    expect(anilistProvider.clearScore).toHaveBeenCalledWith(SOURCE_ID, 'test-token');
    expect(malProvider.clearScore).toHaveBeenCalledWith(MAL_ID, 'test-token');
    expect(bangumiProvider.clearScore).toHaveBeenCalledWith(BANGUMI_ID, 'test-token');
  });

  it('saves an untrack and queues unresolved removal when mapping is unavailable', async () => {
    const anime = item('810099');
    spyOn(authService, 'getConnectedPlatforms').mockReturnValue(['myanimelist']);
    spyOn(offlineQueueService, 'drain').mockResolvedValue({ processed: 0, succeeded: 0, failed: 0, failedByPlatform: {}, dead: 0, deadByPlatform: {} });
    spyOn(offlineQueueService, 'enqueueBatchWithMutation').mockImplementation(async (jobs, mutate) => {
      await mutate({ runAsync: async () => ({ changes: 1 }) } as unknown as SQLite.SQLiteDatabase);
      queued.push(...jobs);
    });
    let removed = false;
    await multiPlatformSyncService.removeLocalTracking(anime, async () => { removed = true; });
    expect(removed).toBe(true);
    expect(queued).toContainEqual({ type: 'remove', platform: 'myanimelist', payload: { animeId: `unresolved:${anime.id}`, localAnimeId: anime.id, unresolvedPlatformIds: anime.platformIds } });
  });

  it('removes locally and queues deletes only for providers with safe list-removal semantics', async () => {
    const events: string[] = [];
    const anime = item();
    anime.platformIds.bangumi = BANGUMI_ID;
    anime.platformIds.simkl = '810008';
    spyOn(authService, 'getConnectedPlatforms').mockReturnValue(['anilist', 'bangumi', 'simkl']);
    spyOn(anilistProvider, 'removeFromList').mockResolvedValue(undefined);

    const tx = {
      getFirstAsync: async () => null,
      getAllAsync: async () => [],
      runAsync: async (sql: string, ...params: unknown[]) => {
        if (sql.includes('INSERT INTO sync_jobs')) {
          events.push('queue');
          queued.push({
            type: params[0] as SyncJob['jobType'],
            platform: params[1] as PlatformType,
            payload: JSON.parse(String(params[2])) as SyncJob['payload'],
          });
        } else {
          events.push('local');
        }
        return { changes: 1, lastInsertRowId: queued.length };
      },
    } as unknown as SQLite.SQLiteDatabase;
    const fakeDb = {
      getFirstAsync: async () => null,
      getAllAsync: async () => [],
      runAsync: async () => ({ changes: 1, lastInsertRowId: 1 }),
      withExclusiveTransactionAsync: async (
        work: (transaction: SQLite.SQLiteDatabase) => Promise<void>
      ) => {
        events.push('begin');
        await work(tx);
        events.push('commit');
      },
    } as unknown as Awaited<ReturnType<typeof LocalDB.getDatabase>>;
    spyOn(LocalDB, 'getDatabase').mockResolvedValue(fakeDb);

    await multiPlatformSyncService.removeLocalTracking(anime, async (transaction) => {
      await transaction.runAsync('DELETE FROM user_anime WHERE anime_id = ?', anime.id);
    });

    expect(events[0]).toBe('begin');
    expect(events[events.length - 1]).toBe('commit');
    expect(queued.map(({ type, platform }) => ({ type, platform }))).toEqual([
      { type: 'remove', platform: 'anilist' },
    ]);
  });

  it('cancels stale remove jobs when re-tracking through a platform alias', async () => {
    const tombstone = {
      anime_id: 'mal_810002',
      platform_ids: JSON.stringify({ anilist: SOURCE_ID, myanimelist: MAL_ID }),
    };
    const staleRemove = {
      id: 55,
      platform: 'myanimelist',
      payload: JSON.stringify({ animeId: MAL_ID, localAnimeId: tombstone.anime_id }),
    };
    const statements: { sql: string; params: unknown[] }[] = [];
    spyOn(offlineQueueService, 'mutateWithJobs').mockImplementation(async (mutate) => {
      await mutate({
        getAllAsync: async (sql: string) => sql.includes('tracking_tombstones') ? [tombstone] : [staleRemove],
        runAsync: async (sql: string, ...params: unknown[]) => {
          statements.push({ sql, params });
          return { changes: 1, lastInsertRowId: 1 };
        },
      } as unknown as SQLite.SQLiteDatabase);
      return [];
    });
    spyOn(offlineQueueService, 'drain').mockResolvedValue({
      processed: 0, succeeded: 0, failed: 0, failedByPlatform: {}, dead: 0, deadByPlatform: {},
    });

    await multiPlatformSyncService.syncLocalMutation(item(), async () => ({ changes: {} }));

    expect(statements.some(({ sql, params }) => sql.includes('DELETE FROM sync_jobs') && params[0] === 55)).toBe(true);
    expect(statements.some(({ sql, params }) => sql.includes('DELETE FROM tracking_tombstones') && params[0] === tombstone.anime_id)).toBe(true);
  });

  it('derives only known platform IDs and keeps score scales explicit', () => {
    expect(platformIdsForLocalAnimeId('387')).toEqual({ anilist: '387' });
    expect(platformIdsForLocalAnimeId('mal_9001')).toEqual({ myanimelist: '9001' });
    expect(platformIdsForLocalAnimeId('same title')).toEqual({});
    expect(platformIdsForLocalAnimeId('anilist_0')).toEqual({});
    expect(localScoreToProviderScore(80)).toBe(8);
    expect(localScoreToProviderScore(0)).toBeUndefined();
  });

  it('selects only changed tracking fields and converts local scores to provider scale', () => {
    expect(
      changedLocalAnimeFields(
        { status: 'on_hold', progress: 6, score: 60 },
        { status: 'watching', progress: 6, score: 60 }
      )
    ).toEqual({ status: 'watching' });
    expect(
      changedLocalAnimeFields(
        { status: 'watching', progress: 6, score: 60 },
        { status: 'watching', progress: 6, score: 85 }
      )
    ).toEqual({ score: 8.5 });
    expect(
      changedLocalAnimeFields(
        { status: 'watching', progress: 6, score: 60 },
        { status: 'watching', progress: 7, score: 60 }
      )
    ).toEqual({ progress: 7 });
    expect(
      changedLocalAnimeFields(
        { status: 'watching', progress: 6, score: 60 },
        { status: 'watching', progress: 0, score: 60 }
      )
    ).toEqual({ progress: 0 });
  });

  it('preserves a zero score as an explicit clear request', () => {
    expect(
      changedLocalAnimeFields(
        { status: 'watching', progress: 6, score: 60 },
        { status: 'watching', progress: 6, score: 0 }
      )
    ).toEqual({ score: null });
  });
});

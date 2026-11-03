import { afterEach, expect, it, mock, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { LocalDB } from '../../../libs/db';
import { authService } from '../../../libs/services/auth/auth-service';
import { anilistProvider } from '../../../libs/services/providers/anilist-provider';
import { multiPlatformSyncService } from '../../../libs/services/sync/multi-platform-sync-service';
import { offlineQueueService } from '../../../libs/services/sync/offline-queue-service';
import { idMappingService } from '../../../libs/services/sync/id-mapping-service';
import type * as SQLite from 'expo-sqlite';

it('persists pulls while protecting dirty fields and reports unidentifiable entries', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE user_anime (anime_id TEXT PRIMARY KEY, title TEXT, image_url TEXT, status TEXT NOT NULL, score INTEGER, progress INTEGER, total_episodes INTEGER, started_at INTEGER, completed_at INTEGER, notes TEXT, rewatch_count INTEGER, updated_at INTEGER);
    CREATE TABLE tracking_tombstones (anime_id TEXT PRIMARY KEY, platform_ids TEXT, created_at INTEGER);
    CREATE TABLE sync_dirty_records (anime_id TEXT, platform TEXT, field TEXT, marked_at INTEGER);
    CREATE TABLE sync_jobs (job_type TEXT, platform TEXT, payload TEXT, state TEXT, updated_at INTEGER);`);
  sqlite.run(
    "INSERT INTO user_anime (anime_id, status, progress, score, notes) VALUES ('123', 'watching', 9, 80, 'keep')"
  );
  sqlite.run("INSERT INTO sync_dirty_records VALUES ('123', 'anilist', 'progress', 1)");
  sqlite.run("INSERT INTO sync_jobs VALUES ('remove', 'anilist', ?, 'pending', ?)", [
    JSON.stringify({ animeId: '456', localAnimeId: '12345' }),
    Date.now(),
  ]);
  const tx = {
    getAllAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).all(...args),
    getFirstAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).get(...args) ?? null,
    runAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).run(...args),
  };
  const db = {
    ...tx,
    withExclusiveTransactionAsync: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  };
  spyOn(LocalDB, 'getDatabase').mockResolvedValue(db as unknown as SQLite.SQLiteDatabase);
  spyOn(authService, 'initialize').mockResolvedValue(undefined);
  spyOn(authService, 'getConnectedPlatforms').mockReturnValue(['anilist']);
  spyOn(authService, 'getValidCredentials').mockResolvedValue({
    platform: 'anilist',
    token: { accessToken: 'token', tokenType: 'Bearer' },
    connectedAt: new Date(),
  });
  spyOn(anilistProvider, 'fetchUserList').mockResolvedValue([
    {
      id: 'anilist_123',
      platformIds: { anilist: '123' },
      title: 'Existing',
      imageUrl: '',
      status: 'completed',
      progress: 2,
      score: 7,
      updatedAt: new Date('2026-01-01'),
      source: 'anilist',
    },
    {
      id: 'anilist_456',
      platformIds: { anilist: '456' },
      title: 'New',
      imageUrl: '',
      status: 'watching',
      progress: 3,
      score: 8,
      updatedAt: new Date('2026-01-01'),
      source: 'anilist',
    },
    {
      id: 'unknown',
      platformIds: {},
      title: 'Unknown',
      imageUrl: '',
      status: 'watching',
      progress: 1,
      updatedAt: new Date('2026-01-01'),
      source: 'anilist',
    },
  ]);
  spyOn(idMappingService, 'mapAllPlatforms').mockResolvedValue({});
  spyOn(offlineQueueService, 'drain').mockResolvedValue({
    processed: 0,
    succeeded: 0,
    failed: 0,
    failedByPlatform: {},
    dead: 0,
    deadByPlatform: {},
  });
  spyOn(offlineQueueService, 'getOutstandingByPlatform').mockResolvedValue({});
  const result = await multiPlatformSyncService.syncAll();
  expect(
    sqlite
      .query('SELECT status, progress, score, notes FROM user_anime WHERE anime_id = ?')
      .get('123')
  ).toEqual({ status: 'completed', progress: 9, score: 70, notes: 'keep' });
  expect(
    sqlite.query('SELECT score FROM user_anime WHERE anime_id = ?').get('anilist_456')
  ).toBeNull();
  expect(result.errors.some((error) => error.error.includes('Pending local removal'))).toBe(true);
  expect(result.errors.some((error) => error.platform === 'anilist')).toBe(true);
  sqlite.close();
});
it('fails closed when an ID mapping is unavailable across a tombstone alias', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE user_anime (anime_id TEXT PRIMARY KEY, title TEXT, image_url TEXT, status TEXT, score INTEGER, progress INTEGER, total_episodes INTEGER, updated_at INTEGER);
    CREATE TABLE tracking_tombstones (anime_id TEXT PRIMARY KEY, platform_ids TEXT, created_at INTEGER);
    CREATE TABLE sync_dirty_records (anime_id TEXT, platform TEXT, field TEXT, marked_at INTEGER);
    CREATE TABLE sync_jobs (job_type TEXT, platform TEXT, payload TEXT, state TEXT, updated_at INTEGER);`);
  sqlite.run('INSERT INTO tracking_tombstones VALUES (?, ?, ?)', [
    'mal_42', JSON.stringify({ myanimelist: '42' }), 1,
  ]);
  const tx = {
    getAllAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).all(...args),
    runAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).run(...args),
  };
  spyOn(LocalDB, 'getDatabase').mockResolvedValue({
    ...tx,
    withExclusiveTransactionAsync: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  } as unknown as SQLite.SQLiteDatabase);
  spyOn(idMappingService, 'mapID').mockResolvedValue(null);
  const item = {
    id: 'anilist_123', platformIds: { anilist: '123' }, title: 'Unmapped', imageUrl: '',
    status: 'watching' as const, progress: 1, updatedAt: new Date(100), source: 'anilist' as const,
  };
  const errors: { platform: string; error: string }[] = [];
  await (multiPlatformSyncService as any).persistPulledItems([item], errors, 100, new Map());
  expect(sqlite.query('SELECT anime_id FROM user_anime').all()).toEqual([]);
  expect(errors.some((error) => error.error.includes('Local removal'))).toBe(true);
  sqlite.close();
});


it('protects completed edits after the snapshot and imports nonconflicting fields', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE user_anime (anime_id TEXT PRIMARY KEY, title TEXT, image_url TEXT, status TEXT, score INTEGER, progress INTEGER, total_episodes INTEGER, updated_at INTEGER);
    CREATE TABLE tracking_tombstones (anime_id TEXT PRIMARY KEY, platform_ids TEXT, created_at INTEGER);
    CREATE TABLE sync_dirty_records (anime_id TEXT, platform TEXT, field TEXT, marked_at INTEGER);
    CREATE TABLE sync_jobs (job_type TEXT, platform TEXT, payload TEXT, state TEXT, updated_at INTEGER);`);
  sqlite.run("INSERT INTO user_anime VALUES ('123', 'Old', '', 'watching', 80, 9, NULL, 1)");
  sqlite.run("INSERT INTO sync_jobs VALUES ('progress', 'anilist', ?, 'done', 101)", [
    JSON.stringify({ animeId: '123', localAnimeId: '123' }),
  ]);
  const tx = {
    getAllAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).all(...args),
    runAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).run(...args),
  };
  spyOn(LocalDB, 'getDatabase').mockResolvedValue({
    ...tx,
    withExclusiveTransactionAsync: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  } as unknown as SQLite.SQLiteDatabase);
  const item = {
    id: 'anilist_123',
    platformIds: { anilist: '123' },
    title: 'New',
    imageUrl: '',
    status: 'completed' as const,
    progress: 2,
    score: 5,
    updatedAt: new Date(100),
    source: 'anilist' as const,
  };
  const persist = (multiPlatformSyncService as any).persistPulledItems.bind(
    multiPlatformSyncService
  );
  await persist([item], [], 100, new Map([[item, ['score']]]));
  expect(sqlite.query('SELECT title, status, progress, score FROM user_anime').get()).toEqual({
    title: 'New',
    status: 'completed',
    progress: 9,
    score: 80,
  });
  sqlite.close();
});

it('imports an ID-matched group despite a field conflict', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(
    `CREATE TABLE sync_conflicts (id INTEGER PRIMARY KEY, anime_id TEXT, field TEXT, values_json TEXT, detected_at INTEGER);`
  );
  spyOn(LocalDB, 'getDatabase').mockResolvedValue({
    runAsync: async (sql: string, ...args: any[]) => {
      const result = sqlite.query(sql).run(...args);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: result.changes };
    },
  } as unknown as SQLite.SQLiteDatabase);
  spyOn(idMappingService, 'mapAllPlatforms').mockResolvedValue({});
  const base = {
    id: 'anilist_123',
    platformIds: { anilist: '123' },
    title: 'Shared',
    imageUrl: '',
    progress: 4,
    score: 7,
    updatedAt: new Date(100),
    source: 'anilist' as const,
  };
  const result = await multiPlatformSyncService.mergeItems([
    { ...base, status: 'watching' },
    {
      ...base,
      id: 'mal_456',
      source: 'myanimelist',
      platformIds: { anilist: '123', myanimelist: '456' },
      status: 'completed',
    },
  ]);
  expect(result.safeToPersist).toHaveLength(1);
  expect(result.unsafeToPersist).toHaveLength(0);
  expect(result.conflictIds).toHaveLength(1);
  expect(result.conflictFields.get(result.safeToPersist[0])).toEqual(['status']);
  sqlite.close();
});

it('keeps tombstoned and unidentifiable remote items out while allowing distinct IDs', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE user_anime (anime_id TEXT PRIMARY KEY, title TEXT, image_url TEXT, status TEXT, score INTEGER, progress INTEGER, total_episodes INTEGER, updated_at INTEGER);
    CREATE TABLE tracking_tombstones (anime_id TEXT PRIMARY KEY, platform_ids TEXT, created_at INTEGER);
    CREATE TABLE sync_dirty_records (anime_id TEXT, platform TEXT, field TEXT, marked_at INTEGER);
    CREATE TABLE sync_jobs (job_type TEXT, platform TEXT, payload TEXT, state TEXT, updated_at INTEGER);`);
  sqlite.run('INSERT INTO tracking_tombstones VALUES (?, ?, ?)', [
    '123',
    JSON.stringify({ anilist: '123' }),
    1,
  ]);
  sqlite.run('INSERT INTO tracking_tombstones VALUES (?, ?, ?)', [
    'anilist_999',
    JSON.stringify({ anilist: '999' }),
    2,
  ]);
  const tx = {
    getAllAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).all(...args),
    runAsync: async (sql: string, ...args: any[]) => sqlite.query(sql).run(...args),
  };
  spyOn(LocalDB, 'getDatabase').mockResolvedValue({
    ...tx,
    withExclusiveTransactionAsync: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  } as unknown as SQLite.SQLiteDatabase);
  spyOn(idMappingService, 'mapID').mockImplementation(async (_from, fromId, to) =>
    String(fromId) === '99' && to === 'anilist' ? '999' : String(fromId)
  );
  const base = {
    title: 'Title',
    imageUrl: '',
    status: 'watching' as const,
    progress: 0,
    updatedAt: new Date(100),
  };
  const items = [
    { ...base, id: 'anilist_123', source: 'anilist' as const, platformIds: { anilist: '123' } },
    { ...base, id: 'mal_42', source: 'myanimelist' as const, platformIds: { myanimelist: '42' } },
    { ...base, id: 'anilist_456', source: 'anilist' as const, platformIds: { anilist: '456' } },
    { ...base, id: 'mal_99', source: 'myanimelist' as const, platformIds: { myanimelist: '99' } },
    { ...base, id: 'unknown', source: 'anilist' as const, platformIds: {} },
  ];
  const errors: { platform: string; error: string }[] = [];
  await (multiPlatformSyncService as any).persistPulledItems(items, errors, 100, new Map());
  expect(sqlite.query('SELECT anime_id FROM user_anime ORDER BY anime_id').all()).toEqual([
    { anime_id: 'anilist_456' },
    { anime_id: 'mal_42' },
  ]);
  expect(errors).toHaveLength(3);
  expect(errors.some((error) => error.error.includes('Local removal'))).toBe(true);
  expect(errors.some((error) => error.error.includes('Cannot identify pulled item'))).toBe(true);
  sqlite.close();
});

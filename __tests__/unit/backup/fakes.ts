// Hand-rolled in-memory fakes for the backup-service tests.
//
// The shared test-setup FakeDatabase only handles the `cache` and
// `pilgrimage_spots` tables. BackupService touches favorites / ratings /
// user_anime / collection_folders / collection_folder_items, so we inject a
// purpose-built fake instead of expanding the shared shim.

import type { SQLiteDatabase } from 'expo-sqlite';

type Row = Record<string, unknown>;

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export interface FakeDb {
  tables: {
    favorites: Map<string, Row>;
    ratings: Map<string, Row>;
    user_anime: Map<string, Row>;
    collection_folders: Map<string, Row>;
    collection_folder_items: Map<string, Row>; // key = `${folder_id}#${anime_id}`
  };
  handle(): SQLiteDatabase;
}

export function makeFakeStorage(): { handle: AsyncStorageLike; store: Map<string, string> } {
  const store = new Map<string, string>();
  const handle: AsyncStorageLike = {
    async getItem(k) {
      return store.get(k) ?? null;
    },
    async setItem(k, v) {
      store.set(k, v);
    },
    async removeItem(k) {
      store.delete(k);
    },
  };
  return { handle, store };
}

export function makeFakeDb(): FakeDb {
  const tables: FakeDb['tables'] = {
    favorites: new Map(),
    ratings: new Map(),
    user_anime: new Map(),
    collection_folders: new Map(),
    collection_folder_items: new Map(),
  };

  const handle = {
    async execAsync(_sql: string): Promise<void> {
      // BEGIN / COMMIT / CREATE TABLE etc. — no-op in the fake.
    },
    async runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
      return run(tables, sql, params);
    },
    async getAllAsync<T>(sql: string, ..._params: unknown[]): Promise<T[]> {
      return selectAll(tables, sql) as unknown as T[];
    },
    async getFirstAsync<T>(sql: string, ..._params: unknown[]): Promise<T | null> {
      const rows = selectAll(tables, sql);
      return (rows[0] as unknown as T) ?? null;
    },
    async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
      await fn();
    },
  };

  return {
    tables,
    handle: () => handle as unknown as SQLiteDatabase,
  };
}

function selectAll(tables: FakeDb['tables'], sql: string): Row[] {
  const upper = sql.trim().toUpperCase();
  if (upper.includes('FROM FAVORITES')) return [...tables.favorites.values()];
  if (upper.includes('FROM RATINGS')) return [...tables.ratings.values()];
  if (upper.includes('FROM USER_ANIME')) return [...tables.user_anime.values()];
  if (upper.includes('FROM COLLECTION_FOLDERS')) return [...tables.collection_folders.values()];
  if (upper.includes('FROM COLLECTION_FOLDER_ITEMS'))
    return [...tables.collection_folder_items.values()];
  return [];
}

function run(
  tables: FakeDb['tables'],
  sql: string,
  params: unknown[]
): { changes: number } {
  const upper = sql.trim().toUpperCase();

  if (upper.startsWith('INSERT OR REPLACE INTO FAVORITES')) {
    const [id, title, image, addedAt] = params as [string, string, string, number];
    tables.favorites.set(id, { id, title, image, addedAt });
    return { changes: 1 };
  }
  if (upper.startsWith('INSERT OR REPLACE INTO RATINGS')) {
    const [id, rating, timestamp] = params as [string, string, number];
    tables.ratings.set(id, { id, rating, timestamp });
    return { changes: 1 };
  }
  if (upper.startsWith('INSERT OR REPLACE INTO USER_ANIME')) {
    const [
      anime_id,
      title,
      image_url,
      status,
      score,
      progress,
      total_episodes,
      started_at,
      completed_at,
      updated_at,
    ] = params as unknown[];
    tables.user_anime.set(String(anime_id), {
      anime_id,
      title,
      image_url,
      status,
      score,
      progress,
      total_episodes,
      started_at,
      completed_at,
      updated_at,
    });
    return { changes: 1 };
  }
  if (upper.startsWith('INSERT OR REPLACE INTO COLLECTION_FOLDERS')) {
    const [id, name, icon, type, is_shared, is_r18, created_at] = params as unknown[];
    tables.collection_folders.set(String(id), {
      id,
      name,
      icon,
      type,
      is_shared,
      is_r18,
      created_at,
    });
    return { changes: 1 };
  }
  if (upper.startsWith('INSERT OR REPLACE INTO COLLECTION_FOLDER_ITEMS')) {
    const [folder_id, anime_id, added_at] = params as unknown[];
    tables.collection_folder_items.set(`${folder_id}#${anime_id}`, {
      folder_id,
      anime_id,
      added_at,
    });
    return { changes: 1 };
  }

  return { changes: 0 };
}

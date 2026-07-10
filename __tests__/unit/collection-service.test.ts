import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { LocalDB } from '../../libs/db';
import { collectionService } from '../../libs/services/collection/collection-service';

afterEach(() => {
  mock.restore();
});

/** Stub LocalDB.getDatabase; capture every SQL passed to getAllAsync. */
function stubDb() {
  const sqls: string[] = [];
  const db = {
    getAllAsync: async (sql: string) => {
      sqls.push(sql);
      return [{ anime_id: '1' }, { anime_id: '2' }];
    },
  };
  spyOn(LocalDB, 'getDatabase').mockResolvedValue(db as never);
  return { sqls };
}

/** Stub LocalDB.getDatabase; capture every SQL + args passed to runAsync. */
function stubRunDb() {
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = {
    runAsync: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      return {} as never;
    },
  };
  spyOn(LocalDB, 'getDatabase').mockResolvedValue(db as never);
  return { calls };
}

describe('collectionService.getFolderItems ordering', () => {
  it('orders a system status folder by updated_at DESC', async () => {
    const { sqls } = stubDb();
    await collectionService.getFolderItems('system_watching');
    expect(sqls[0]).toContain('WHERE status = ?');
    expect(sqls[0]).toContain('ORDER BY COALESCE(updated_at, 0) DESC');
  });

  it('orders system_all by updated_at DESC', async () => {
    const { sqls } = stubDb();
    await collectionService.getFolderItems('system_all');
    expect(sqls[0]).toContain('FROM user_anime');
    expect(sqls[0]).toContain('ORDER BY COALESCE(updated_at, 0) DESC');
  });

  it('keeps custom folders ordered by added_at DESC', async () => {
    const { sqls } = stubDb();
    await collectionService.getFolderItems('some-custom-uuid');
    expect(sqls[0]).toContain('ORDER BY added_at DESC');
  });
});

describe('collectionService.getFolders system_all label', () => {
  it('labels system_all with folderType "all" (not the mislabelled "watching")', async () => {
    spyOn(LocalDB, 'getDatabase').mockResolvedValue({
      getAllAsync: async () => [],
      getFirstAsync: async () => ({ count: 0 }),
    } as never);
    const folders = await collectionService.getFolders();
    const all = folders.find((f) => f.id === 'system_all');
    expect(all?.folderType).toBe('all');
  });
});

describe('collectionService.updateFolder / createCustomFolder — is_shared', () => {
  it('updateFolder without isShared never touches is_shared (no clobbering dormant column)', async () => {
    const { calls } = stubRunDb();
    await collectionService.updateFolder('some-folder-id', { name: 'x' });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).not.toContain('is_shared');
    expect(calls[0].sql).toContain('name = ?');
  });

  it('updateFolder still writes is_shared when explicitly provided', async () => {
    const { calls } = stubRunDb();
    await collectionService.updateFolder('some-folder-id', { isShared: true });
    expect(calls[0].sql).toContain('is_shared = ?');
  });

  it('createCustomFolder without isShared still writes is_shared 0 (service default)', async () => {
    const { calls } = stubRunDb();
    // Mirrors the CreateFolderModal call site, which now passes `data.isShared`
    // as `undefined` (field omitted) — the service default must still apply.
    await collectionService.createCustomFolder('My Folder', 'folder', undefined, false);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('is_shared');
    // is_shared is the 5th bound value: id, name, icon, type, is_shared, is_r18, created_at
    expect(calls[0].args[4]).toBe(0);
  });
});

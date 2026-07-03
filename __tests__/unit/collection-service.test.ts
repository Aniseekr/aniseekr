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

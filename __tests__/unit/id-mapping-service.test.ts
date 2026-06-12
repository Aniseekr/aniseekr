import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import { IDMappingService } from '../../libs/services/sync/id-mapping-service';
import { LocalDB } from '../../libs/db';

describe('IDMappingService', () => {
  beforeEach(() => {
    IDMappingService.__resetForTests();
  });

  it('IDM-001 MAL to AniList path returns mapped ID for known mapping', async () => {
    const svc = IDMappingService.getInstance();
    // Seed a manual override that simulates the downloaded mapping table.
    svc.setManualMapping('myanimelist', 1, 'anilist', 1);
    const mapped = await svc.mapID('myanimelist', 1, 'anilist');
    expect(mapped).toBe('1');
  });

  it('IDM-002 unknown id returns null', async () => {
    const svc = IDMappingService.getInstance();
    const mapped = await svc.mapID('myanimelist', 999_999_999, 'anilist');
    expect(mapped).toBeNull();
  });

  it('IDM-003 same platform passthrough returns the original id', async () => {
    const svc = IDMappingService.getInstance();
    const mapped = await svc.mapID('anilist', 12345, 'anilist');
    expect(mapped).toBe(12345);
    // Also via the typed `translate` alias.
    const mapped2 = await svc.translate(12345, 'anilist', 'anilist');
    expect(mapped2).toBe(12345);
  });

  it('IDM-004 manual mapping persists and is retrievable', async () => {
    const svc = IDMappingService.getInstance();
    svc.setManualMapping('bangumi', 7157, 'myanimelist', 12189);
    expect(svc.getManualMapping('bangumi', 7157, 'myanimelist')).toBe('12189');
    const mapped = await svc.mapID('bangumi', 7157, 'myanimelist');
    expect(mapped).toBe('12189');
  });

  it('IDM-005 Bangumi to MAL path returns mapped ID when mapping exists', async () => {
    const svc = IDMappingService.getInstance();
    svc.setManualMapping('bangumi', 7157, 'myanimelist', 12189);
    const mapped = await svc.mapID('bangumi', 7157, 'myanimelist');
    expect(mapped).toBe('12189');
  });

  it('IDM-007 maps to shikimori via mal_id when shikimori_id column is empty', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      shikimori_id: null,
      mal_id: 5114,
    } as never);
    const mapped = await svc.mapID('anilist', 5114, 'shikimori');
    expect(mapped).toBe('5114');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('IDM-008 explicit shikimori_id wins over the mal alias', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      shikimori_id: 999,
      mal_id: 5114,
    } as never);
    const mapped = await svc.mapID('anilist', 5114, 'shikimori');
    expect(mapped).toBe('999');
    spy.mockRestore();
  });

  it('IDM-009 maps from shikimori by falling back to the mal_id column', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync')
      .mockResolvedValueOnce(null as never) // WHERE shikimori_id = ? → no row
      .mockResolvedValueOnce({ anilist_id: 5114 } as never); // WHERE mal_id = ?
    const mapped = await svc.mapID('shikimori', 5114, 'anilist');
    expect(mapped).toBe(5114);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('IDM-010 mapAllPlatforms aliases shikimori from mal_id', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      mal_id: 5114,
      anilist_id: 5114,
      kitsu_id: null,
      bangumi_id: null,
      shikimori_id: null,
      simkl_id: null,
      annict_id: null,
    } as never);
    const all = await svc.mapAllPlatforms('anilist', '5114');
    expect(all.shikimori).toBe('5114');
    expect(all.myanimelist).toBe('5114');
    spy.mockRestore();
  });

  it('IDM-011 getChineseTitleSource returns trimmed name_cn and stringified bangumi_id', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      name_cn: '  進擊的巨人 ',
      bangumi_id: 23686,
    } as never);
    const src = await svc.getChineseTitleSource('anilist', '16498');
    expect(src).toEqual({ nameCn: '進擊的巨人', bangumiId: '23686' });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('IDM-012 getChineseTitleSource nullifies empty fields and missing rows', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync')
      .mockResolvedValueOnce({ name_cn: '', bangumi_id: null } as never)
      .mockResolvedValueOnce(null as never);
    expect(await svc.getChineseTitleSource('anilist', '1')).toEqual({
      nameCn: null,
      bangumiId: null,
    });
    expect(await svc.getChineseTitleSource('anilist', '2')).toBeNull();
    spy.mockRestore();
  });

  it('IDM-013 getChineseTitleSource honors a manual bangumi override', async () => {
    const svc = IDMappingService.getInstance();
    svc.setManualMapping('anilist', 16498, 'bangumi', 99999);
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue({
      name_cn: null,
      bangumi_id: 23686,
    } as never);
    const src = await svc.getChineseTitleSource('anilist', '16498');
    expect(src?.bangumiId).toBe('99999');
    spy.mockRestore();
  });

  it('IDM-014 getChineseTitleSource uses the id itself for bangumi-platform items', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const spy = spyOn(db, 'getFirstAsync').mockResolvedValue(null as never);
    const src = await svc.getChineseTitleSource('bangumi', '23686');
    expect(src).toEqual({ nameCn: null, bangumiId: '23686' });
    spy.mockRestore();
  });

  it('IDM-015 bulkInsert writes name_cn through the prepared statement', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const captured: unknown[][] = [];
    let preparedSql = '';
    // bulkInsert runs against the tx handed to withExclusiveTransactionAsync
    // (the raw db, not the LocalDB wrapper), so inject a fake tx instead of
    // spying prepareAsync on the wrapper.
    const fakeTx = {
      execAsync: async () => {},
      prepareAsync: async (sql: string) => {
        preparedSql = sql;
        return {
          executeAsync: async (params: unknown[]) => {
            captured.push(params as unknown[]);
            return { changes: 1, lastInsertRowId: 0 };
          },
          finalizeAsync: async () => {},
        };
      },
    };
    const spy = spyOn(db, 'withExclusiveTransactionAsync').mockImplementation((async (
      fn: (tx: typeof fakeTx) => Promise<void>
    ) => {
      await fn(fakeTx);
    }) as never);
    await svc.bulkInsert([{ mal_id: 1, bangumi_id: 2, name_cn: '葬送的芙莉蓮' }]);
    expect(preparedSql).toContain('name_cn');
    expect(captured[0]).toContain('葬送的芙莉蓮');
    spy.mockRestore();
  });

  it('IDM-006 bulk insert wraps in a single exclusive transaction', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const txSpy = spyOn(db, 'withExclusiveTransactionAsync');
    await svc.bulkInsert([
      { mal_id: 1, anilist_id: 11 },
      { mal_id: 2, anilist_id: 22 },
      { mal_id: 3, anilist_id: 33 },
    ]);
    expect(txSpy).toHaveBeenCalledTimes(1);
    txSpy.mockRestore();
  });
});

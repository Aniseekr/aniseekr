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

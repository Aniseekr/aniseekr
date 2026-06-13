// Legacy import — see note on the same import in anitabi-data-service.ts.
import * as FileSystem from 'expo-file-system/legacy';
import { LocalDB } from '../../db';
import type { PlatformType } from '../auth/types';

// Hosted in the public Aniseekr-source companion repo. This expo repo is
// private; private-repo release assets reject unauthenticated downloads, so
// the build pipeline lives there. Stable alias tag — weekly snapshots are
// at mapping-data-YYYY-WW in the same repo for rollback.
const MAPPING_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/mapping-data/anime-id-mappings-merged.json';

/**
 * How long an on-device mapping is considered fresh. Mappings are rebuilt by
 * CI daily but the on-disk copy doesn't need to be refreshed that often — the
 * underlying upstream lists change slowly. 14 days keeps cold-launch fast and
 * caps cellular data usage at ~2 fetches/month.
 */
const FRESHNESS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// Lock-step: libs/db.ts's name_cn migration deletes this row by string
// literal (importing it there would invert the db → services layering).
// Renaming this value requires updating that literal in the same change.
const META_KEY_LAST_UPDATE = 'lastUpdatedAt';

interface AnimeMapping {
  mal_id?: number;
  anilist_id?: number;
  kitsu_id?: number;
  bangumi_id?: number;
  shikimori_id?: number;
  simkl_id?: number;
  annict_id?: number;
  anidb_id?: number;
  thetvdb_id?: number;
  themoviedb_id?: number;
  livechart_id?: number;
  // Both legacy (Fribb) and merged-script (snake_case) keys are accepted.
  'anime-planet_id'?: string;
  anime_planet_id?: string;
  anisearch_id?: number;
  'notify.moe_id'?: string;
  notify_moe_id?: string;
  type?: string;
  /** Official Chinese title joined from the Bangumi Archive dump (B1). */
  name_cn?: string;
}

const PLATFORM_TO_COLUMN: Partial<Record<PlatformType | string, string>> = {
  myanimelist: 'mal_id',
  anilist: 'anilist_id',
  kitsu: 'kitsu_id',
  bangumi: 'bangumi_id',
  shikimori: 'shikimori_id',
  simkl: 'simkl_id',
  annict: 'annict_id',
};

/**
 * Cross-platform anime ID translator.
 *
 * - SQLite-backed (table `id_mappings`) holds the mass-imported merged mapping
 *   list (Fribb × manami) downloaded from the `mapping-data` GitHub Release.
 * - `id_mappings_meta` records the last successful refresh so callers can
 *   short-circuit and avoid refetching on every launch.
 * - In-memory `manualOverrides` hold user-supplied corrections that take
 *   priority over the downloaded data.
 * - Same-source translations (`from === to`) short-circuit without a DB read.
 */
export class IDMappingService {
  private static instance: IDMappingService;

  /** key = `from:fromId:to`, value = mapped id (string for compatibility). */
  private readonly manualOverrides = new Map<string, string>();

  static getInstance(): IDMappingService {
    if (!IDMappingService.instance) {
      IDMappingService.instance = new IDMappingService();
    }
    return IDMappingService.instance;
  }

  /** Reset all in-memory state (used in tests). */
  static __resetForTests(): void {
    if (IDMappingService.instance) {
      IDMappingService.instance.manualOverrides.clear();
    }
    IDMappingService.instance = new IDMappingService();
  }

  /**
   * Download the upstream merged mapping list and replace the SQLite table
   * contents inside a single transaction. Short-circuits when the local copy
   * is younger than `FRESHNESS_WINDOW_MS`. Returns true when an import
   * actually ran (callers use this to flush stale title caches).
   */
  async updateMappings(): Promise<boolean> {
    const lastUpdate = await this.getLastUpdateTime();
    if (lastUpdate !== null && Date.now() - lastUpdate < FRESHNESS_WINDOW_MS) {
      return false;
    }

    const fs = FileSystem as unknown as {
      cacheDirectory?: string;
      downloadAsync(url: string, dest: string): Promise<{ status: number }>;
      readAsStringAsync(path: string): Promise<string>;
    };
    const cacheDir = fs.cacheDirectory;

    if (!cacheDir) {
      throw new Error('FileSystem cache directory not available');
    }
    const mappingFile = cacheDir + 'anime-mappings.json';

    const downloadRes = await fs.downloadAsync(MAPPING_URL, mappingFile);
    if (downloadRes.status !== 200) {
      throw new Error(`Failed to download mappings: ${downloadRes.status}`);
    }

    const fileContent = await fs.readAsStringAsync(mappingFile);
    const mappings: AnimeMapping[] = JSON.parse(fileContent);
    await this.bulkInsert(mappings);
    await this.setLastUpdateTime(Date.now());
    return true;
  }

  /**
   * Bulk-import mappings WITHOUT blocking readers.
   *
   * The previous implementation ran ~68k single-row inserts inside one
   * `withExclusiveTransactionAsync`, which serializes every other LocalDB
   * statement behind the import — on a forced refresh the home screen's
   * collection/pilgrimage queries stalled for the whole import (the
   * "cold-launch jank" bug). Now:
   *
   *   1. Rows land in `id_mappings_staging` via multi-row INSERTs (50 rows ×
   *      14 params = 700 bound vars, under every SQLite build's limit),
   *      grouped into plain transactions so other queries interleave.
   *      Readers keep hitting the OLD `id_mappings` the whole time — no
   *      empty/partial-table window for `mapID` to mis-read.
   *   2. A single short exclusive transaction atomically swaps the tables
   *      and recreates the indexes (transactional DDL — a failed swap rolls
   *      back to the old table).
   */
  async bulkInsert(mappings: AnimeMapping[]): Promise<void> {
    const db = await LocalDB.getDatabase();
    const ROWS_PER_STATEMENT = 50;
    const ROWS_PER_TX = 5000;

    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS id_mappings_staging (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mal_id INTEGER, anilist_id INTEGER, kitsu_id INTEGER, bangumi_id INTEGER,
        shikimori_id INTEGER, simkl_id INTEGER, annict_id INTEGER, thetvdb_id INTEGER,
        themoviedb_id INTEGER, livechart_id INTEGER, anime_planet_id TEXT,
        anisearch_id INTEGER, notify_moe_id TEXT, name_cn TEXT
      );
      DELETE FROM id_mappings_staging;`
    );

    const toParams = (m: AnimeMapping): (number | string | null)[] => [
      m.mal_id ?? null,
      m.anilist_id ?? null,
      m.kitsu_id ?? null,
      m.bangumi_id ?? null,
      m.shikimori_id ?? null,
      m.simkl_id ?? null,
      m.annict_id ?? null,
      m.thetvdb_id ?? null,
      m.themoviedb_id ?? null,
      m.livechart_id ?? null,
      m.anime_planet_id ?? m['anime-planet_id'] ?? null,
      m.anisearch_id ?? null,
      m.notify_moe_id ?? m['notify.moe_id'] ?? null,
      m.name_cn ?? null,
    ];
    const ROW_PLACEHOLDER = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

    for (let txStart = 0; txStart < mappings.length; txStart += ROWS_PER_TX) {
      const txRows = mappings.slice(txStart, txStart + ROWS_PER_TX);
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < txRows.length; i += ROWS_PER_STATEMENT) {
          const rows = txRows.slice(i, i + ROWS_PER_STATEMENT);
          await db.runAsync(
            `INSERT INTO id_mappings_staging (
              mal_id, anilist_id, kitsu_id, bangumi_id, shikimori_id, simkl_id, annict_id,
              thetvdb_id, themoviedb_id, livechart_id, anime_planet_id, anisearch_id,
              notify_moe_id, name_cn
            ) VALUES ${rows.map(() => ROW_PLACEHOLDER).join(', ')}`,
            ...rows.flatMap(toParams)
          );
        }
      });
    }

    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(
        `DROP TABLE IF EXISTS id_mappings;
        ALTER TABLE id_mappings_staging RENAME TO id_mappings;
        CREATE INDEX IF NOT EXISTS idx_mal_id ON id_mappings(mal_id);
        CREATE INDEX IF NOT EXISTS idx_anilist_id ON id_mappings(anilist_id);
        CREATE INDEX IF NOT EXISTS idx_kitsu_id ON id_mappings(kitsu_id);
        CREATE INDEX IF NOT EXISTS idx_bangumi_id ON id_mappings(bangumi_id);
        CREATE INDEX IF NOT EXISTS idx_shikimori_id ON id_mappings(shikimori_id);
        CREATE INDEX IF NOT EXISTS idx_simkl_id ON id_mappings(simkl_id);
        CREATE INDEX IF NOT EXISTS idx_annict_id ON id_mappings(annict_id);`
      );
    });
  }

  /**
   * Pin a manual override that wins over any downloaded mapping. Useful for
   * fixing one-off mismatches reported by users.
   */
  setManualMapping(
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string,
    toId: number | string
  ): void {
    const key = manualKey(fromPlatform, fromId, toPlatform);
    this.manualOverrides.set(key, String(toId));
  }

  /** Inspect a stored manual override (used by tests). */
  getManualMapping(
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string
  ): string | null {
    return this.manualOverrides.get(manualKey(fromPlatform, fromId, toPlatform)) ?? null;
  }

  /**
   * Translate an ID from one platform to another.
   *
   * Lookup order:
   *   1. Same source/target → return original.
   *   2. Manual override.
   *   3. SQLite mapping table.
   *
   * Returns `null` when no mapping exists.
   */
  async mapID(
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string
  ): Promise<string | number | null> {
    if (fromPlatform === toPlatform) return fromId;

    const manual = this.getManualMapping(fromPlatform, fromId, toPlatform);
    if (manual !== null) return manual;

    const fromCol = this.getColumnName(fromPlatform);
    const toCol = this.getColumnName(toPlatform);
    if (!fromCol || !toCol) return null;

    const db = await LocalDB.getDatabase();

    // Shikimori reuses MAL numeric IDs and our dataset doesn't carry a
    // dedicated shikimori_id (see 2026-06-12 title-localization spec), so the
    // alias lives here, once, for every caller.
    if (toPlatform === 'shikimori') {
      const row = await db.getFirstAsync<{
        shikimori_id: number | string | null;
        mal_id: number | string | null;
      }>(`SELECT shikimori_id, mal_id FROM id_mappings WHERE ${fromCol} = ? LIMIT 1`, fromId);
      const v = row ? (row.shikimori_id ?? row.mal_id) : null;
      // 0 is a "no entry" sentinel in some upstream lists, never a real ID.
      return v == null || v === '' || v === 0 ? null : String(v);
    }

    if (fromPlatform === 'shikimori') {
      const direct = await db.getFirstAsync<Record<string, string | number>>(
        `SELECT ${toCol} FROM id_mappings WHERE shikimori_id = ? LIMIT 1`,
        fromId
      );
      if (direct) return direct[toCol] ?? null;
      const viaMal = await db.getFirstAsync<Record<string, string | number>>(
        `SELECT ${toCol} FROM id_mappings WHERE mal_id = ? LIMIT 1`,
        fromId
      );
      return viaMal ? (viaMal[toCol] ?? null) : null;
    }

    const result = await db.getFirstAsync<Record<string, string | number>>(
      `SELECT ${toCol} FROM id_mappings WHERE ${fromCol} = ? LIMIT 1`,
      fromId
    );

    return result ? (result[toCol] ?? null) : null;
  }

  /**
   * Translate one source ID to every supported platform in a single SELECT.
   *
   * Cheap on the bridge: instead of calling mapID() N times (one round-trip
   * per target) we issue one query and spread the row into a partial record.
   * Only columns with non-null values are returned, so callers can spread the
   * result into an existing `platformIds` map without overwriting populated
   * fields with nulls.
   */
  async mapAllPlatforms(
    fromPlatform: PlatformType,
    fromId: string
  ): Promise<Partial<Record<PlatformType, string>>> {
    const fromCol = this.getColumnName(fromPlatform);
    if (!fromCol) return {};

    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<Record<string, string | number | null>>(
      `SELECT mal_id, anilist_id, kitsu_id, bangumi_id,
              shikimori_id, simkl_id, annict_id
         FROM id_mappings
        WHERE ${fromCol} = ?
        LIMIT 1`,
      fromId
    );
    if (!row) return {};

    const out: Partial<Record<PlatformType, string>> = {};
    const COLUMN_TO_PLATFORM: Record<string, PlatformType> = {
      mal_id: 'myanimelist',
      anilist_id: 'anilist',
      kitsu_id: 'kitsu',
      bangumi_id: 'bangumi',
      shikimori_id: 'shikimori',
      simkl_id: 'simkl',
      annict_id: 'annict',
    };
    for (const [col, platform] of Object.entries(COLUMN_TO_PLATFORM)) {
      const v = row[col];
      if (v !== null && v !== undefined && v !== '') {
        out[platform] = String(v);
      }
    }
    // Shikimori ≡ MAL alias (no dedicated shikimori_id in the dataset).
    if (!out.shikimori && out.myanimelist) {
      out.shikimori = out.myanimelist;
    }
    return out;
  }

  /**
   * One-SELECT source bundle for Chinese title resolution: the locally-shipped
   * `name_cn` (preferred, offline) plus the `bangumi_id` fallback for a
   * network fetch when the dump predates this anime. `null` = row absent.
   */
  async getChineseTitleSource(
    platform: PlatformType | string,
    id: number | string
  ): Promise<{ nameCn: string | null; bangumiId: string | null } | null> {
    const col = this.getColumnName(platform);
    if (!col) return null;

    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{
      name_cn: string | null;
      bangumi_id: number | string | null;
    }>(`SELECT name_cn, bangumi_id FROM id_mappings WHERE ${col} = ? LIMIT 1`, id);

    const manual = this.getManualMapping(platform, id, 'bangumi');
    const selfId = platform === 'bangumi' ? String(id) : null;
    if (!row) {
      return manual !== null || selfId !== null
        ? { nameCn: null, bangumiId: manual ?? selfId }
        : null;
    }

    const trimmed = typeof row.name_cn === 'string' ? row.name_cn.trim() : '';
    // 0 is a "no entry" sentinel in some upstream lists, never a real ID.
    const rowBangumi =
      row.bangumi_id != null && row.bangumi_id !== '' && row.bangumi_id !== 0
        ? String(row.bangumi_id)
        : null;
    return {
      nameCn: trimmed.length > 0 ? trimmed : null,
      bangumiId: manual ?? rowBangumi ?? selfId,
    };
  }

  /**
   * Timestamp (ms-since-epoch) of the last successful updateMappings, or null
   * if mappings have never been hydrated on this device.
   */
  async getLastUpdateTime(): Promise<number | null> {
    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM id_mappings_meta WHERE key = ?`,
      META_KEY_LAST_UPDATE
    );
    if (!row) return null;
    const n = Number(row.value);
    return Number.isFinite(n) ? n : null;
  }

  /** Backwards-compatible alias used by some legacy call sites. */
  async translate(
    fromId: number | string,
    fromPlatform: PlatformType,
    toPlatform: PlatformType
  ): Promise<string | number | null> {
    return this.mapID(fromPlatform, fromId, toPlatform);
  }

  private async setLastUpdateTime(ts: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO id_mappings_meta (key, value) VALUES (?, ?)`,
      META_KEY_LAST_UPDATE,
      String(ts)
    );
  }

  private getColumnName(platform: string): string | null {
    return PLATFORM_TO_COLUMN[platform] ?? null;
  }
}

function manualKey(from: string, fromId: number | string, to: string): string {
  return `${from}:${fromId}:${to}`;
}

export const idMappingService = IDMappingService.getInstance();

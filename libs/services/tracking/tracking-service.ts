import { LocalDB } from '../../db';
import type * as SQLite from 'expo-sqlite';
import { AnimeStatus, PlatformType, UniversalAnimeItem } from '../auth/types';
import { multiPlatformSyncService, type LocalAnimeChanges } from '../sync/multi-platform-sync-service';
import { refreshTrackedIdsSafely } from './tracking-refresh';

const PLATFORM_ID_PREFIXES: [string, PlatformType][] = [
  ['anilist_', 'anilist'],
  ['mal_', 'myanimelist'],
  ['bangumi_', 'bangumi'],
  ['kitsu_', 'kitsu'],
  ['shikimori_', 'shikimori'],
  ['simkl_', 'simkl'],
  ['annict_', 'annict'],
];

/**
 * `user_anime.anime_id` predates cross-platform tracking and is a raw AniList
 * ID for the app's legacy AniList detail flow. New provider-shaped IDs retain
 * their explicit platform prefix. Never infer a platform from the selected
 * primary account or from a title.
 */
export function platformIdsForLocalAnimeId(
  animeId: string
): Partial<Record<PlatformType, string>> {
  const id = animeId.trim();
  const prefixed = PLATFORM_ID_PREFIXES.find(([prefix]) => id.startsWith(prefix));
  if (prefixed) {
    const platformId = id.slice(prefixed[0].length);
    return isPositiveIntegerId(platformId) ? { [prefixed[1]]: platformId } : {};
  }
  return isPositiveIntegerId(id) ? { anilist: id } : {};
}

export function localScoreToProviderScore(score: number): number | undefined {
  return Number.isFinite(score) && score > 0 && score <= 100 ? score / 10 : undefined;
}

export function changedLocalAnimeFields(
  previous: { status?: string; progress?: number | null; score?: number | null } | null,
  next: { status: AnimeStatus; progress?: number; score?: number | null }
): LocalAnimeChanges {
  const changes: LocalAnimeChanges = {};
  if (previous?.status !== next.status) changes.status = next.status;
  if (next.progress !== undefined && next.progress !== (previous?.progress ?? 0)) {
    changes.progress = next.progress;
  }
  if (next.score !== undefined && (next.score === null || (next.score >= 0 && next.score <= 100))) {
    const previousScore = previous?.score && previous.score > 0 ? previous.score : null;
    const nextScore = next.score === null || next.score === 0 ? null : next.score;
    if (nextScore !== previousScore) {
      const providerScore = nextScore === null ? null : localScoreToProviderScore(nextScore);
      if (providerScore !== undefined) changes.score = providerScore;
    }
  }
  return changes;
}

function isPositiveIntegerId(id: string): boolean {
  return id.length > 0 && id[0] !== '0' && Array.from(id).every((digit) => digit >= '0' && digit <= '9');
}


export interface UserAnimeStatus {
  animeId: string;
  status: AnimeStatus;
  progress: number;
  score?: number;
  totalEpisodes?: number;
  updatedAt: Date;
  title?: string;
  imageUrl?: string;
  notes?: string;
  rewatchCount?: number;
}

class TrackingService {
  private static instance: TrackingService;

  static getInstance(): TrackingService {
    if (!TrackingService.instance) {
      TrackingService.instance = new TrackingService();
    }
    return TrackingService.instance;
  }

  // In-memory cache of anime ids the user is currently tracking. Populated
  // lazily on first read and invalidated whenever a write touches user_anime.
  // Saves a round-trip to SQLite every time a list screen needs to mark which
  // rows are tracked.
  private trackedIdsCache: Set<string> | null = null;
  private trackedIdsPromise: Promise<Set<string>> | null = null;
  private readonly trackedIdsListeners = new Set<(ids: Set<string>) => void>();

  private invalidateTrackedIds(): void {
    this.trackedIdsCache = null;
    this.trackedIdsPromise = null;
  }

  /**
   * Public invalidation hook for callers that mutate `user_anime` directly
   * (collection screens, sync workers) without going through this service.
   * Keeps the cached set + screens consistent without a manual refresh.
   */
  invalidateTrackingCache(): void {
    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());
  }

  private notifyTrackedIdsChanged(ids: Set<string>): void {
    for (const listener of this.trackedIdsListeners) {
      try {
        listener(ids);
      } catch (err) {
        console.warn('[Tracking] listener error', err);
      }
    }
  }

  /** Return the in-memory tracked ids, or null before the first successful load. */
  getTrackedIdSetSync(): Set<string> | null {
    return this.trackedIdsCache;
  }

  /**
   * Returns the set of anime ids the user is tracking. Cached in memory; reads
   * after the first call are O(1) until a write invalidates the cache.
   */
  async getTrackedIdSet(): Promise<Set<string>> {
    if (this.trackedIdsCache) return this.trackedIdsCache;
    if (this.trackedIdsPromise) return this.trackedIdsPromise;

    this.trackedIdsPromise = (async () => {
      const db = await LocalDB.getDatabase();
      const rows = await db.getAllAsync<{ anime_id: string }>('SELECT anime_id FROM user_anime');
      const set = new Set(rows.map((r) => r.anime_id));
      this.trackedIdsCache = set;
      this.notifyTrackedIdsChanged(set);
      return set;
    })().finally(() => {
      this.trackedIdsPromise = null;
    });

    return this.trackedIdsPromise;
  }

  /** Subscribe to tracked-id changes. Returns an unsubscribe function. */
  onTrackedIdsChange(listener: (ids: Set<string>) => void): () => void {
    this.trackedIdsListeners.add(listener);
    return () => {
      this.trackedIdsListeners.delete(listener);
    };
  }

  async updateProgress(
    animeId: string,
    progress: number,
    totalEpisodes?: number,
    animeDetails?: Partial<UniversalAnimeItem>
  ): Promise<void> {
    const now = Date.now();
    const status = totalEpisodes && progress >= totalEpisodes ? 'completed' : undefined;
    const title = animeDetails?.title || null;
    const imageUrl = animeDetails?.imageUrl || null;

    const query = `
      INSERT INTO user_anime (
        anime_id, progress, total_episodes, updated_at
        ${status ? ', status' : ''}
        ${title ? ', title' : ''}
        ${imageUrl ? ', image_url' : ''}
      )
      VALUES (
        ?, ?, ?, ?
        ${status ? ', ?' : ''}
        ${title ? ', ?' : ''}
        ${imageUrl ? ', ?' : ''}
      )
      ON CONFLICT(anime_id) DO UPDATE SET
        progress = excluded.progress,
        total_episodes = excluded.total_episodes,
        updated_at = excluded.updated_at
        ${status ? ', status = excluded.status' : ''}
        ${title ? ', title = excluded.title' : ''}
        ${imageUrl ? ', image_url = excluded.image_url' : ''}
    `;

    const args = [animeId, progress, totalEpisodes || null, now];
    if (status) args.push(status);
    if (title) args.push(title);
    if (imageUrl) args.push(imageUrl);

    const item = this.makeSyncItem(
      animeId,
      animeDetails,
      status || animeDetails?.status || 'watching',
      progress,
      now
    );
    await multiPlatformSyncService.syncLocalMutation(item, async (tx) => {
      const previous = await tx.getFirstAsync<{ progress: number | null; status: string }>(
        'SELECT progress, status FROM user_anime WHERE anime_id = ?',
        animeId
      );
      await tx.runAsync(query, ...args);

      const changes: LocalAnimeChanges = {};
      if (previous?.progress !== progress) changes.progress = progress;
      if (status && previous?.status !== status) changes.status = status;
      return { changes, options: { ensureListEntry: !previous } };
    });

    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());
  }

  async updateStatus(
    animeId: string,
    status: AnimeStatus,
    animeDetails?: Partial<UniversalAnimeItem>
  ): Promise<void> {
    const now = Date.now();
    const title = animeDetails?.title || null;
    const imageUrl = animeDetails?.imageUrl || null;

    const query = `
      INSERT INTO user_anime (
        anime_id, status, updated_at
        ${title ? ', title' : ''}
        ${imageUrl ? ', image_url' : ''}
      )
      VALUES (
        ?, ?, ?
        ${title ? ', ?' : ''}
        ${imageUrl ? ', ?' : ''}
      )
      ON CONFLICT(anime_id) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at
        ${title ? ', title = excluded.title' : ''}
        ${imageUrl ? ', image_url = excluded.image_url' : ''}
    `;

    const args = [animeId, status, now];
    if (title) args.push(title);
    if (imageUrl) args.push(imageUrl);

    const item = this.makeSyncItem(animeId, animeDetails, status, animeDetails?.progress ?? 0, now);
    await multiPlatformSyncService.syncLocalMutation(item, async (tx) => {
      const previous = await tx.getFirstAsync<{ status: string }>(
        'SELECT status FROM user_anime WHERE anime_id = ?',
        animeId
      );
      await tx.runAsync(query, ...args);
      return {
        changes: previous?.status !== status ? { status } : {},
        options: { ensureListEntry: !previous },
      };
    });

    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());
  }

  async upsertTracking(input: {
    animeId: string;
    status: AnimeStatus;
    score?: number | null;
    progress?: number;
    totalEpisodes?: number;
    title?: string;
    imageUrl?: string;
    folderId?: string;
    /** Free-form user notes (multi-line). Persisted in user_anime.notes. */
    notes?: string;
    /** Number of times the user has rewatched. Persisted in user_anime.rewatch_count. */
    rewatchCount?: number;
    /** Preferred source for display. It is not used to infer a remote ID. */
    source?: PlatformType;
    /** Exact per-platform IDs, when the caller has them. */
    platformIds?: Partial<Record<PlatformType, string>>;
  }): Promise<void> {
    if (
      input.score !== undefined &&
      input.score !== null &&
      (!Number.isFinite(input.score) || input.score < 0 || input.score > 100)
    ) {
      throw new RangeError('Score must be between 0 and 100');
    }

    const now = Date.now();
    const details: Partial<UniversalAnimeItem> = {
      title: input.title,
      imageUrl: input.imageUrl,
      platformIds: input.platformIds ?? platformIdsForLocalAnimeId(input.animeId),
      source: input.source,
    };
    const item = this.makeSyncItem(input.animeId, details, input.status, input.progress ?? 0, now);

    await multiPlatformSyncService.syncLocalMutation(item, async (tx) => {
      const previous = await tx.getFirstAsync<{
        status: string;
        score: number | null;
        progress: number | null;
      }>(
        'SELECT status, score, progress FROM user_anime WHERE anime_id = ?',
        input.animeId
      );

      await tx.runAsync(
        `INSERT INTO user_anime (
          anime_id, title, image_url, status, score, progress, total_episodes,
          notes, rewatch_count, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(anime_id) DO UPDATE SET
          status = excluded.status,
          score = CASE WHEN ? THEN excluded.score ELSE user_anime.score END,
          progress = COALESCE(?, user_anime.progress),
          total_episodes = COALESCE(excluded.total_episodes, user_anime.total_episodes),
          title = COALESCE(excluded.title, user_anime.title),
          image_url = COALESCE(excluded.image_url, user_anime.image_url),
          notes = COALESCE(excluded.notes, user_anime.notes),
          rewatch_count = COALESCE(excluded.rewatch_count, user_anime.rewatch_count),
          updated_at = excluded.updated_at`,
        input.animeId,
        input.title ?? null,
        input.imageUrl ?? null,
        input.status,
        input.score === 0 ? null : (input.score ?? null),
        input.progress ?? previous?.progress ?? 0,
        input.totalEpisodes ?? null,
        input.notes ?? null,
        input.rewatchCount ?? null,
        now,
        input.score !== undefined ? 1 : 0,
        input.progress ?? null
      );

      if (input.folderId) {
        await tx.runAsync(
          `INSERT OR IGNORE INTO collection_folder_items (folder_id, anime_id, added_at) VALUES (?, ?, ?)`,
          input.folderId,
          input.animeId,
          now
        );
      }

      return {
        changes: changedLocalAnimeFields(previous, input),
        options: { ensureListEntry: !previous },
      };
    });

    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());
  }

  /** Apply a selected conflict value and queue it even when the local value already matches. */
  async applyConflictResolution(input: {
    conflictId: number;
    picked: PlatformType;
    animeId: string;
    valuesJson: string;
    field: 'progress' | 'status' | 'score';
    value: string | number;
    platformIds: Partial<Record<PlatformType, string>>;
    aliases: string[];
  }): Promise<void> {
    const db = await LocalDB.getDatabase();
    const placeholders = input.aliases.map(() => '?').join(', ');
    const findMatches = (tx: SQLite.SQLiteDatabase) => tx.getAllAsync<{ anime_id: string }>(
      `SELECT anime_id FROM user_anime WHERE anime_id IN (${placeholders})`, ...input.aliases
    );
    const matches = await findMatches(db);
    if (matches.length !== 1) throw new Error('Cannot uniquely identify the local anime for this conflict');
    const localId = matches[0].anime_id;
    const now = Date.now();
    const item = this.makeSyncItem(localId, { platformIds: input.platformIds }, 'watching', 0, now);
    await multiPlatformSyncService.syncLocalMutation(item, async (tx) => {
      const current = await findMatches(tx);
      if (current.length !== 1 || current[0].anime_id !== localId) {
        throw new Error('Local anime identity changed while resolving conflict');
      }
      const result = await tx.runAsync(
        `UPDATE sync_conflicts SET resolved = 1, resolution = ?, resolved_at = ?
         WHERE id = ? AND resolved = 0 AND anime_id = ? AND field = ? AND values_json = ?`,
        `manual:${input.picked}`, now, input.conflictId, input.animeId, input.field, input.valuesJson
      );
      if (result.changes !== 1) throw new Error('Conflict changed while resolving it');
      const localValue = input.field === 'score'
        ? (input.value === 0 ? null : Math.round((input.value as number) * 10))
        : input.value;
      await tx.runAsync(
        `UPDATE user_anime SET ${input.field} = ?, updated_at = ? WHERE anime_id = ?`,
        localValue, now, localId
      );
      const changes: LocalAnimeChanges = input.field === 'status'
        ? { status: input.value as AnimeStatus }
        : input.field === 'progress'
          ? { progress: input.value as number }
          : { score: input.value === 0 ? null : input.value as number };
      return { changes };
    });
    this.invalidateTrackingCache();
  }

  async removeTracking(animeId: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    const previous = await db.getFirstAsync<{
      status: string;
      progress: number | null;
      title: string | null;
      image_url: string | null;
    }>(
      'SELECT status, progress, title, image_url FROM user_anime WHERE anime_id = ?',
      animeId
    );
    const removeLocal = async (tx: SQLite.SQLiteDatabase) => {
      await tx.runAsync('DELETE FROM user_anime WHERE anime_id = ?', animeId);
      await tx.runAsync('DELETE FROM collection_folder_items WHERE anime_id = ?', animeId);
    };

    if (previous) {
      const item = this.makeSyncItem(
        animeId,
        {
          title: previous.title ?? undefined,
          imageUrl: previous.image_url ?? undefined,
          platformIds: platformIdsForLocalAnimeId(animeId),
        },
        previous.status as AnimeStatus,
        previous.progress ?? 0,
        Date.now()
      );
      await multiPlatformSyncService.removeLocalTracking(item, removeLocal);
    } else {
      await db.withExclusiveTransactionAsync(removeLocal);
    }

    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());
  }

  private makeSyncItem(
    animeId: string,
    details: Partial<UniversalAnimeItem> | undefined,
    status: AnimeStatus,
    progress: number,
    now: number
  ): UniversalAnimeItem {
    const platformIds = details?.platformIds ?? platformIdsForLocalAnimeId(animeId);
    const source =
      (Object.keys(platformIds)[0] as PlatformType | undefined) ?? details?.source ?? 'anilist';
    return {
      id: animeId,
      platformIds,
      title: details?.title ?? '',
      imageUrl: details?.imageUrl ?? '',
      status,
      progress,
      totalEpisodes: details?.totalEpisodes,
      updatedAt: new Date(now),
      source,
    };
  }

  async getStatus(animeId: string): Promise<UserAnimeStatus | null> {
    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{
      anime_id: string;
      status: string;
      progress: number;
      score: number | null;
      total_episodes: number;
      updated_at: number;
      title: string;
      image_url: string;
      notes: string | null;
      rewatch_count: number | null;
    }>('SELECT * FROM user_anime WHERE anime_id = ?', animeId);

    if (!row) return null;

    return {
      animeId: row.anime_id,
      status: row.status as AnimeStatus,
      progress: row.progress,
      score: row.score ?? undefined,
      totalEpisodes: row.total_episodes,
      updatedAt: new Date(row.updated_at),
      title: row.title,
      imageUrl: row.image_url,
      notes: row.notes ?? '',
      rewatchCount: row.rewatch_count ?? 0,
    };
  }
}

export const trackingService = TrackingService.getInstance();

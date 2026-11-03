import { PlatformType, UniversalAnimeItem, AnimeStatus, PLATFORM_CONFIGS } from '../auth/types';
import { authService } from '../auth/auth-service';
import { getProvider } from '../providers';
import { isWritableProvider } from '../providers/base-provider';
import { idMappingService } from './id-mapping-service';
import { conflictResolutionService } from './conflict-resolution-service';
import { offlineQueueService, SyncJob } from './offline-queue-service';
import { similarTitles } from './title-normalize';
import { LocalDB } from '../../db';
import type * as SQLite from 'expo-sqlite';

export type MergeMethod = 'id' | 'title' | 'no';

export interface MappingStats {
  totalItems: number;
  mergedById: number;
  mergedByTitle: number;
  singletons: number;
  coverageMissByPlatform: Record<PlatformType, number>;
}

export interface SyncResult {
  items: UniversalAnimeItem[];
  errors: { platform: PlatformType; error: string }[];
  conflictIds: number[];
  queuedJobs: number;
  mappingStats: MappingStats;
}

export type PlatformCheckResult =
  | { platform: PlatformType; status: 'ok'; count: number }
  | { platform: PlatformType; status: 'error' };

export interface LocalAnimeChanges {
  progress?: number;
  status?: AnimeStatus;
  /** `null` or zero means the user explicitly cleared the score. */
  score?: number | null;
}

export interface LocalAnimeChangeOptions {
  ensureListEntry?: boolean;
}

export interface LocalAnimeMutationResult {
  changes: LocalAnimeChanges;
  options?: LocalAnimeChangeOptions;
}

interface WritableTarget {
  platform: PlatformType;
  targetId: string;
  unresolvedPlatformIds?: UniversalAnimeItem['platformIds'];
  supportsProgressUpdates: boolean;
  supportsScoreUpdates: boolean;
  supportsScoreClearing: boolean;
}

const ALL_PLATFORMS = Object.keys(PLATFORM_CONFIGS) as PlatformType[];

function isAnimeStatus(value: unknown): value is AnimeStatus {
  return (
    typeof value === 'string' &&
    ['watching', 'completed', 'on_hold', 'dropped', 'planned'].includes(value)
  );
}

function emptyCoverageMiss(): Record<PlatformType, number> {
  return ALL_PLATFORMS.reduce(
    (acc, p) => {
      acc[p] = 0;
      return acc;
    },
    {} as Record<PlatformType, number>
  );
}

export class MultiPlatformSyncService {
  private static instance: MultiPlatformSyncService;

  static getInstance(): MultiPlatformSyncService {
    if (!MultiPlatformSyncService.instance) {
      MultiPlatformSyncService.instance = new MultiPlatformSyncService();
    }
    return MultiPlatformSyncService.instance;
  }

  async checkPlatforms(): Promise<PlatformCheckResult[]> {
    await authService.initialize();
    const platforms = authService.getConnectedPlatforms();
    return Promise.all(
      platforms.map(async (platform): Promise<PlatformCheckResult> => {
        try {
          const credentials = await authService.getValidCredentials(platform);
          if (!credentials) return { platform, status: 'error' };
          const items = await getProvider(platform).fetchUserList(credentials.token.accessToken);
          return { platform, status: 'ok', count: items.length };
        } catch {
          return { platform, status: 'error' };
        }
      })
    );
  }

  async syncAll(): Promise<SyncResult> {
    await authService.initialize();
    const platforms = authService.getConnectedPlatforms();
    const errors: { platform: PlatformType; error: string }[] = [];
    const allItems: UniversalAnimeItem[] = [];
    const snapshotStartedAt = Date.now();

    await Promise.all(
      platforms.map(async (platform) => {
        try {
          const provider = getProvider(platform);
          const creds = await authService.getValidCredentials(platform);
          if (!creds) {
            errors.push({ platform, error: 'Missing valid credentials' });
            return;
          }

          const items = await provider.fetchUserList(creds.token.accessToken);
          allItems.push(...items);
        } catch (error: any) {
          console.error(`Failed to sync ${platform}:`, error);
          errors.push({ platform, error: error.message });
        }
      })
    );

    const mergeResult = await this.mergeItems(allItems);
    const { merged, conflictIds } = mergeResult;

    for (const item of mergeResult.unsafeToPersist) {
      errors.push({
        platform: item.source,
        error: `Cannot safely merge pulled item: ${item.title}`,
      });
    }
    await this.persistPulledItems(
      mergeResult.safeToPersist,
      errors,
      snapshotStartedAt,
      mergeResult.conflictFields
    );

    // Pull/merge results are not write intent. Only explicit local edits enqueue
    // remote mutations; this prevents conflict resolution or title fallback
    // from silently changing a platform's list.
    const queuedJobs = 0;
    await this.drainOfflineQueue();
    const outstandingJobs = await offlineQueueService.getOutstandingByPlatform();
    for (const [platform, counts] of Object.entries(outstandingJobs)) {
      if (!counts) continue;
      if (counts.pending > 0) {
        errors.push({
          platform: platform as PlatformType,
          error: `${counts.pending} sync jobs remain queued for retry`,
        });
      }
      if (counts.running > 0) {
        errors.push({
          platform: platform as PlatformType,
          error: `${counts.running} sync jobs are still running`,
        });
      }
      if (counts.dead > 0) {
        errors.push({
          platform: platform as PlatformType,
          error: `${counts.dead} sync jobs are in the dead-letter queue`,
        });
      }
    }

    const mappingStats: MappingStats = {
      totalItems: allItems.length,
      mergedById: mergeResult.mergedByIdCount,
      mergedByTitle: mergeResult.mergedByTitleCount,
      singletons: mergeResult.singletonCount,
      coverageMissByPlatform: mergeResult.coverageMissByPlatform,
    };

    return { items: merged, errors, conflictIds, queuedJobs, mappingStats };
  }

  private async persistPulledItems(
    items: UniversalAnimeItem[],
    errors: SyncResult['errors'],
    snapshotStartedAt: number,
    conflictFields: Map<UniversalAnimeItem, string[]>
  ): Promise<void> {
    if (items.length === 0) return;
    const prefixes: Partial<Record<PlatformType, string>> = {
      anilist: 'anilist_',
      myanimelist: 'mal_',
      bangumi: 'bangumi_',
      kitsu: 'kitsu_',
      shikimori: 'shikimori_',
      simkl: 'simkl_',
      annict: 'annict_',
      kavita: 'kavita_',
    };
    const db = await LocalDB.getDatabase();
    let wroteItems = false;
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const item of items) {
        const aliases = new Set<string>();
        for (const [platform, value] of Object.entries(item.platformIds)) {
          const id = reliablePlatformId(value);
          const prefix = prefixes[platform as PlatformType];
          if (!id || !prefix) continue;
          aliases.add(`${prefix}${id}`);
          if (platform === 'anilist') aliases.add(id);
        }
        const sourceId = reliablePlatformId(item.platformIds[item.source]);
        const sourcePrefix = prefixes[item.source];
        if (!sourceId || !sourcePrefix) {
          errors.push({
            platform: item.source,
            error: `Cannot identify pulled item: ${item.title}`,
          });
          continue;
        }
        const ids = [...aliases];
        const placeholders = ids.map(() => '?').join(', ');
        const existing = await tx.getAllAsync<{ anime_id: string }>(
          `SELECT anime_id FROM user_anime WHERE anime_id IN (${placeholders})`,
          ...ids
        );
        if (existing.length > 1) {
          errors.push({
            platform: item.source,
            error: `Ambiguous local matches for pulled item: ${item.title}`,
          });
          continue;
        }
        const tombstones = await tx.getAllAsync<{ anime_id: string; platform_ids: string }>(
          'SELECT anime_id, platform_ids FROM tracking_tombstones'
        );
        const matchingTombstones: string[] = [];
        for (const tombstone of tombstones) {
          if (await this.matchesTombstone(item, tombstone))
            matchingTombstones.push(tombstone.anime_id);
        }
        const blocked = matchingTombstones.length > 0;
        if (blocked) {
          errors.push({
            platform: item.source,
            error: `Local removal or unresolved identity prevents restoring: ${item.title}`,
          });
          continue;
        }
        const removals = await tx.getAllAsync<{ platform: string; payload: string }>(
          `SELECT platform, payload FROM sync_jobs WHERE job_type = 'remove' AND (state IN ('pending', 'running', 'dead') OR (state = 'done' AND updated_at >= ?))`,
          snapshotStartedAt
        );
        const pendingRemoval = removals.some((row) => {
          try {
            const payload = JSON.parse(row.payload) as { animeId?: string; localAnimeId?: string };
            return (
              (payload.localAnimeId && ids.includes(payload.localAnimeId)) ||
              (payload.animeId &&
                reliablePlatformId(item.platformIds[row.platform as PlatformType]) ===
                  payload.animeId)
            );
          } catch {
            return true;
          }
        });
        if (pendingRemoval) {
          errors.push({
            platform: item.source,
            error: `Pending local removal prevents restoring: ${item.title}`,
          });
          continue;
        }
        const localId = existing[0]?.anime_id ?? `${sourcePrefix}${sourceId}`;
        const dirty = await tx.getAllAsync<{ field: string }>(
          'SELECT field FROM sync_dirty_records WHERE anime_id = ?',
          localId
        );
        const protectedFields = new Set(dirty.map((row) => row.field));
        // Existing installations may contain jobs created before dirty records
        // used local IDs. Derive protection from the outstanding work as well.
        const outstanding = await tx.getAllAsync<{
          platform: string;
          payload: string;
          job_type: string;
        }>(
          `SELECT platform, payload, job_type FROM sync_jobs WHERE state IN ('pending', 'running', 'dead') OR (state = 'done' AND updated_at >= ?)`,
          snapshotStartedAt
        );
        for (const row of outstanding) {
          try {
            const payload = JSON.parse(row.payload) as { animeId?: string; localAnimeId?: string };
            if (
              payload.localAnimeId !== localId &&
              (!payload.animeId ||
                reliablePlatformId(item.platformIds[row.platform as PlatformType]) !==
                  payload.animeId)
            )
              continue;
            const field =
              row.job_type === 'remove'
                ? 'all'
                : row.job_type === 'add'
                  ? 'status'
                  : row.job_type === 'score-clear'
                    ? 'score'
                    : row.job_type;
            protectedFields.add(field);
          } catch {
            throw new Error('Cannot read outstanding sync job while applying snapshot');
          }
        }
        // A pending deletion must not be recreated by an older remote snapshot.
        if (!existing.length && protectedFields.size > 0) {
          errors.push({
            platform: item.source,
            error: `Pending local change prevents restoring: ${item.title}`,
          });
          continue;
        }
        for (const field of conflictFields.get(item) ?? []) protectedFields.add(field);
        const isProtected = (field: string) =>
          protectedFields.has('all') || protectedFields.has(field);
        const score =
          typeof item.score === 'number' &&
          Number.isFinite(item.score) &&
          item.score > 0 &&
          item.score <= 10
            ? Math.round(item.score * 10)
            : null;
        await tx.runAsync(
          `INSERT INTO user_anime (anime_id, title, image_url, status, progress, score, total_episodes, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(anime_id) DO UPDATE SET
             title = COALESCE(NULLIF(excluded.title, ''), user_anime.title),
             image_url = COALESCE(NULLIF(excluded.image_url, ''), user_anime.image_url),
             status = CASE WHEN ? THEN user_anime.status ELSE excluded.status END,
             progress = CASE WHEN ? THEN user_anime.progress ELSE excluded.progress END,
             score = CASE WHEN ? THEN user_anime.score ELSE excluded.score END,
             total_episodes = COALESCE(excluded.total_episodes, user_anime.total_episodes),
             updated_at = MAX(COALESCE(user_anime.updated_at, 0), excluded.updated_at)`,
          localId,
          item.title,
          item.imageUrl,
          item.status,
          item.progress,
          score,
          item.totalEpisodes ?? null,
          item.updatedAt.getTime(),
          isProtected('status') ? 1 : 0,
          isProtected('progress') ? 1 : 0,
          isProtected('score') ? 1 : 0
        );
        wroteItems = true;
      }
    });
    if (wroteItems) {
      const { trackingService } = await import('../tracking/tracking-service');
      trackingService.invalidateTrackingCache();
    }
  }

  async syncLocalChanges(
    item: UniversalAnimeItem,
    changes: LocalAnimeChanges,
    options: LocalAnimeChangeOptions = {}
  ): Promise<void> {
    const fields = this.validChangedFields(changes);
    if (fields.length === 0) return;

    await authService.initialize();
    const targets = await this.resolveWritableTargets(item);
    const queueJobs = this.buildLocalChangeJobs(targets, fields, changes, options, item);
    if (queueJobs.length === 0) return;

    await offlineQueueService.enqueueBatch(queueJobs);
    await this.finishQueuedLocalChanges(queueJobs);
  }

  /** Commit a tracking mutation and the remote jobs it creates in one SQLite transaction. */
  async syncLocalMutation(
    item: UniversalAnimeItem,
    mutate: (tx: SQLite.SQLiteDatabase) => Promise<LocalAnimeMutationResult>
  ): Promise<void> {
    await authService.initialize();
    const targets = await this.resolveWritableTargets(item);
    const queueJobs = await offlineQueueService.mutateWithJobs(async (tx) => {
      const mutation = await mutate(tx);
      const tombstones = await tx.getAllAsync<{ anime_id: string; platform_ids: string }>(
        'SELECT anime_id, platform_ids FROM tracking_tombstones'
      );
      const matchingTombstones: string[] = [];
      for (const tombstone of tombstones) {
        if (await this.matchesTombstone(item, tombstone, false))
          matchingTombstones.push(tombstone.anime_id);
      }
      if (matchingTombstones.length === 1) {
        const tombstoneId = matchingTombstones[0];
        const targetIds = new Map(targets.map((target) => [target.platform, target.targetId]));
        const removeJobs = await tx.getAllAsync<{ id: number; platform: string; payload: string }>(
          `SELECT id, platform, payload FROM sync_jobs WHERE job_type = 'remove' AND state IN ('pending', 'dead')`
        );
        for (const job of removeJobs) {
          try {
            const payload = JSON.parse(job.payload) as { animeId?: string; localAnimeId?: string };
            const resolvedId = targetIds.get(job.platform as PlatformType);
            if (
              payload.localAnimeId === tombstoneId ||
              (resolvedId && payload.animeId === resolvedId)
            ) {
              await tx.runAsync('DELETE FROM sync_jobs WHERE id = ?', job.id);
            }
          } catch {
            // Keep malformed jobs; they cannot safely be attributed to this anime.
          }
        }
        await tx.runAsync('DELETE FROM tracking_tombstones WHERE anime_id = ?', tombstoneId);
      }
      const fields = this.validChangedFields(mutation.changes);
      return this.buildLocalChangeJobs(
        targets,
        fields,
        mutation.changes,
        mutation.options ?? {},
        item
      );
    });
    await this.finishQueuedLocalChanges(queueJobs);
  }

  private async matchesTombstone(
    item: UniversalAnimeItem,
    tombstone: { anime_id: string; platform_ids: string },
    unknownIsMatch = true
  ): Promise<boolean> {
    const localAliases = new Set<string>([item.id]);
    for (const [platform, rawId] of Object.entries(item.platformIds)) {
      const id = reliablePlatformId(rawId);
      if (!id) continue;
      localAliases.add(`${platform}_${id}`);
      if (platform === 'anilist') localAliases.add(id);
    }
    if (localAliases.has(tombstone.anime_id)) return true;

    let stored: Record<string, unknown>;
    try {
      stored = JSON.parse(tombstone.platform_ids) as Record<string, unknown>;
    } catch {
      return false;
    }
    for (const [sourcePlatform, rawSourceId] of Object.entries(item.platformIds)) {
      const sourceId = reliablePlatformId(rawSourceId);
      if (!sourceId) continue;
      for (const [targetPlatform, rawTargetId] of Object.entries(stored)) {
        const targetId = reliablePlatformId(rawTargetId);
        if (!targetId) continue;
        if (sourcePlatform === targetPlatform && sourceId === targetId) return true;
        const mapped = reliablePlatformId(
          await idMappingService.mapID(sourcePlatform, sourceId, targetPlatform as PlatformType)
        );
        if (mapped && mapped === targetId) return true;
        if (!mapped && unknownIsMatch) return true;
      }
    }
    return false;
  }

  private async resolveWritableTargets(item: UniversalAnimeItem): Promise<WritableTarget[]> {
    const targets: WritableTarget[] = [];
    for (const platform of authService.getConnectedPlatforms()) {
      const provider = getProvider(platform);
      if (!isWritableProvider(provider)) continue;
      let targetId: string | undefined;
      try {
        targetId = await this.resolveId(item, platform);
      } catch {
        // Keep the edit and retry mapping with the queued job.
      }
      targets.push({
        platform,
        targetId: targetId ?? `unresolved:${item.id}`,
        unresolvedPlatformIds: targetId ? undefined : item.platformIds,
        supportsProgressUpdates: provider.supportsProgressUpdates !== false,
        supportsScoreUpdates: provider.supportsScoreUpdates !== false,
        supportsScoreClearing:
          provider.supportsScoreClearing === true && typeof provider.clearScore === 'function',
      });
    }
    return targets;
  }

  private validChangedFields(changes: LocalAnimeChanges): ('progress' | 'status' | 'score')[] {
    return (['progress', 'status', 'score'] as const).filter((field) => {
      const value = changes[field];
      if (value === undefined) return false;
      if (field === 'progress') {
        return typeof value === 'number' && Number.isInteger(value) && value >= 0;
      }
      if (field === 'score') {
        return (
          value === null ||
          value === 0 ||
          (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10)
        );
      }
      return (
        typeof value === 'string' &&
        ['watching', 'completed', 'on_hold', 'dropped', 'planned'].includes(value)
      );
    });
  }

  private buildLocalChangeJobs(
    targets: WritableTarget[],
    fields: ('progress' | 'status' | 'score')[],
    changes: LocalAnimeChanges,
    options: LocalAnimeChangeOptions,
    item: UniversalAnimeItem
  ): Parameters<typeof offlineQueueService.enqueueBatch>[0] {
    const queueJobs: Parameters<typeof offlineQueueService.enqueueBatch>[0] = [];
    for (const target of targets) {
      const {
        platform,
        targetId,
        supportsProgressUpdates,
        supportsScoreUpdates,
        supportsScoreClearing,
      } = target;
      const localAnimeId = item.id;
      if (options.ensureListEntry) {
        queueJobs.push({
          type: 'add',
          platform,
          payload: { animeId: targetId, localAnimeId, status: changes.status ?? item.status },
        });
      }
      for (const field of fields) {
        if (field === 'progress' && !supportsProgressUpdates) continue;
        if (field === 'score' && changes.score !== null && !supportsScoreUpdates) continue;
        if (
          field === 'score' &&
          (changes.score === null || changes.score === 0) &&
          !supportsScoreClearing
        ) {
          continue;
        }
        if (field === 'status' && options.ensureListEntry) continue;
        if (field === 'progress' && typeof changes.progress === 'number') {
          queueJobs.push({
            type: 'progress',
            platform,
            payload: { animeId: targetId, localAnimeId, progress: changes.progress },
          });
        } else if (field === 'status' && changes.status) {
          queueJobs.push({
            type: 'status',
            platform,
            payload: { animeId: targetId, localAnimeId, status: changes.status },
          });
        } else if (field === 'score' && (changes.score === null || changes.score === 0)) {
          queueJobs.push({
            type: 'score-clear',
            platform,
            payload: { animeId: targetId, localAnimeId },
          });
        } else if (field === 'score' && typeof changes.score === 'number') {
          queueJobs.push({
            type: 'score',
            platform,
            payload: { animeId: targetId, localAnimeId, score: changes.score },
          });
        }
      }
    }
    for (const job of queueJobs) {
      const target = targets.find((candidate) => candidate.platform === job.platform);
      if (target?.unresolvedPlatformIds) {
        job.payload.unresolvedPlatformIds = target.unresolvedPlatformIds;
      }
    }
    return queueJobs;
  }

  private async finishQueuedLocalChanges(
    queueJobs: Parameters<typeof offlineQueueService.enqueueBatch>[0]
  ): Promise<void> {
    if (queueJobs.length === 0) return;
    await this.drainOfflineQueue();
  }

  /** Keep a local untrack and its supported remote removals in one SQLite commit. */
  async removeLocalTracking(
    item: UniversalAnimeItem,
    removeLocal: (tx: SQLite.SQLiteDatabase) => Promise<void>
  ): Promise<void> {
    await authService.initialize();
    const connectedPlatforms = new Set(authService.getConnectedPlatforms());
    const queueJobs: Parameters<typeof offlineQueueService.enqueueBatch>[0] = [];
    const cancelTargets: Parameters<typeof offlineQueueService.enqueueBatchWithMutation>[2] = [];
    const tombstoneIds = { ...item.platformIds };

    for (const platform of ALL_PLATFORMS) {
      let targetId: string | undefined;
      try {
        targetId = await this.resolveId(item, platform);
      } catch {
        // Mapping failures must not discard the user's local removal.
      }
      if (targetId) tombstoneIds[platform] = targetId;
      cancelTargets.push({
        platform,
        animeId: targetId ?? `unresolved:${item.id}`,
        localAnimeId: item.id,
      });
      if (!connectedPlatforms.has(platform)) continue;
      const provider = getProvider(platform);
      if (!isWritableProvider(provider) || provider.supportsListRemoval === false) continue;
      queueJobs.push({
        type: 'remove',
        platform,
        payload: {
          animeId: targetId ?? `unresolved:${item.id}`,
          localAnimeId: item.id,
          ...(targetId ? {} : { unresolvedPlatformIds: item.platformIds }),
        },
      });
    }

    await offlineQueueService.enqueueBatchWithMutation(
      queueJobs,
      async (tx) => {
        await removeLocal(tx);
        await tx.runAsync(
          `INSERT INTO tracking_tombstones (anime_id, platform_ids, created_at) VALUES (?, ?, ?)
         ON CONFLICT(anime_id) DO UPDATE SET platform_ids = excluded.platform_ids, created_at = excluded.created_at`,
          item.id,
          JSON.stringify(tombstoneIds),
          Date.now()
        );
      },
      cancelTargets
    );
    void this.drainOfflineQueue().catch((error) => {
      console.error('[Sync] failed to drain after local removal', error);
    });
  }

  async drainOfflineQueue() {
    return offlineQueueService.drain((job) => this.executeJob(job));
  }

  private async executeJob(job: SyncJob): Promise<void> {
    let animeId = reliablePlatformId(job.payload?.animeId);
    if (!animeId && job.payload.unresolvedPlatformIds) {
      const candidates = new Set<string>();
      for (const [source, sourceId] of Object.entries(job.payload.unresolvedPlatformIds)) {
        const validSource = reliablePlatformId(sourceId);
        if (!validSource) continue;
        const mapped = reliablePlatformId(
          await idMappingService.mapID(source, validSource, job.platform)
        );
        if (mapped) candidates.add(mapped);
      }
      if (candidates.size === 1) animeId = candidates.values().next().value;
    }
    if (!animeId) throw new Error(`Cannot resolve ${job.platform} ID for local edit`);
    const provider = getProvider(job.platform);
    if (!isWritableProvider(provider)) {
      throw new Error(`Provider ${job.platform} does not support writes`);
    }

    const localState = await this.getCurrentLocalAnime(job);
    if (job.payload.localAnimeId !== undefined) {
      if (job.jobType === 'remove' && localState) return;
      if (job.jobType !== 'remove' && !localState) return;
    }

    const creds = await authService.getValidCredentials(job.platform);
    if (!creds) {
      throw new Error(`Platform ${job.platform} is not connected`);
    }

    const token = creds.token.accessToken;

    switch (job.jobType) {
      case 'progress': {
        if (provider.supportsProgressUpdates === false) return;
        const progress = localState ? (localState.progress ?? 0) : job.payload.progress;
        if (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0) {
          throw new Error('progress job missing a valid progress value');
        }
        await provider.updateProgress(animeId, progress, token);
        return;
      }
      case 'status': {
        const status = localState?.status ?? job.payload.status;
        if (!isAnimeStatus(status)) throw new Error('status job missing a valid status');
        await provider.updateStatus(animeId, status, token);
        return;
      }
      case 'score': {
        if (provider.supportsScoreUpdates === false) return;
        let score = job.payload.score;
        if (localState) {
          if (typeof localState.score !== 'number' || localState.score <= 0) return;
          if (!Number.isFinite(localState.score) || localState.score > 100) {
            throw new Error('local score must be between 1 and 100');
          }
          score = localState.score / 10;
        }
        if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0 || score > 10) {
          throw new Error('score job missing a valid score');
        }
        await provider.updateScore(animeId, score, token);
        return;
      }
      case 'score-clear':
        if (provider.supportsScoreClearing !== true || !provider.clearScore) return;
        if (localState && typeof localState.score === 'number' && localState.score > 0) return;
        await provider.clearScore(animeId, token);
        return;
      case 'add': {
        const status = localState?.status ?? job.payload.status;
        if (!isAnimeStatus(status)) throw new Error('add job missing a valid status');
        await provider.addToList(animeId, status, token);
        return;
      }
      case 'remove':
        if (provider.supportsListRemoval === false) return;
        await provider.removeFromList(animeId, token);
        return;
      default:
        throw new Error(`Unknown sync job type: ${job.jobType}`);
    }
  }

  private async getCurrentLocalAnime(
    job: SyncJob
  ): Promise<{ status: string; progress: number | null; score: number | null } | null | undefined> {
    const localAnimeId = job.payload.localAnimeId;
    if (localAnimeId === undefined) return undefined;
    const db = await LocalDB.getDatabase();
    return db.getFirstAsync<{
      status: string;
      progress: number | null;
      score: number | null;
    }>('SELECT status, progress, score FROM user_anime WHERE anime_id = ?', localAnimeId);
  }

  async mergeItems(items: UniversalAnimeItem[]): Promise<{
    merged: UniversalAnimeItem[];
    safeToPersist: UniversalAnimeItem[];
    unsafeToPersist: UniversalAnimeItem[];
    conflictFields: Map<UniversalAnimeItem, string[]>;
    conflictIds: number[];
    mergedByIdCount: number;
    mergedByTitleCount: number;
    singletonCount: number;
    coverageMissByPlatform: Record<PlatformType, number>;
  }> {
    const coverageMissByPlatform = emptyCoverageMiss();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const newItem = { ...item, platformIds: { ...item.platformIds } };
        const sourcePlatform = item.source;
        const sourceId = item.platformIds[sourcePlatform];

        if (sourceId) {
          const mapped = await idMappingService.mapAllPlatforms(sourcePlatform, sourceId);
          for (const target of ALL_PLATFORMS) {
            if (newItem.platformIds[target]) continue;
            const value = mapped[target];
            if (value) {
              newItem.platformIds[target] = value;
            } else if (target !== sourcePlatform) {
              // Track which target platforms we couldn't reach from this
              // source row. Useful for sysadmins eyeballing the merged
              // mapping's freshness in the settings panel.
              coverageMissByPlatform[target] += 1;
            }
          }
        }
        return newItem;
      })
    );

    const groups: UniversalAnimeItem[][] = [];
    const groupMethods: MergeMethod[] = [];
    const processed = new Set<number>();
    let mergedByIdCount = 0;
    let mergedByTitleCount = 0;

    for (let i = 0; i < enrichedItems.length; i++) {
      if (processed.has(i)) continue;

      const current = enrichedItems[i];
      const group = [current];
      processed.add(i);
      let groupMethod: MergeMethod = 'no';

      for (let j = i + 1; j < enrichedItems.length; j++) {
        if (processed.has(j)) continue;
        const other = enrichedItems[j];

        const { same, method } = this.areSameAnime(current, other);
        if (same) {
          group.push(other);
          processed.add(j);
          // Earliest match wins — once we merged anything by ID, the group
          // is "an ID-matched group". A later title-only match in the same
          // bucket still counts as title since that pair wasn't proven by ID.
          if (method === 'id') {
            mergedByIdCount += 1;
            if (groupMethod === 'no') groupMethod = 'id';
          } else if (method === 'title') {
            mergedByTitleCount += 1;
            groupMethod = 'title';
          }
        }
      }
      groups.push(group);
      groupMethods.push(groupMethod);
    }

    const merged: UniversalAnimeItem[] = [];
    const conflictIds: number[] = [];
    const safeToPersist: UniversalAnimeItem[] = [];
    const unsafeToPersist: UniversalAnimeItem[] = [];
    const conflictFields = new Map<UniversalAnimeItem, string[]>();
    for (const [index, group] of groups.entries()) {
      const result = await conflictResolutionService.mergeGroup(group);
      merged.push(result.merged);
      conflictIds.push(...result.conflictIds);
      if (groupMethods[index] === 'title') {
        unsafeToPersist.push(result.merged);
      } else {
        safeToPersist.push(result.merged);
        conflictFields.set(result.merged, result.conflictFields);
      }
    }

    const singletonCount = groups.reduce((n, g) => n + (g.length === 1 ? 1 : 0), 0);

    return {
      merged,
      safeToPersist,
      unsafeToPersist,
      conflictFields,
      conflictIds,
      mergedByIdCount,
      mergedByTitleCount,
      singletonCount,
      coverageMissByPlatform,
    };
  }

  /**
   * Decide whether two enriched items are the same anime.
   *
   * Tier 1 (`'id'`) — any populated platformId matches → definitely same.
   * Tier 2 (`'title'`) — normalized native (or English/Romaji) title match,
   *   guarded by season and (when available) year. Used to bridge gaps when
   *   neither row has an upstream-mapped ID.
   */
  areSameAnime(
    a: UniversalAnimeItem,
    b: UniversalAnimeItem
  ): { same: boolean; method: MergeMethod } {
    for (const key of Object.keys(a.platformIds)) {
      const k = key as PlatformType;
      if (a.platformIds[k] && b.platformIds[k] && a.platformIds[k] === b.platformIds[k]) {
        return { same: true, method: 'id' };
      }
    }

    const titleA = a.titleJapanese || a.titleEnglish || a.titleRomaji || a.title;
    const titleB = b.titleJapanese || b.titleEnglish || b.titleRomaji || b.title;
    if (titleA && titleB) {
      const yearA = a.startDate ? new Date(a.startDate).getFullYear() : undefined;
      const yearB = b.startDate ? new Date(b.startDate).getFullYear() : undefined;
      if (similarTitles(titleA, titleB, { year: yearA, yearB })) {
        return { same: true, method: 'title' };
      }
    }

    return { same: false, method: 'no' };
  }

  private async resolveId(
    item: UniversalAnimeItem,
    targetPlatform: PlatformType
  ): Promise<string | undefined> {
    const directId = reliablePlatformId(item.platformIds[targetPlatform]);
    if (directId) return directId;

    const mappedTargetIds = new Set<string>();
    for (const [sourcePlatform, rawSourceId] of Object.entries(item.platformIds)) {
      const sourceId = reliablePlatformId(rawSourceId);
      if (!sourceId) continue;
      const mapped = await idMappingService.mapID(sourcePlatform, sourceId, targetPlatform);
      const targetId = reliablePlatformId(mapped);
      if (targetId) mappedTargetIds.add(targetId);
    }

    // Different known IDs that map to different targets are ambiguous. Do not
    // choose whichever source happened to be first in object iteration order.
    return mappedTargetIds.size === 1 ? mappedTargetIds.values().next().value : undefined;
  }
}

function reliablePlatformId(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const id = String(value).trim();
  if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) return undefined;
  return id;
}

export const multiPlatformSyncService = MultiPlatformSyncService.getInstance();

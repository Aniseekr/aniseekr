import { LocalDB, LOCAL_DB_NAME } from '../../db';
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { PlatformType, AnimeStatus } from '../auth/types';

export type SyncJobType = 'progress' | 'status' | 'score' | 'score-clear' | 'add' | 'remove';

export interface SyncQueueInput {
  type: SyncJobType;
  platform: PlatformType;
  payload: SyncJobPayload;
}

export interface SyncQueueTarget {
  platform: PlatformType;
  animeId: string;
  localAnimeId?: string;
}

export type SyncJobState = 'pending' | 'running' | 'done' | 'dead';

export interface SyncJobPayload {
  animeId: string;
  /** Local tracking row ID used to discard jobs after untracking or re-adding. */
  localAnimeId?: string;
  /** Source identifiers retained when the destination ID cannot yet be mapped. */
  unresolvedPlatformIds?: Partial<Record<PlatformType, string>>;
  progress?: number;
  status?: AnimeStatus;
  score?: number;
}

export interface SyncJob {
  id: number;
  jobType: SyncJobType;
  platform: PlatformType;
  payload: SyncJobPayload;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  state: SyncJobState;
  createdAt: number;
  updatedAt: number;
}

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;

export type SyncJobExecutor = (job: SyncJob) => Promise<void>;

interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  failedByPlatform: Partial<Record<PlatformType, number>>;
  dead: number;
  deadByPlatform: Partial<Record<PlatformType, number>>;
}

class OfflineQueueService {
  private static instance: OfflineQueueService;
  private running = false;

  static getInstance(): OfflineQueueService {
    if (!OfflineQueueService.instance) {
      OfflineQueueService.instance = new OfflineQueueService();
    }
    return OfflineQueueService.instance;
  }

  /** Ensure the queue schema exists, then read diagnostics without mutating queue rows. */
  async getDiagnostics(
    limit = 100
  ): Promise<{ pending: number; running: number; dead: number; jobs: SyncJob[] }> {
    await LocalDB.getDatabase();
    const file = new File(SQLite.defaultDatabaseDirectory, LOCAL_DB_NAME);
    if (!file.exists) throw new Error('Local database unavailable');
    const db = await SQLite.openDatabaseAsync(LOCAL_DB_NAME, { useNewConnection: true });
    try {
      await db.execAsync('PRAGMA query_only = ON');
      const counts = await db.getFirstAsync<{ pending: number; running: number; dead: number }>(
        `SELECT SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN state = 'running' THEN 1 ELSE 0 END) AS running,
                SUM(CASE WHEN state = 'dead' THEN 1 ELSE 0 END) AS dead FROM sync_jobs`
      );
      const rows = await db.getAllAsync<{
        id: number;
        job_type: string;
        platform: string;
        payload: string;
        attempts: number;
        next_attempt_at: number;
        last_error: string | null;
        state: string;
        created_at: number;
        updated_at: number;
      }>(
        `SELECT id, job_type, platform, payload, attempts, next_attempt_at,
                last_error, state, created_at, updated_at
         FROM sync_jobs WHERE state = 'dead' ORDER BY updated_at DESC LIMIT ?`,
        limit
      );
      return {
        pending: counts?.pending ?? 0,
        running: counts?.running ?? 0,
        dead: counts?.dead ?? 0,
        jobs: rows.map(rowToJob),
      };
    } finally {
      await db.closeAsync();
    }
  }

  async enqueue(
    jobType: SyncJobType,
    platform: PlatformType,
    payload: SyncJobPayload
  ): Promise<number> {
    const db = await LocalDB.getDatabase();
    const now = Date.now();
    const result = await db.runAsync(
      `INSERT INTO sync_jobs
       (job_type, platform, payload, attempts, next_attempt_at, state, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)`,
      jobType,
      platform,
      JSON.stringify(payload),
      now,
      now,
      now
    );
    return result.lastInsertRowId;
  }

  async enqueueBatch(jobs: SyncQueueInput[]): Promise<void> {
    await this.enqueueBatchWithMutation(jobs, async () => undefined);
  }

  /** Run a local mutation and persist the resulting queue work in one transaction. */
  async mutateWithJobs(
    mutate: (tx: SQLite.SQLiteDatabase) => Promise<SyncQueueInput[]>,
    cancelTargets: SyncQueueTarget[] = []
  ): Promise<SyncQueueInput[]> {
    const db = await LocalDB.getDatabase();
    const now = Date.now();
    let effectiveJobs: SyncQueueInput[] = [];
    await db.withExclusiveTransactionAsync(async (tx) => {
      const jobs = await mutate(tx);
      const platforms = new Set([
        ...cancelTargets.map((target) => target.platform),
        ...jobs.map((job) => job.platform),
      ]);
      const pendingByPlatform = new Map<PlatformType, QueueRow[]>();
      for (const platform of platforms) {
        const rows = await tx.getAllAsync<QueueRow>(
          `SELECT id, job_type, payload, state FROM sync_jobs
           WHERE platform = ? AND state IN ('pending', 'dead', 'running')`,
          platform
        );
        pendingByPlatform.set(platform, rows);
      }

      const deleted = new Set<number>();
      const deleteRows = async (rows: QueueRow[]) => {
        for (const row of rows) {
          if (deleted.has(row.id)) continue;
          await tx.runAsync('DELETE FROM sync_jobs WHERE id = ?', row.id);
          deleted.add(row.id);
        }
      };

      for (const target of cancelTargets) {
        const rows = pendingByPlatform.get(target.platform) ?? [];
        await deleteRows(
          rows.filter(
            (row) =>
              payloadAnimeId(row.payload) === target.animeId ||
              (target.localAnimeId &&
                parsePayload(row.payload)?.localAnimeId === target.localAnimeId)
          )
        );
      }

      const toInsert: SyncQueueInput[] = [];
      for (const job of jobs) {
        const rows = pendingByPlatform.get(job.platform) ?? [];
        const sameAnime = rows.filter(
          (row) =>
            row.state !== 'running' &&
            !deleted.has(row.id) &&
            payloadAnimeId(row.payload) === job.payload.animeId
        );

        if (job.type === 'status') {
          const queuedAdds = sameAnime
            .filter((row) => row.job_type === 'add')
            .sort((a, b) => b.id - a.id);
          const queuedAdd = queuedAdds[0];
          if (queuedAdd && job.payload.status) {
            const payload = parsePayload(queuedAdd.payload);
            if (payload) {
              await tx.runAsync(
                "UPDATE sync_jobs SET payload = ?, state = 'pending', attempts = 0, last_error = NULL, next_attempt_at = ?, updated_at = ? WHERE id = ?",
                JSON.stringify({ ...payload, status: job.payload.status }),
                now,
                now,
                queuedAdd.id
              );
              await deleteRows([
                ...queuedAdds.slice(1),
                ...sameAnime.filter((row) => row.job_type === 'status'),
              ]);
              effectiveJobs.push({
                type: 'add',
                platform: job.platform,
                payload: { ...payload, status: job.payload.status },
              });
              continue;
            }
          }
        }

        await deleteRows(sameAnime.filter((row) => isSupersededBy(row.job_type, job.type)));
        toInsert.push(job);
        effectiveJobs.push(job);
      }

      for (const target of cancelTargets) {
        const rows = pendingByPlatform.get(target.platform) ?? [];
        for (const row of rows) {
          const payload = parsePayload(row.payload);
          if (
            payload?.localAnimeId &&
            (payload.animeId === target.animeId || payload.localAnimeId === target.localAnimeId)
          ) {
            await tx.runAsync(
              'DELETE FROM sync_dirty_records WHERE anime_id = ? AND platform = ?',
              payload.localAnimeId,
              target.platform
            );
          }
        }
      }
      for (const job of effectiveJobs) {
        if (!job.payload.localAnimeId) continue;
        if (job.type === 'remove' || (job.type === 'add' && toInsert.includes(job))) {
          await tx.runAsync(
            'DELETE FROM sync_dirty_records WHERE anime_id = ? AND platform = ?',
            job.payload.localAnimeId,
            job.platform
          );
        }
        const field = dirtyField(job.type);
        await tx.runAsync(
          `INSERT INTO sync_dirty_records (anime_id, platform, field, marked_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(anime_id, platform, field) DO UPDATE SET marked_at = excluded.marked_at`,
          job.payload.localAnimeId,
          job.platform,
          field,
          now
        );
      }
      for (const job of toInsert) {
        await tx.runAsync(
          `INSERT INTO sync_jobs
           (job_type, platform, payload, attempts, next_attempt_at, state, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)`,
          job.type,
          job.platform,
          JSON.stringify(job.payload),
          now,
          now,
          now
        );
      }
    });
    return effectiveJobs;
  }

  /** Insert queue work atomically with the local change it represents. */
  async enqueueBatchWithMutation(
    jobs: SyncQueueInput[],
    mutate: (tx: SQLite.SQLiteDatabase) => Promise<void>,
    cancelTargets: SyncQueueTarget[] = []
  ): Promise<void> {
    await this.mutateWithJobs(async (tx) => {
      await mutate(tx);
      return jobs;
    }, cancelTargets);
  }

  async listPending(now: number = Date.now(), limit = 50): Promise<SyncJob[]> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{
      id: number;
      job_type: string;
      platform: string;
      payload: string;
      attempts: number;
      next_attempt_at: number;
      last_error: string | null;
      state: string;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT id, job_type, platform, payload, attempts, next_attempt_at,
              last_error, state, created_at, updated_at
       FROM sync_jobs AS job
       WHERE state = 'pending' AND next_attempt_at <= ?
         AND NOT EXISTS (
           SELECT 1 FROM sync_jobs AS prior
           WHERE prior.platform = job.platform AND prior.id < job.id
             AND prior.job_type = 'add' AND prior.state IN ('pending', 'running', 'dead')
             AND CASE WHEN json_valid(prior.payload) AND json_valid(job.payload)
               THEN json_extract(prior.payload, '$.animeId') = json_extract(job.payload, '$.animeId')
               ELSE 0 END
         )
         AND NOT EXISTS (
           SELECT 1 FROM sync_jobs AS prior
           WHERE job.job_type = 'add' AND prior.platform = job.platform AND prior.id < job.id
             AND prior.job_type = 'remove' AND prior.state IN ('pending', 'running', 'dead')
             AND CASE WHEN json_valid(prior.payload) AND json_valid(job.payload)
               THEN json_extract(prior.payload, '$.animeId') = json_extract(job.payload, '$.animeId')
               ELSE 0 END
         )
       ORDER BY next_attempt_at ASC, id ASC
       LIMIT ?`,
      now,
      limit
    );

    return rows.map(rowToJob);
  }

  async getDeadLetter(limit = 100): Promise<SyncJob[]> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{
      id: number;
      job_type: string;
      platform: string;
      payload: string;
      attempts: number;
      next_attempt_at: number;
      last_error: string | null;
      state: string;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT id, job_type, platform, payload, attempts, next_attempt_at,
              last_error, state, created_at, updated_at
       FROM sync_jobs WHERE state = 'dead'
       ORDER BY updated_at DESC LIMIT ?`,
      limit
    );
    return rows.map(rowToJob);
  }

  async pendingCount(): Promise<number> {
    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_jobs WHERE state = 'pending'`
    );
    return row?.count ?? 0;
  }

  async deadCount(): Promise<number> {
    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_jobs WHERE state = 'dead'`
    );
    return row?.count ?? 0;
  }

  async getOutstandingByPlatform(): Promise<
    Partial<Record<PlatformType, { pending: number; running: number; dead: number }>>
  > {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{ platform: string; state: string; count: number }>(
      `SELECT platform, state, COUNT(*) AS count
       FROM sync_jobs
       WHERE state IN ('pending', 'running', 'dead')
       GROUP BY platform, state`
    );
    const summary: Partial<
      Record<PlatformType, { pending: number; running: number; dead: number }>
    > = {};
    for (const row of rows) {
      const platform = row.platform as PlatformType;
      const counts = summary[platform] ?? { pending: 0, running: 0, dead: 0 };
      if (row.state === 'pending' || row.state === 'running' || row.state === 'dead') {
        counts[row.state] = row.count;
      }
      summary[platform] = counts;
    }
    return summary;
  }

  async retryDead(jobId: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE sync_jobs
       SET state = 'pending', attempts = 0, last_error = NULL,
           next_attempt_at = ?, updated_at = ?
       WHERE id = ?`,
      Date.now(),
      Date.now(),
      jobId
    );
  }

  async removeJob(jobId: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(`DELETE FROM sync_jobs WHERE id = ?`, jobId);
  }

  async purgeCompleted(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const db = await LocalDB.getDatabase();
    const cutoff = Date.now() - olderThanMs;
    const result = await db.runAsync(
      `DELETE FROM sync_jobs WHERE state = 'done' AND updated_at < ?`,
      cutoff
    );
    return result.changes;
  }

  async drain(executor: SyncJobExecutor, batchSize = 25): Promise<ProcessResult> {
    if (this.running) {
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        failedByPlatform: {},
        dead: 0,
        deadByPlatform: {},
      };
    }
    this.running = true;
    const summary: ProcessResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      failedByPlatform: {},
      dead: 0,
      deadByPlatform: {},
    };

    try {
      await this.recoverInterruptedJobs();
      while (true) {
        const batch = await this.listPending(Date.now(), batchSize);
        if (batch.length === 0) break;

        for (const candidate of batch) {
          const job = await this.markRunning(candidate.id);
          if (!job) continue;
          summary.processed += 1;
          try {
            await executor(job);
            await this.markDone(job);
            summary.succeeded += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const nextAttempts = job.attempts + 1;
            if (nextAttempts >= MAX_ATTEMPTS) {
              await this.markDead(job.id, nextAttempts, message);
              summary.dead += 1;
              summary.deadByPlatform[job.platform] =
                (summary.deadByPlatform[job.platform] ?? 0) + 1;
            } else {
              await this.markFailed(job.id, nextAttempts, message);
              summary.failed += 1;
              summary.failedByPlatform[job.platform] =
                (summary.failedByPlatform[job.platform] ?? 0) + 1;
            }
          }
        }
      }
    } finally {
      this.running = false;
    }

    return summary;
  }

  private async recoverInterruptedJobs(): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const rows = await tx.getAllAsync<QueueRow & { platform: PlatformType }>(
        `SELECT id, job_type, platform, payload, state FROM sync_jobs WHERE state = 'running'`
      );
      for (const row of rows) {
        if (await this.hasNewerReplacement(tx, row)) {
          await tx.runAsync('DELETE FROM sync_jobs WHERE id = ?', row.id);
        } else {
          await tx.runAsync(
            `UPDATE sync_jobs SET state = 'pending', updated_at = ? WHERE id = ? AND state = 'running'`,
            Date.now(),
            row.id
          );
        }
      }
    });
  }

  private async hasNewerReplacement(
    tx: SQLite.SQLiteDatabase,
    row: QueueRow & { platform: PlatformType }
  ): Promise<boolean> {
    const newer = await tx.getAllAsync<QueueRow>(
      'SELECT id, job_type, payload, state FROM sync_jobs WHERE platform = ? AND id > ?',
      row.platform,
      row.id
    );
    const animeId = payloadAnimeId(row.payload);
    return (
      animeId !== undefined &&
      newer.some(
        (candidate) =>
          payloadAnimeId(candidate.payload) === animeId &&
          !(row.job_type === 'remove' && candidate.job_type === 'add') &&
          isSupersededBy(row.job_type, candidate.job_type as SyncJobType)
      )
    );
  }

  private async markRunning(jobId: number): Promise<SyncJob | null> {
    const db = await LocalDB.getDatabase();
    let claimed: SyncJob | null = null;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const result = await tx.runAsync(
        `UPDATE sync_jobs SET state = 'running', updated_at = ? WHERE id = ? AND state = 'pending'`,
        Date.now(),
        jobId
      );
      if (result.changes !== 1) return;
      const row = await tx.getFirstAsync<Parameters<typeof rowToJob>[0]>(
        'SELECT * FROM sync_jobs WHERE id = ?',
        jobId
      );
      if (row) claimed = rowToJob(row);
    });
    return claimed;
  }

  private async markDone(job: SyncJob): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const result = await tx.runAsync(
        `UPDATE sync_jobs SET state = 'done', updated_at = ? WHERE id = ? AND state = 'running'`,
        Date.now(),
        job.id
      );
      if (result.changes !== 1 || !job.payload.localAnimeId) return;
      const field = dirtyField(job.jobType);
      const remaining = await tx.getAllAsync<QueueRow>(
        `SELECT id, job_type, payload, state FROM sync_jobs WHERE platform = ? AND state IN ('pending', 'running', 'dead')`,
        job.platform
      );
      const stillDirty = remaining.some((row) => {
        const payload = parsePayload(row.payload);
        return (
          payload?.localAnimeId === job.payload.localAnimeId &&
          dirtyField(row.job_type as SyncJobType) === field
        );
      });
      if (!stillDirty) {
        await tx.runAsync(
          'DELETE FROM sync_dirty_records WHERE anime_id = ? AND platform = ? AND field = ?',
          job.payload.localAnimeId,
          job.platform,
          field
        );
      }
    });
  }

  private async markFailed(jobId: number, attempts: number, error: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
    const next = Date.now() + backoff;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const row = await tx.getFirstAsync<QueueRow & { platform: PlatformType }>(
        `SELECT id, job_type, platform, payload, state FROM sync_jobs WHERE id = ? AND state = 'running'`,
        jobId
      );
      if (!row) return;
      if (await this.hasNewerReplacement(tx, row)) {
        await tx.runAsync('DELETE FROM sync_jobs WHERE id = ?', jobId);
      } else {
        await tx.runAsync(
          `UPDATE sync_jobs SET state = 'pending', attempts = ?, last_error = ?,
           next_attempt_at = ?, updated_at = ? WHERE id = ? AND state = 'running'`,
          attempts,
          error,
          next,
          Date.now(),
          jobId
        );
      }
    });
  }

  private async markDead(jobId: number, attempts: number, error: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const row = await tx.getFirstAsync<QueueRow & { platform: PlatformType }>(
        `SELECT id, job_type, platform, payload, state FROM sync_jobs WHERE id = ? AND state = 'running'`,
        jobId
      );
      if (!row) return;
      if (await this.hasNewerReplacement(tx, row)) {
        await tx.runAsync('DELETE FROM sync_jobs WHERE id = ?', jobId);
      } else {
        await tx.runAsync(
          `UPDATE sync_jobs SET state = 'dead', attempts = ?, last_error = ?, updated_at = ?
           WHERE id = ? AND state = 'running'`,
          attempts,
          error,
          Date.now(),
          jobId
        );
      }
    });
  }
}

interface QueueRow {
  id: number;
  job_type: string;
  payload: string;
  state: string;
}

function parsePayload(raw: string): SyncJobPayload | null {
  try {
    const payload: unknown = JSON.parse(raw);
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as SyncJobPayload)
      : null;
  } catch {
    return null;
  }
}

function payloadAnimeId(raw: string): string | undefined {
  const payload = parsePayload(raw);
  return typeof payload?.animeId === 'string' ? payload.animeId : undefined;
}

function dirtyField(type: SyncJobType): 'progress' | 'status' | 'score' | 'all' {
  if (type === 'remove') return 'all';
  if (type === 'add') return 'status';
  if (type === 'score-clear') return 'score';
  return type;
}

function isSupersededBy(existingType: string, nextType: SyncJobType): boolean {
  if (nextType === 'add' || nextType === 'remove') return true;
  if (nextType === 'score' || nextType === 'score-clear') {
    return existingType === 'score' || existingType === 'score-clear';
  }
  return existingType === nextType;
}

function rowToJob(row: {
  id: number;
  job_type: string;
  platform: string;
  payload: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  state: string;
  created_at: number;
  updated_at: number;
}): SyncJob {
  let payload: SyncJobPayload;
  try {
    payload = JSON.parse(row.payload) as SyncJobPayload;
  } catch {
    payload = { animeId: '' };
  }
  return {
    id: row.id,
    jobType: row.job_type as SyncJobType,
    platform: row.platform as PlatformType,
    payload,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error ?? undefined,
    state: row.state as SyncJobState,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const offlineQueueService = OfflineQueueService.getInstance();

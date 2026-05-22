import { describe, it, expect, beforeEach, mock } from 'bun:test';

import {
  AutoBackupScheduler,
  type AutoBackupPrefs,
} from '../../../libs/services/backup/auto-backup';

interface FakeStorage {
  data: Map<string, string>;
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem(k: string): Promise<void>;
}

function makeFakeStorage(): FakeStorage {
  const data = new Map<string, string>();
  return {
    data,
    async getItem(k) {
      return data.get(k) ?? null;
    },
    async setItem(k, v) {
      data.set(k, v);
    },
    async removeItem(k) {
      data.delete(k);
    },
  };
}

describe('backup/auto-backup', () => {
  const NOW = 1_700_000_000_000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  let upload: ReturnType<typeof mock>;
  let storage: FakeStorage;

  beforeEach(() => {
    upload = mock(async () => undefined);
    storage = makeFakeStorage();
  });

  it('AUTO-001 maybeRun is a no-op when auto-backup is disabled', async () => {
    const prefs: AutoBackupPrefs = { enabled: false, intervalHours: 24 };
    const sched = new AutoBackupScheduler({
      storage,
      onBackup: upload as unknown as () => Promise<void>,
      now: () => NOW,
    });
    await sched.maybeRun(prefs);
    expect(upload).not.toHaveBeenCalled();
  });

  it('AUTO-002 maybeRun fires when no previous backup is recorded', async () => {
    const prefs: AutoBackupPrefs = { enabled: true, intervalHours: 24 };
    const sched = new AutoBackupScheduler({
      storage,
      onBackup: upload as unknown as () => Promise<void>,
      now: () => NOW,
    });
    await sched.maybeRun(prefs);
    expect(upload).toHaveBeenCalledTimes(1);
    const persisted = await storage.getItem('aniseekr.cloud.autoBackup.lastRunAt');
    expect(persisted).toBe(String(NOW));
  });

  it('AUTO-003 maybeRun skips when last backup is within the interval window', async () => {
    await storage.setItem('aniseekr.cloud.autoBackup.lastRunAt', String(NOW - 3 * 60 * 60 * 1000));
    const prefs: AutoBackupPrefs = { enabled: true, intervalHours: 24 };
    const sched = new AutoBackupScheduler({
      storage,
      onBackup: upload as unknown as () => Promise<void>,
      now: () => NOW,
    });
    await sched.maybeRun(prefs);
    expect(upload).not.toHaveBeenCalled();
  });

  it('AUTO-004 maybeRun fires when last backup is older than the interval', async () => {
    await storage.setItem(
      'aniseekr.cloud.autoBackup.lastRunAt',
      String(NOW - 2 * ONE_DAY_MS) // 2 days ago
    );
    const prefs: AutoBackupPrefs = { enabled: true, intervalHours: 24 };
    const sched = new AutoBackupScheduler({
      storage,
      onBackup: upload as unknown as () => Promise<void>,
      now: () => NOW,
    });
    await sched.maybeRun(prefs);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('AUTO-005 maybeRun records the failure timestamp but does NOT update lastRunAt on error', async () => {
    upload = mock(async () => {
      throw new Error('network down');
    });
    const prefs: AutoBackupPrefs = { enabled: true, intervalHours: 24 };
    const sched = new AutoBackupScheduler({
      storage,
      onBackup: upload as unknown as () => Promise<void>,
      now: () => NOW,
    });
    await sched.maybeRun(prefs);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await storage.getItem('aniseekr.cloud.autoBackup.lastRunAt')).toBeNull();
    expect(await storage.getItem('aniseekr.cloud.autoBackup.lastError')).toContain('network down');
  });

  it('AUTO-006 prefs load defaults to enabled=false and interval=24h', async () => {
    const sched = new AutoBackupScheduler({
      storage,
      onBackup: upload as unknown as () => Promise<void>,
    });
    expect(await sched.loadPrefs()).toEqual({ enabled: false, intervalHours: 24 });
  });

  it('AUTO-007 savePrefs round-trips', async () => {
    const sched = new AutoBackupScheduler({
      storage,
      onBackup: upload as unknown as () => Promise<void>,
    });
    await sched.savePrefs({ enabled: true, intervalHours: 6 });
    expect(await sched.loadPrefs()).toEqual({ enabled: true, intervalHours: 6 });
  });
});

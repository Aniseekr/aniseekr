// CloudKit live-sync coordinator.
//
// This sits on top of:
//   - BackupService (read/write the SQLite tables on this device)
//   - The native CloudKit bridge (read/write the user's iCloud private DB)
//   - The cloudkit-converter (mapping between the two shapes)
//
// It exposes three high-level ops:
//   - pull(): CloudKit → local. Treats whatever is in CloudKit as authoritative.
//   - push(): local → CloudKit. Treats the local snapshot as authoritative.
//   - sync(): push, then pull. Converges both sides. Last-writer-wins per
//             recordName, since the underlying CKModifyRecordsOperation uses
//             `.changedKeys` save policy. Adequate for BYOD where the user
//             only has one writer at a time in practice; a future iteration
//             can layer real conflict resolution on top.
//
// On Android (no bridge), every method short-circuits to a clean
// "not-available" error so the UI can gate on `isAvailable()` and hide the
// CloudKit section entirely.

import type { BackupService, RestoreSummary } from './backup-service';
import {
  cloudKitRecordsToEnvelope,
  envelopeToCloudKitRecords,
  type CloudKitRecord,
} from './cloudkit-converter';

export type CloudKitAvailability = 'unavailable' | 'no-account' | 'ready';

export interface CloudKitBridgeLike {
  isInstalled(): boolean;
  getAvailability(): Promise<CloudKitAvailability>;
  fetchAllRecords(): Promise<CloudKitRecord[]>;
  writeRecords(records: CloudKitRecord[]): Promise<{ written: number; failed: number }>;
  deleteAllRecords(): Promise<{ deleted: number }>;
}

export interface CloudKitLiveSyncOptions {
  bridge: CloudKitBridgeLike;
  backupService: BackupService;
}

export class CloudKitLiveSync {
  private readonly bridge: CloudKitBridgeLike;
  private readonly backup: BackupService;

  constructor(opts: CloudKitLiveSyncOptions) {
    this.bridge = opts.bridge;
    this.backup = opts.backupService;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.bridge.isInstalled()) return false;
    const a = await this.bridge.getAvailability();
    return a === 'ready';
  }

  async pull(): Promise<RestoreSummary> {
    await this.ensureReady();
    const records = await this.bridge.fetchAllRecords();
    const env = cloudKitRecordsToEnvelope(records);
    return this.backup.restoreSnapshot(env);
  }

  async push(): Promise<{ written: number; failed: number }> {
    await this.ensureReady();
    const env = await this.backup.createSnapshot();
    const records = envelopeToCloudKitRecords(env);
    return this.bridge.writeRecords(records);
  }

  async sync(): Promise<{ pushed: number; pulled: RestoreSummary }> {
    await this.ensureReady();
    const pushResult = await this.push();
    const pullResult = await this.pull();
    return { pushed: pushResult.written, pulled: pullResult };
  }

  private async ensureReady(): Promise<void> {
    const ok = await this.isAvailable();
    if (!ok) throw new Error('CloudKit not available on this device');
  }
}

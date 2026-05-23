// CloudKit live-sync coordinator.
//
// This sits on top of:
//   - BackupService (read/write the SQLite tables on this device)
//   - The native CloudKit bridge (read/write the user's iCloud private DB
//                                 AND read the legacy SwiftUI app's
//                                 migration_v1_v2_data UserDefaults blob)
//   - cloudkit-converter (mapping between CloudKit records and the envelope)
//   - legacy-swiftdata   (mapping the migration blob into the envelope,
//                         reusing the legacy-aniseeker importer)
//
// It exposes:
//   - pull(): CloudKit → local. Treats whatever is in CloudKit as authoritative.
//   - push(): local → CloudKit. Treats the local snapshot as authoritative.
//   - sync(): push, then pull. Converges both sides. Last-writer-wins per
//             recordName, since the underlying CKModifyRecordsOperation uses
//             `.changedKeys` save policy.
//   - fetchLegacySnapshot(): probe whether the user has the legacy SwiftUI
//             app's `migration_v1_v2_data` minimal recovery blob.
//   - dryRunLegacy() / pullLegacy(): one-shot migration of that blob into
//             the new app's local DB. Strictly one-shot: after a successful
//             pull, the bridge persists a flag so the snapshot's
//             `alreadyImported` is true on subsequent probes and the UI hides
//             the migration banner.
//
// On Android (no bridge), every method that touches the native side
// short-circuits to a clean "not available" so the UI can hide the section.

import type { BackupService, RestoreDiff, RestoreSummary } from './backup-service';
import {
  cloudKitRecordsToEnvelope,
  envelopeToCloudKitRecords,
  type CloudKitRecord,
} from './cloudkit-converter';
import {
  hasLegacyContent,
  swiftDataSnapshotToEnvelope,
  type LegacySwiftDataSnapshot,
} from './legacy-swiftdata';

export type CloudKitAvailability = 'unavailable' | 'no-account' | 'ready';

export interface CloudKitBridgeLike {
  isInstalled(): boolean;
  getAvailability(): Promise<CloudKitAvailability>;
  fetchAllRecords(): Promise<CloudKitRecord[]>;
  writeRecords(records: CloudKitRecord[]): Promise<{ written: number; failed: number }>;
  deleteAllRecords(): Promise<{ deleted: number }>;
  fetchLegacySwiftDataStore(): Promise<LegacySwiftDataSnapshot>;
  markLegacyStoreImported(): Promise<void>;
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

  // ---------- Legacy aniseeker migration blob (one-shot migration) ----------

  // Probe the legacy migration blob without touching local state. Safe to call on every
  // backup-screen mount. Returns null only when the platform doesn't support
  // it at all (Android, missing native module); otherwise returns a snapshot
  // whose `hasStore` / `alreadyImported` flags tell the caller whether a
  // migration banner is warranted.
  async fetchLegacySnapshot(): Promise<LegacySwiftDataSnapshot | null> {
    if (!this.bridge.isInstalled()) return null;
    try {
      return await this.bridge.fetchLegacySwiftDataStore();
    } catch {
      // The bridge throws on genuine decode/read errors.
      // Treat that as "nothing to migrate" so we don't break the rest of the
      // backup screen.
      return null;
    }
  }

  // True iff a one-shot migration is *available* right now: the blob exists,
  // hasn't been imported yet, and contains at least one item. UI uses this to
  // decide whether to show the migration banner.
  async hasPendingLegacyMigration(): Promise<boolean> {
    const snap = await this.fetchLegacySnapshot();
    if (!snap || snap.alreadyImported) return false;
    return hasLegacyContent(snap);
  }

  // Produce a diff of what `pullLegacy()` would do, without writing anything.
  // Mirrors the dry-run on the cloud-restore path so the UI can show the user
  // exactly how many rows will be added or changed before they commit.
  async dryRunLegacy(): Promise<{ diff: RestoreDiff; snapshot: LegacySwiftDataSnapshot } | null> {
    const snap = await this.fetchLegacySnapshot();
    if (!snap || !hasLegacyContent(snap)) return null;
    const env = swiftDataSnapshotToEnvelope(snap);
    const diff = await this.backup.dryRunRestore(env);
    return { diff, snapshot: snap };
  }

  // Restore the legacy migration blob into the local DB. Idempotent on the
  // BackupService side (INSERT OR REPLACE), but ALSO persists a "done" flag
  // on the native side so this never auto-runs twice. Callers should gate on
  // `hasPendingLegacyMigration()` to hide the entry point after the first
  // successful pull.
  async pullLegacy(): Promise<RestoreSummary | null> {
    const snap = await this.fetchLegacySnapshot();
    if (!snap || !hasLegacyContent(snap)) return null;
    const env = swiftDataSnapshotToEnvelope(snap);
    const summary = await this.backup.restoreSnapshot(env);
    // Mark imported only AFTER restoreSnapshot resolves — if the SQLite write
    // throws partway through, the flag stays unset and the user can retry.
    await this.bridge.markLegacyStoreImported();
    return summary;
  }

  private async ensureReady(): Promise<void> {
    const ok = await this.isAvailable();
    if (!ok) throw new Error('CloudKit not available on this device');
  }
}
